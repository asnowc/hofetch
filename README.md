## hofetch

hofetch 是 基于 fetch 的 http 请求库

## Usage

```ts
import hoFetch from "@asla/hoFetch";
```

```ts
const { status, bodyData, headers } = await hoFetch.fetch("/test?p1=9", {
  method: "abc",
  body: { key: 1234 },
  params: { search: "abc" },
});
```

如果 fetch 返回的 Response 对象的 `Response.ok` 为 false, 将抛出 `HoFetchStatusError`
可以设置 ignoreFailedStatus 为 true 可以忽略该行为

```ts
await hoFetch.fetch("/test", { ignoreFailedStatus: true });
```

### 自定义解析 Body

默认情况下，能够自动解析 `application/json` 和 `text/plain` 的响应主体。是未知的 content-type, bodyData 会是 `ReadableStream<Uint8Array>` 类型, 可以通过 配置 HoFetchOptions 的 bodyParser 来更改这个行为

```ts
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
});
```

### FetchSuite

FetchSuite 通过将固定格式的类型转换为 api 类型，这样可以确保类型安全。
它需要和 Api 类型定义配合使用，单独使用没有意义

fetchSuite 单独使用

```ts
let suite = createFetchSuite(hoFetch, { basePath: "/base" });
await suite["/test"].fetchResult(); // POST /base/test
await suite["./test"].fetchResult(); // POST /base./test
await suite["/test"].post(); // POST /base/test
```

配合类型定义

```ts
export type ApiSuite = {
  /** 属性 */
  "GET base/r1": {
    /** 响应值 */
    response: undefined;
    params: {
      /** 77 */
      acc: number;
    };
  };
  "DELETE base/r1": {
    response: "ccc";
  };

  "POST base/r1": {
    yy: "";
  };
  "GET base/r2": {};
};

const api = createFetchSuite<ApiSuite>(hoFetch);

api["base/r1"].delete(undefined);
api["base/r1"].fetch();
api["base/r1"].delete({});

api["base/r1"].get({ params: { acc: 1 } });
//@ts-expect-error 参数不正确，需要 acc
api["base/r1"].get({});
//@ts-expect-error 参数不正确，需要 传入参数
api["base/r1"].get();

//@ts-expect-error 没有定义 unknown 方法
api["base/r1"].unknown;

api["cc"].fetch({}); // 没有定义 cc, 可以调用 request 方法
```

然后可以通过 文档生成工具，将 ApiSuite 类型生成 API 文档

### 中间件

```ts
hoFetch.use(function (ctx: HoContext, next) {
  if (ctx.headers.get("content-type") === "custom") {
    if (ctx.body instanceof Map) {
      ctx.body = Object.fromEntries(ctx.body);
    }
  }
  return next();
});
```
