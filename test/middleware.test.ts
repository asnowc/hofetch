import { test } from "./fixture/hofetch.ts";
import { type HoContext, HoFetchMiddlewareInternalError } from "../src/mod.ts";
import { expect } from "vitest";

test(
  "使用中间件，自定义解析 body 参数",
  async function ({ hoFetch, mockFetch }) {
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
  },
);
test("重复调用中间件的 next()", async function ({ hoFetch }) {
  let nextFn;
  hoFetch.use(function (ctx: HoContext, next) {
    nextFn = next;
    return next();
  });
  await hoFetch.fetch("/test");
  expect(nextFn).toThrowError(HoFetchMiddlewareInternalError);
});
