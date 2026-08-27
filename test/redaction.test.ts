import { describe, expect, it, vi } from "vitest";

/** Credentials must never reach logs, `fetch_run_companies.error`, or the runs
 *  API. Providers take keys as query parameters and phrase errors freely, so
 *  both the parameter shape and the literal value have to be covered. */
async function withKeys(keys: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, keys);
  return import("../src/util/http.js");
}

describe("credential redaction", () => {
  it("strips a secret however the provider phrases it", async () => {
    const secret = "SECRETKEY123456";
    const { redactUrl } = await withKeys({ MARKETAUX_API_KEY: secret });
    const cases = [
      `https://api.marketaux.com/v1/news/all?api_token=${secret}&symbols=AAPL`,
      `invalid_api_token: Your api_token ${secret} is not valid`,
      `unexpected text containing ${secret} inline`,
      `api_token=${secret}`,
    ];
    for (const text of cases) {
      expect(redactUrl(text), text).not.toContain(secret);
    }
  });

  it("leaves ordinary text alone", async () => {
    const { redactUrl } = await withKeys({ MARKETAUX_API_KEY: "SECRETKEY123456" });
    expect(redactUrl("a normal message with no secrets")).toBe("a normal message with no secrets");
  });

  it("never lets a secret reach an HttpError message", async () => {
    const secret = "FINNHUBKEY987654";
    const { HttpError } = await withKeys({ FINNHUB_API_KEY: secret });
    const error = new HttpError(500, `https://finnhub.io/api/v1/company-news?token=${secret}`, "boom");
    expect(error.message).not.toContain(secret);
    expect(error.url).not.toContain(secret);
  });
});
