import { HoResponse, type HttpBodyTransformer } from "./HoResponse.ts";

export type CreateHoFetchOption = {
  /**
   * 自定义 http body 解析。
   * `fetchResult()` 方法和 `createFetchSuite()` 将根据此配置解析 http body。
   */
  bodyParser?: Record<string, HttpBodyTransformer<any, ReadableStream<Uint8Array>>>;
  /** Fetch API */
  fetch?: (request: Request) => Promise<Response>;
  /**
   * @defaultValue globalThis.location?.origin
   */
  defaultOrigin?: string;
  /** 自定义异常 */
  createStatusError?: (hoResponse: HoResponse<unknown>) => Error | undefined;
};

//web api
const ReadableStream = globalThis.ReadableStream;
const Blob = globalThis.Blob;
const FormData = globalThis.FormData;

export class HoFetch {
  constructor(option: CreateHoFetchOption = {}) {
    this.#fetch = option.fetch ?? globalThis.fetch;
    this.#bodyParser = {
      "application/json": function (data, response) {
        return response.json();
      },
      "text/plain": function (data, response) {
        return response.text();
      },
      ...option.bodyParser,
    };
    const { createStatusError } = option;
    this.#middlewareLinkRoot = {
      async handler(request, next) {
        const hoResponse = await next();
        await hoResponse.parseBody();
        if (hoResponse.ok) return hoResponse;

        if (request.allowFailed) {
          if (request.allowFailed === true || request.allowFailed.includes(hoResponse.status)) return hoResponse;
        }
        let error: Error | undefined;
        if (createStatusError) error = createStatusError(hoResponse);
        throw error ?? new HoFetchStatusError(hoResponse);
      },
    };
    this.#middlewareLinkLast = this.#middlewareLinkRoot;

    this.#defaultOrigin = option.defaultOrigin ?? globalThis.location?.origin;
  }
  #fetch: (request: Request) => Promise<Response>;
  #defaultOrigin?: string;
  #bodyParser: Record<string, undefined | HttpBodyTransformer<unknown, ReadableStream<Uint8Array>>> = {};
  #middlewareLinkRoot: MiddlewareLink;
  #middlewareLinkLast: MiddlewareLink;

  fetch<Res = unknown>(pathOrUrl: string | URL, init?: HoFetchOption): Promise<HoResponse<Res>>;
  async fetch(requestUrl: string | URL, init: HoFetchOption = {}): Promise<HoResponse<any>> {
    let url: URL;
    try {
      url = new URL(requestUrl);
    } catch (error) {
      if (!this.#defaultOrigin) throw new Error("URL missing origin");
      let path = requestUrl as string;
      if (path[0] !== "/") path = "/" + path;
      url = new URL(this.#defaultOrigin + path);
    }
    const { body, params, method = "GET", allowFailed, ...reset } = init;
    const hoContext: HoContext = {
      ...reset,
      allowFailed,
      body,
      params,
      headers: new Headers(init.headers),
      method,
      url,
    };
    return this.#handlerMiddleware(this.#middlewareLinkRoot, {
      hoContext,
      fetchInit: reset,
    });
  }

  #handlerMiddleware(
    link: MiddlewareLink,
    context: InternalMiddlewareContext
  ): Promise<HoResponse<any>> | HoResponse<any> {
    const handler = link.handler;
    let called = false;
    const result = handler(context.hoContext, async () => {
      if (called) {
        throw new HoFetchMiddlewareInternalError("next hook already called");
      }
      called = true;
      if (link.next) return this.#handlerMiddleware(link.next, context);
      return this.#middlewareFinalFetch(context);
    });

    if (result instanceof Promise) return result.then((res) => this.#toHoResponse(res));
    return this.#toHoResponse(result);
  }
  #toHoResponse(res: unknown) {
    if (res instanceof HoResponse) return res;
    else if (res instanceof Response) return this.createHoResponse(res);

    throw new Error("The result must be an instance of Response or HoResponse");
  }
  createHoResponse(response: Response) {
    const hoResponse = new HoResponse(response);
    const contentType = hoResponse.headers.get("content-type");

    if (contentType) {
      let key = contentType;
      let i = contentType.indexOf(";");
      if (i > 0) key = contentType.slice(0, i);
      const bodyParser = this.#bodyParser[key];
      if (bodyParser) hoResponse.useBodyTransform(bodyParser);
    }
    return hoResponse;
  }
  async #middlewareFinalFetch(context: InternalMiddlewareContext) {
    const request = contextToRequest(context.hoContext, context.fetchInit);
    const fetch = this.#fetch;
    const response = await fetch(request);
    return this.createHoResponse(response);
  }
  use(handler: MiddlewareHandler) {
    const link: MiddlewareLink = {
      handler,
    };
    this.#middlewareLinkLast.next = link;
    this.#middlewareLinkLast = link;
  }
}

export type MiddlewareHandler = (
  context: HoContext,
  next: () => Promise<HoResponse>
) => Promise<HoResponse | Response> | HoResponse | Response;

type MiddlewareLink = {
  handler: MiddlewareHandler;
  next?: MiddlewareLink;
};
type InternalMiddlewareContext = {
  called?: boolean;
  hoContext: HoContext;
  fetchInit: any;
};

export type HoContext<Body = unknown, Param = unknown> = Omit<
  HoFetchOption,
  "body" | "params" | "headers" | "method"
> & {
  headers: Headers;
  url: URL;
  params: Param;
  method: string;
  body: Body;
};
export type URLParamsInit = ConstructorParameters<typeof URLSearchParams>[0];

export type HoFetchOption<Body = any, Param = any> = Omit<RequestInit, "body" | "window"> & {
  params?: Param;
  body?: Body;
  /**
   * 如果为 true, 则请求状态码如果失败，仍返回结果
   */
  allowFailed?: boolean | number[];
  [x: symbol]: any;
};

function contextToRequest(context: HoContext, init: HoFetchOption): Request {
  const url = context.url;
  if (context.params) patchParam(context.params, url.searchParams);

  let body: BodyInit | null | undefined;
  const rawBody = context.body;
  switch (typeof rawBody) {
    case "string":
      body = rawBody;
      break;
    case "object": {
      if (rawBody === null) break;
      if (isBodyInitObj(rawBody)) body = rawBody;
      else {
        body = JSON.stringify(context.body);
        if (!context.headers.has("content-type")) {
          context.headers.set("content-type", "application/json");
        }
      }
      break;
    }
    default:
      break;
  }

  return new Request(url, {
    ...init,
    method: context.method.toUpperCase(),
    body,
    headers: context.headers,
  });
}

function patchParam(from: any, to: URLSearchParams) {
  if (typeof from === "string") {
    mergeURLSearchParams(new URLSearchParams(from), to);
  } else if (typeof from === "object") {
    if (from instanceof URLSearchParams) {
      mergeURLSearchParams(from, to);
    } else {
      for (const k of Object.keys(from)) {
        const value = from[k];
        switch (typeof value) {
          case "string":
            to.append(k, value);
            break;
          case "number":
            to.append(k, value.toString());
            break;
          case "bigint":
            to.append(k, value.toString());
            break;
          case "boolean":
            to.append(k, value.toString());
            break;
          case "object": {
            if (value === null) break;
            if (value instanceof Array) {
              for (const item of value) to.append(k, item);
            }
            break;
          }
          default:
            break;
        }
      }
    }
  }
}
function mergeURLSearchParams(from: URLSearchParams, to: URLSearchParams) {
  for (const [k, v] of from as any) to.append(k, v);
}
function isBodyInitObj(obj: any) {
  return (
    obj instanceof ArrayBuffer ||
    obj instanceof Uint8Array ||
    obj instanceof ReadableStream ||
    obj instanceof Blob ||
    obj instanceof FormData
  );
}

export class HoFetchStatusError extends Error {
  constructor(hoResponse: HoResponse, message?: string) {
    let bodyMessage = hoResponse.bodyData ?? null;
    if (!message) {
      if (typeof bodyMessage === "object" && bodyMessage !== null) {
        const constructor = getConstructor(bodyMessage);
        if (constructor) message = constructor.name;
      } else message = `${hoResponse.status}: ` + bodyMessage;
    }

    super(message);
    this.headers = hoResponse.headers;
    this.status = hoResponse.status;
    this.body = bodyMessage;
  }
  body: unknown;
  headers: Headers;
  status: number;
}
export class HoFetchMiddlewareInternalError extends Error {}
function getConstructor(obj: object): Function | undefined {
  const proto = Reflect.getPrototypeOf(obj);
  if (!proto) return;
  const constructor = Reflect.get(proto, "constructor");
  if (typeof constructor !== "function") return;
  return constructor;
}
