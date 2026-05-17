import { expect } from "vitest";
import { test } from "../fixture/hofetch.ts";
import { HoFetch } from "@asla/hofetch";

test("默认能够解析带 application/json body", async function ({ hoFetch, mockFetch }) {
  mockFetch.mockImplementation(async () => {
    return Response.json({ a: 1, b: "a" });
  });
  const response = await hoFetch.fetch("/test", {});
  expect(response.bodyData, "bodyData 为 object 类型").toEqual({
    a: 1,
    b: "a",
  });
});

test("默认能够解析带 text/plain body", async function ({ hoFetch, mockFetch }) {
  mockFetch.mockImplementation(async () => {
    return new Response("text", {
      headers: { ["content-type"]: "text/plain" },
    });
  });
  const response = await hoFetch.fetch("/test", {});
  expect(response.bodyData, "bodyData 为 string 类型").toBe("text");
});

test("未知 content-type 响应头，response.bodyData 将是 ReadableStream<Uint8Array>", async function ({
  hoFetch,
  mockFetch,
}) {
  mockFetch.mockImplementation(async (url, request) => {
    if (url.toString().endsWith("custom")) {
      return new Response("abcd", { headers: { "content-type": "custom" } });
    }
    return new Response(new Uint8Array([1, 2, 3]));
  });

  const response = await hoFetch.fetch<ReadableStream<Uint8Array>>("/unknown", {});
  expect(response.bodyData).instanceof(ReadableStream);

  const response2 = await hoFetch.fetch<ReadableStream<Uint8Array>>("/custom", {});
  expect(response2.bodyData).instanceof(ReadableStream);
});
test("自定义 content-type 响应头解析器", async function ({ mockFetch }) {
  const hoFetch = new HoFetch({
    bodyParser: {
      "application/json": async (body, response) => {
        const json = await response.json();
        return new Map(Object.entries(json));
      },
      custom: (body, response) => {
        return decodeText(body);
      },
    },
    fetch: mockFetch,
    defaultOrigin: "http://localhost",
  });
  mockFetch.mockImplementation(async (url, request) => {
    if (url.toString().endsWith("json")) return Response.json({ k1: 1 });
    return new Response("abc", { headers: { "content-type": "custom" } });
  });

  const response = await hoFetch.fetch<ReadableStream<Uint8Array>>("/json", {});
  expect(response.bodyData, "自定义 json 解析器").instanceof(Map);

  const response2 = await hoFetch.fetch<ReadableStream<Uint8Array>>("/custom", {});
  expect(response2.bodyData, "自定义 custom 解析器").toBeTypeOf("string");
});
async function decodeText(stream: ReadableStream<Uint8Array>) {
  //@ts-ignore
  const textList = await Array.fromAsync(stream.pipeThrough(new TextDecoderStream()));
  return textList.join("");
}
