import { Mock, test as viTest, vi } from "vitest";
import { HoFetch } from "../../src/HoFetch.ts";
export type Context = {
  mockFetch: Mock<(request: Request) => Promise<Response>>;
  hoFetch: HoFetch;
};
export const test = viTest.extend<Context>({
  async mockFetch({}, use) {
    const m = vi.fn(() => Promise.resolve(new Response()));
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
