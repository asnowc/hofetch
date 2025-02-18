export class HoResponse<T = unknown> implements
  Pick<
    Response,
    "redirected" | "clone" | "ok" | "headers" | "status" | "statusText"
  > {
  constructor(response: Response) {
    this.#raw = response;
    this.ok = response.ok;
    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.#bodyData = this.#raw.body as any;
  }
  #raw: Response;
  static async parserResponseBody<T>(hoResponse: HoResponse<T>): Promise<T> {
    const response = hoResponse.#raw;
    if (response.bodyUsed) return hoResponse.bodyData;

    const transforms = hoResponse.#transformers;
    let data = hoResponse.#raw.body;
    if (!data) return undefined as T;

    for (let i = 0; i < transforms.length; i++) {
      data = await transforms[i](data, response);
    }
    hoResponse.#bodyData = data as T;
    hoResponse.#transformers.length = 0;

    return hoResponse.#bodyData;
  }
  #bodyData: T;
  get bodyData() {
    return this.#bodyData;
  }
  #transformers: ((body: any, res: Response) => any)[] = [];
  useBodyTransform<O>(
    bodyMidTransformer: HttpBodyTransformer<O, any>,
  ): HoResponse<O>;
  useBodyTransform(
    bodyMidTransformer: HttpBodyTransformer<any>,
  ): HoResponse<any> {
    this.#transformers.push(bodyMidTransformer);
    return this;
  }
  get redirected() {
    return this.#raw.redirected;
  }
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;

  clone(): Response {
    return this.#raw.clone();
  }
  // #url?: URL;
  // get url() {
  //   return (this.#url ??= new URL(this.#raw.url));
  // }
}

export type HttpBodyTransformer<O, I = unknown> = (
  bodyData: I,
  response: Response,
) => Promise<O> | O;
