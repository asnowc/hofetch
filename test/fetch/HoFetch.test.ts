import { expect } from "vitest";
import { test } from "../fixture/hofetch.ts";
import { HoFetch, HoFetchStatusError, HoResponse } from "@asla/hofetch";

test("默认情况下，如果响应不成功的状态码，应抛出异常", async function ({ hoFetch, mockFetch }) {
  mockFetch.mockImplementation(async () => {
    return new Response(null, { status: 404 });
  });
  await expect(hoFetch.fetch("/test"), "Response.ok 为 false 应抛出异常").rejects.toThrowError(HoFetchStatusError);
  await expect(hoFetch.fetch("/test", { allowFailed: true })).resolves.instanceof(HoResponse);
  await expect(hoFetch.fetch("/test", { allowFailed: [404] })).resolves.instanceof(HoResponse);
  await expect(hoFetch.fetch("/test", { allowFailed: [401] })).rejects.toThrowError(HoFetchStatusError);
});

test("自定义异常", async function ({ mockFetch }) {
  const hoFetch = new HoFetch({
    fetch: mockFetch,
    createStatusError(hoResponse) {
      if (hoResponse.status === 400 && typeof hoResponse.bodyData === "string") return new Error(hoResponse.bodyData);
    },
    defaultOrigin: "http://127.0.0.1",
  });
  mockFetch.mockImplementationOnce(async () => {
    return new Response("出错了", { status: 400, headers: { "content-type": "text/plain" } });
  });
  await expect(hoFetch.fetch("/test", {}), "bodyData 为 object 类型").rejects.toThrowError("出错了");

  mockFetch.mockImplementationOnce(async () => {
    return new Response("出错了", { status: 403, headers: { "content-type": "text/plain" } });
  });
  await expect(hoFetch.fetch("/test", {}), "bodyData 为 object 类型").rejects.toThrowError(HoFetchStatusError);
});
