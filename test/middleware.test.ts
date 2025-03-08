import { test } from "./fixture/hofetch.ts";
import { type HoContext, HoFetchMiddlewareInternalError } from "../src/mod.ts";
import { expect } from "vitest";

test("使用中间件，自定义解析 body 参数", async function ({ hoFetch, mockFetch }) {
  hoFetch.use(function (ctx: HoContext, next) {
    if (ctx.headers.get("content-type") === "custom") {
      if (ctx.body instanceof Map) {
        ctx.body = Object.fromEntries(ctx.body);
      }
    }
    return next();
  });
  await hoFetch.fetch("/test", {
    method: "POST",
    body: new Map([["k1", "v1"]]),
    headers: { "content-type": "custom" },
  });

  const req = mockFetch.mock.calls[0][0] as Request;
  await expect(req.text()).resolves.toBe(JSON.stringify({ k1: "v1" }));
});
test("重复调用中间件的 next()", async function ({ hoFetch }) {
  let nextFn;
  hoFetch.use(function (ctx: HoContext, next) {
    nextFn = next;
    return next();
  });
  await hoFetch.fetch("/test");
  await expect(nextFn).rejects.toThrowError(HoFetchMiddlewareInternalError);
});
test("中间件可以获取 FetchOption 的自定义 Symbol 字段", async function ({ hoFetch }) {
  const KEY = Symbol("key");
  hoFetch.use(function (ctx: HoContext, next) {
    if (ctx[KEY]) return new Response("yes", { headers: { "content-type": "text/plain" } });
    return new Response("no", { headers: { "content-type": "text/plain" } });
  });
  let res = await hoFetch.fetch("/test", { [KEY]: true });
  await expect(res.bodyData).toBe("yes");
  res = await hoFetch.fetch("/test", {});
  await expect(res.bodyData).toBe("no");
});
test("中间件不能返回必须返回非 Response 或 HoResponse 实例", async function ({ hoFetch }) {
  const KEY = Symbol("key");
  //@ts-expect-error
  hoFetch.use(function (ctx: HoContext, next) {
    return 123;
  });
  await expect(hoFetch.fetch("/test", { allowFailed: true })).rejects.toThrowError();
});
