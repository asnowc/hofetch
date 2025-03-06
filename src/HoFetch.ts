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
    this.#middlewareLinkRoot = {
      async handler(request, next) {
        const hoResponse = await next();
        await HoResponse.parserResponseBody(hoResponse);
        if (hoResponse.ok) return hoResponse;

        if (request.allowFailed) {
          if (request.allowFailed === true || request.allowFailed.includes(hoResponse.status)) return hoResponse;
        }
        throw new HoFetchStatusError(hoResponse);
      },
    };
    this.#middlewareLinkLast = this.#middlewareLinkRoot;

    this.#defaultOrigin = option.defaultOrigin ?? globalThis.location?.origin;
  }
  async parseBody<T = unknown>(response: Response): Promise<T> {
    if (!response.body) return undefined as T;
    let contentType = response.headers.get("content-type");
    if (contentType) {
      const i = contentType.indexOf(";");
      if (i > 0) contentType = contentType.slice(0, i);
    } else return response.body as T;

    const parser = this.#bodyParser[contentType];
    if (parser) return parser(response.body, response) as any;
    return response.body as T;
  }
  #fetch: (request: Request) => Promise<Response>;
  #defaultOrigin?: string;
  #bodyParser: Record<string, undefined | HttpBodyTransformer<unknown, ReadableStream<Uint8Array>>> = {};
  #middlewareLinkRoot: MiddlewareLink;
  #middlewareLinkLast: MiddlewareLink;

  fetch<Res = unknown>(pathOrUrl: string | URL, init?: HoFetchOption): Promise<HoResponse<Res>>;
  fetch(requestUrl: string | URL, init: HoFetchOption = {}): Promise<HoResponse<any>> {
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

  #createRequest(context: HoContext, init: HoFetchOption): Request {
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
  #handlerMiddleware(link: MiddlewareLink, context: InternalMiddlewareContext): Promise<HoResponse<any>> {
    const handler = link.handler;
    let called = false;
    return handler(context.hoContext, () => {
      if (called) {
        throw new HoFetchMiddlewareInternalError("next hook already called");
      }
      called = true;
      if (link.next) return this.#handlerMiddleware(link.next, context);
      return this.#middlewareFinalFetch(context);
    });
  }
  async #middlewareFinalFetch(context: InternalMiddlewareContext) {
    const request = this.#createRequest(context.hoContext, context.fetchInit);
    const fetch = this.#fetch;
    const response = await fetch(request);
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
  use(handler: MiddlewareHandler) {
    const link: MiddlewareLink = {
      handler,
    };
    this.#middlewareLinkLast.next = link;
    this.#middlewareLinkLast = link;
  }
}

export type MiddlewareHandler = (context: HoContext, next: () => Promise<HoResponse>) => Promise<HoResponse>;

type MiddlewareLink = {
  handler: MiddlewareHandler;
  next?: MiddlewareLink;
};
type InternalMiddlewareContext = {
  called?: boolean;
  hoContext: HoContext;
  fetchInit: any;
};

export interface HoContext<Body = unknown, Param = unknown> {
  allowFailed?: boolean | number[];
  headers: Headers;
  url: URL;
  params: Param;
  method: string;
  body: Body;
}
export type URLParamsInit = ConstructorParameters<typeof URLSearchParams>[0];

export type HoFetchOption<Body = any, Param = any> = Omit<RequestInit, "body" | "window"> & {
  params?: Param;
  body?: Body;
  /**
   * 如果为 true, 则请求状态码如果失败，仍返回结果
   */
  allowFailed?: boolean | number[];
};

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
  constructor(hoResponse: HoResponse) {
    super(`Http response is not ok status: ${hoResponse.status}`);
    this.headers = hoResponse.headers;
    this.status = hoResponse.status;
    this.body = hoResponse.bodyData;
  }
  body: unknown;
  headers: Headers;
  status: number;
}
export class HoFetchMiddlewareInternalError extends Error {}
