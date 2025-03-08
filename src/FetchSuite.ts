import type { HoFetch, HoFetchOption } from "./HoFetch.ts";
import type { HoResponse } from "./HoResponse.ts";

export type FetchSuite = {
  [x: string]: FetchSuiteBase & { [x: string]: FetchEndpoint };
};

export function createFetchSuite<T extends object>(
  fetchApi: HoFetch,
  option: { basePath?: string; origin?: string } = {},
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
    },
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
  async fetchResult<Res = unknown>(option?: FetchSuiteOption<any, any>): Promise<Res> {
    const { bodyData } = await this.fetch(option);
    return bodyData as Res;
  }
  fetch = <Res = unknown>(option?: FetchSuiteOption<any, any>): Promise<HoResponse<Res>> => {
    return this.#asFetch.fetch(this.#pathOrUrl, option);
  };
}

/** 推断 api 套件 */
export type InferFetchSuite<T extends object> = UnionToIntersection<ObjectValueOf<MapApiKey<T>>>;
/** 推断 api 路径组 */
export type InferFetchPath<T, Method extends string> = {
  [key in Method]: T extends {
    response?: any;
    params?: object;
    body?: any;
  }
    ? FetchEndpoint<T["response"], T["params"], T["body"]>
    : never;
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

export type FetchEndpoint<Res = unknown, Param = any, Body = any> =
  {} extends FetchSuiteOption<Param, Body>
    ? (option?: FetchSuiteOption<Param, Body>) => Promise<Res>
    : (option: FetchSuiteOption<Param, Body>) => Promise<Res>;

type HoFetchParams<Param = any, Body = any> = (undefined extends Param ? { params?: Param } : { params: Param }) &
  (undefined extends Body ? { body?: Body } : { body: Body });

export type FetchSuiteOption<Param = any, Body = any> = Omit<HoFetchOption, "body" | "params"> &
  HoFetchParams<Param, Body>;
