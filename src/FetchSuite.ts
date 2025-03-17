import type { HoFetch, HoFetchOption } from "./HoFetch.ts";
import type { HoResponse } from "./HoResponse.ts";

export type FetchSuite = {
  [x: string]: FetchSuiteBase & { [x: string]: FetchEndpoint };
};

export function createFetchSuite<T extends object>(
  fetchApi: HoFetch,
  option: { basePath?: string; origin?: string } = {}
): { [x: string]: FetchSuiteBase } & InferFetchSuite<T> {
  const { origin, basePath } = option;
  return new Proxy(
    {},
    {
      get(target, p, receiver) {
        if (typeof p !== "string") return undefined;
        if (basePath) p = basePath + p;
        let next: string | URL;
        if (origin) {
          next = new URL(origin);
          next.pathname = p;
        } else {
          next = p;
        }
        return createFetchSuiteProxy(fetchApi, next);
      },
    }
  ) as any;
}
function createFetchSuiteProxy(asFetch: HoFetch, path: string | URL) {
  return new Proxy(new FetchSuiteBase(asFetch, path), {
    get(target, p, receiver) {
      const exists = (target as any)[p];
      if (exists) return exists;
      if (typeof p !== "string") return undefined;
      return function (option: FetchSuiteOption) {
        return target.fetchResult({ ...option, method: p.toUpperCase() });
      };
    },
  }) as any;
}

export class FetchSuiteBase {
  constructor(asFetch: HoFetch, pathOrUrl: string | URL) {
    this.#asFetch = asFetch;
    this.#pathOrUrl = pathOrUrl;
  }
  #pathOrUrl: string | URL;
  #asFetch: HoFetch;
  async fetchResult<Res = unknown>(option?: FetchSuiteOption<any>): Promise<Res> {
    const { bodyData } = await this.fetch(option);
    return bodyData as Res;
  }
  fetch = <Res = unknown>(option?: FetchSuiteOption<any>): Promise<HoResponse<Res>> => {
    let url: string | URL = this.#pathOrUrl;
    const params = option?.params ?? {};
    if (params) {
      const replace = (pathname: string) => {
        return pathname.replace(/(?<=\/):([^/]+)/g, (match, p1) => {
          const param = params[p1];
          if (param === undefined) return match;
          return param;
        });
      };
      if (typeof url === "string") {
        url = replace(url);
      } else {
        url = new URL(url);
        url.pathname = replace(url.pathname);
      }
    }
    return this.#asFetch.fetch(url, option);
  };
}

/** 推断 api 套件 */
export type InferFetchSuite<T extends object> = UnionToIntersection<ObjectValueOf<MapApiKey<T>>>;
type EndpointInfo = {
  response?: any;
  query?: object;
  params?: object;
  body?: any;
};
/** 推断 api 路径组 */
export type InferFetchPath<T, Method extends string> = {
  [key in Method]: T extends EndpointInfo ? FetchEndpoint<T> : never;
} & FetchSuiteBase;

type MapApiKey<T extends object> = {
  [key in keyof T as key extends `${string} ${string}` ? key : never]: key extends `${infer Method} ${infer Path}`
    ? {
        [P in Path]: InferFetchPath<T[key], Lowercase<Method>>;
      }
    : never;
};
type ObjectValueOf<T extends object> = T[keyof T];

type ToUnionOfFunction<T> = T extends any ? (x: T) => any : never;
type UnionToIntersection<T> = ToUnionOfFunction<T> extends (x: infer P) => any ? P : never;

export type FetchEndpoint<Info extends EndpointInfo = EndpointInfo> = {} extends FetchSuiteOption<Info>
  ? (option?: FetchSuiteOption<Info>) => Promise<Info["response"]>
  : (option: FetchSuiteOption<Info>) => Promise<Info["response"]>;

type HoFetchParams<Query = any, Body = any, Param = any> = (undefined extends Query
  ? { query?: Query }
  : { query: Query }) &
  (undefined extends Body ? { body?: Body } : { body: Body }) &
  (undefined extends Param ? { params?: Param } : { params: Param });

export type FetchSuiteOption<Info extends EndpointInfo = EndpointInfo> = Omit<HoFetchOption, "body" | "query"> &
  HoFetchParams<Info["query"], Info["body"], Info["params"]>;
