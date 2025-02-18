import { createFetchSuite, FetchSuite, HoFetch } from "../src/mod.ts";
import { beforeEach, expect } from "vitest";
import { Context as BaseContext, test as baseTest } from "./fixture/hofetch.ts";

interface ExtraContext {
  fetchSuite: FetchSuite;
}
const test = baseTest.extend<ExtraContext>({
  fetchSuite({ hoFetch }, use) {
    const suite = createFetchSuite(hoFetch);
    return use(suite as FetchSuite);
  },
});
beforeEach<ExtraContext & BaseContext>(({ fetchSuite, mockFetch }) => {
  mockFetch.mockImplementation(async (req) => {
    const path = new URL(req.url).pathname;
    return Response.json({ path, method: req.method });
  });
});
test("createFetchSuite with basePath", async function ({ hoFetch, mockFetch }) {
  let suite = createFetchSuite(hoFetch, { basePath: "/base" });
  await expect(suite["/test"].fetchResult()).resolves.toMatchObject({
    path: "/base/test",
  });
  await expect(suite["./test"].fetchResult()).resolves.toMatchObject({
    path: "/base./test",
  });
});

test("FetchSuiteBase.fetchResult()", async function ({ fetchSuite }) {
  await expect(fetchSuite["/test"].fetchResult()).resolves.toMatchObject({
    path: "/test",
    method: "GET",
  });
  await expect(fetchSuite["/test"].post()).resolves.toMatchObject({
    path: "/test",
    method: "POST",
  });
});
test("FetchSuiteBase.fetch", async function ({ fetchSuite }) {
  const fetchRaw = await fetchSuite["/test"].fetch();
  await expect(fetchRaw.bodyData).toMatchObject({
    path: "/test",
    method: "GET",
  });
});
