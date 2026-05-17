import { expect, Mock } from "vitest";
import { test } from "../fixture/hofetch.ts";

test("请求与响应", async function ({ hoFetch, mockFetch }) {
  const response = await hoFetch.fetch("/test?p1=9", {
    method: "abc",
    body: { key: 1234 },
    query: { search: "abc" },
  });
  expect(response.status).toBe(200);

  const [url, request] = mockFetch.mock.calls[0];
  expect(url).instanceof(URL);
  expect(request.headers).instanceof(Headers);
  expect(url.search, "由默认转换器转换 query 参数").toBe("?p1=9&search=abc");
  expect(request.method).toBe("ABC");
  await expect(request.body, "由默认转换器转换 body 参数").toEqual('{"key":1234}');
});

test("可以传递 credentials", async function ({ hoFetch, mockFetch }) {
  const mocks = mockFetch.mock.calls;
  await hoFetch.fetch("/test", { credentials: "include" });
  await expect(mocks[0][1].credentials).toBe("include");

  await hoFetch.fetch("/test", { credentials: "omit" });
  await expect(mocks[1][1].credentials).toBe("omit");
});

function getSearch(mockFetch: Mock<(url: URL, request: RequestInit) => Promise<Response>>, index = 0) {
  const [url, request] = mockFetch.mock.calls[index];
  return new URL(url.toString()).searchParams;
}
test("query 参数和 path 的 searchparams 都会被添加", async function ({ hoFetch, mockFetch }) {
  const response = await hoFetch.fetch("/test?p1=9", { query: { p1: "10" } });
  const requestSearch = getSearch(mockFetch, 0);
  expect(requestSearch.toString(), "由默认转换器转换 query 参数").toBe("p1=9&p1=10");
});
test("query 参数 会覆盖 path 的 searchparams", async function ({ hoFetch, mockFetch }) {
  const response = await hoFetch.fetch("/test", { query: { p1: "10", boolean: true, items: [true, 1, "abc"] } });
  const requestSearch = getSearch(mockFetch, 0);
  expect(requestSearch.toString()).toBe("p1=10&boolean=true&items=true&items=1&items=abc");
});
