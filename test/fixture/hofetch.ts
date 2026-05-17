import { Mock, test as viTest, vi } from "vitest";
import { HoFetch } from "../../src/HoFetch.ts";
export type Context = {
  mockFetch: Mock<(url: URL, request: RequestInit) => Promise<Response>>;
  hoFetch: HoFetch;
};
export const test = viTest.extend<Context>({
  async mockFetch({}, use: any) {
    const m: Context["mockFetch"] = vi.fn(() => Promise.resolve(new Response()));
    return use(m);
  },
  async hoFetch({ mockFetch }, use) {
    const hoFetch = new HoFetch({
      fetch: mockFetch,
      defaultOrigin: "http://localhost",
    });
    await use(hoFetch);
  },
});
