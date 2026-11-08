import { describe, expect, it, vi } from "vitest";
import {
  OneClickClient,
  ONE_CLICK_DESTINATION_USDC,
  POPULAR_ONE_CLICK_ASSETS,
  isValidChainAddress,
  isQuoteExpired,
} from "../src/shared/one-click-client";

describe("NEAR Intents 1Click API Client", () => {
  it("exposes supported popular multichain assets", () => {
    expect(POPULAR_ONE_CLICK_ASSETS.length).toBeGreaterThanOrEqual(4);
    const symbols = POPULAR_ONE_CLICK_ASSETS.map((a) => a.symbol);
    expect(symbols).toContain("SOL");
    expect(symbols).toContain("ETH");
    expect(symbols).toContain("USDC");
    expect(ONE_CLICK_DESTINATION_USDC).toContain("nep141:");
  });

  it("handles live dry quote requests to 1Click solver network or handles network fallback", async () => {
    const client = new OneClickClient();
    const res = await client.requestExactOutputQuote({
      originAsset: "nep141:sol.omft.near",
      targetUsdcAmountDecimal: "50.00",
      recipientNearAccount: "atelier-sari.near",
      dry: true,
    });

    if (res.ok) {
      expect(Number(res.amountInFormatted)).toBeGreaterThan(0);
      expect(Number(res.amountOutFormatted)).toBe(50);
      expect(res.timeEstimateSeconds).toBeGreaterThan(0);
      expect(res.state).toBe("available");
      expect(res.source).toBe("live");
      expect(res.depositAddress).toBeUndefined(); // dry quote never has deposit address
    } else {
      expect(res.state).toBe("unavailable");
      expect(res.depositAddress).toBeUndefined();
      expect(typeof res.error).toBe("string");
    }
  });

  it("defaults to dry:true and never returns a deposit address when dry is unspecified", async () => {
    const originalFetch = globalThis.fetch;
    let sentPayload: { dry?: boolean } | null = null;
    try {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("/v0/tokens")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (urlStr.includes("/v0/quote")) {
          sentPayload = JSON.parse(String(init?.body)) as { dry?: boolean };
          return new Response(
            JSON.stringify({
              quote: {
                amountIn: "560000000",
                amountInFormatted: "0.56",
                amountInUsd: "50.10",
                amountOut: "50000000",
                amountOutFormatted: "50.00",
                timeEstimate: 20,
              },
              quoteRequest: { appFees: [{ fee: 20 }] },
              timestamp: new Date().toISOString(),
              correlationId: "test-corr-id",
            }),
            { status: 200 },
          );
        }
        return new Response("Not found", { status: 404 });
      });

      const client = new OneClickClient();
      const quote = await client.requestExactOutputQuote({
        originAsset: "nep141:sol.omft.near",
        targetUsdcAmountDecimal: "50.00",
        recipientNearAccount: "atelier-sari.near",
        // dry parameter omitted
      });

      expect((sentPayload as { dry?: boolean } | null)?.dry).toBe(true);
      expect(quote.ok).toBe(true);
      expect(quote.depositAddress).toBeUndefined();
      expect(quote.source).toBe("live");
      expect(quote.feePercent).toBe(0.2);
      expect(quote.feeBps).toBe(20);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns state: unavailable and NO deposit address on API failure", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return new Response("Internal Server Error", { status: 500 });
      });

      const client = new OneClickClient();
      const quote = await client.requestExactOutputQuote({
        originAsset: "nep141:sol.omft.near",
        targetUsdcAmountDecimal: "50.00",
        recipientNearAccount: "atelier-sari.near",
      });

      expect(quote.ok).toBe(false);
      expect(quote.state).toBe("unavailable");
      expect(quote.source).toBe("oracle-fallback");
      expect(quote.depositAddress).toBeUndefined();
      expect(quote.error).toBe("Solver unavailable, retry");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("handles 429 rate limit, malformed JSON, and timeout gracefully", async () => {
    const originalFetch = globalThis.fetch;
    try {
      // 1. 429 Rate limit
      globalThis.fetch = vi.fn().mockResolvedValue(new Response("Too Many Requests", { status: 429 }));
      const client = new OneClickClient();
      const res429 = await client.requestExactOutputQuote({
        originAsset: "nep141:sol.omft.near",
        targetUsdcAmountDecimal: "50.00",
        recipientNearAccount: "atelier-sari.near",
      });
      expect(res429.ok).toBe(false);
      expect(res429.state).toBe("unavailable");
      expect(res429.depositAddress).toBeUndefined();

      // 2. Malformed JSON
      globalThis.fetch = vi.fn().mockResolvedValue(new Response("{ malformed json ", { status: 200 }));
      const resMalformed = await client.requestExactOutputQuote({
        originAsset: "nep141:sol.omft.near",
        targetUsdcAmountDecimal: "50.00",
        recipientNearAccount: "atelier-sari.near",
      });
      expect(resMalformed.ok).toBe(false);
      expect(resMalformed.state).toBe("unavailable");
      expect(resMalformed.depositAddress).toBeUndefined();

      // 3. Timeout / Abort
      globalThis.fetch = vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "TimeoutError"));
      const resTimeout = await client.requestExactOutputQuote({
        originAsset: "nep141:sol.omft.near",
        targetUsdcAmountDecimal: "50.00",
        recipientNearAccount: "atelier-sari.near",
      });
      expect(resTimeout.ok).toBe(false);
      expect(resTimeout.state).toBe("unavailable");
      expect(resTimeout.depositAddress).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requires BOTH ENABLE_LIVE_INTENTS=true and user confirmation for dry:false live path", async () => {
    const client = new OneClickClient();

    // Case 1: Neither env nor confirmation
    const res1 = await client.requestExactOutputQuote({
      originAsset: "nep141:sol.omft.near",
      targetUsdcAmountDecimal: "50.00",
      recipientNearAccount: "atelier-sari.near",
      dry: false,
      enableLiveIntents: false,
      confirmedLiveDisclaimer: false,
    });
    expect(res1.ok).toBe(false);
    expect(res1.state).toBe("unavailable");
    expect(res1.depositAddress).toBeUndefined();
    expect(res1.error).toContain("ENABLE_LIVE_INTENTS=true and explicit confirmation");

    // Case 2: Confirmation present but env disabled
    const res2 = await client.requestExactOutputQuote({
      originAsset: "nep141:sol.omft.near",
      targetUsdcAmountDecimal: "50.00",
      recipientNearAccount: "atelier-sari.near",
      dry: false,
      enableLiveIntents: false,
      confirmedLiveDisclaimer: true,
    });
    expect(res2.ok).toBe(false);
    expect(res2.depositAddress).toBeUndefined();

    // Case 3: Env enabled but confirmation missing
    const res3 = await client.requestExactOutputQuote({
      originAsset: "nep141:sol.omft.near",
      targetUsdcAmountDecimal: "50.00",
      recipientNearAccount: "atelier-sari.near",
      dry: false,
      enableLiveIntents: true,
      confirmedLiveDisclaimer: false,
    });
    expect(res3.ok).toBe(false);
    expect(res3.depositAddress).toBeUndefined();
  });

  it("extracts fee percentage directly from fixture response", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
        if (String(url).includes("/v0/tokens")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            quote: {
              amountIn: "560000000",
              amountInFormatted: "0.560000",
              amountInUsd: "50.20",
              amountOut: "50000000",
              amountOutFormatted: "50.00",
              timeEstimate: 20,
            },
            quoteRequest: {
              appFees: [
                {
                  recipient: "5880ad2b362620fadf759cbceb1cd5737ce8c6ed7fb8e9942881e6731f9247dd",
                  fee: 25, // 25 bps = 0.25%
                },
              ],
            },
            timestamp: "2026-11-08T12:00:00.000Z",
            correlationId: "fixture-corr-id",
          }),
          { status: 200 },
        );
      });

      const client = new OneClickClient();
      const quote = await client.requestExactOutputQuote({
        originAsset: "nep141:sol.omft.near",
        targetUsdcAmountDecimal: "50.00",
        recipientNearAccount: "atelier-sari.near",
      });

      expect(quote.ok).toBe(true);
      expect(quote.feeBps).toBe(25);
      expect(quote.feePercent).toBe(0.25);
      expect(quote.asOf).toBe("2026-11-08T12:00:00.000Z");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("validates chain deposit addresses against expected format", () => {
    // Solana
    expect(isValidChainAddress("sol", "9HSWuranHanr6C6jU3d2mKz8k2s4Z6y1P9w")).toBe(true);
    expect(isValidChainAddress("sol", "0x12345")).toBe(false);
    expect(isValidChainAddress("sol", "invalid with spaces")).toBe(false);

    // EVM (ETH, Base, Arbitrum)
    expect(isValidChainAddress("eth", "0x71C8451C3F46Caf41732964b18E508eB1d8e0f55")).toBe(true);
    expect(isValidChainAddress("base", "0x71C8451C3F46Caf41732964b18E508eB1d8e0f55")).toBe(true);
    expect(isValidChainAddress("arb", "0x71C8451C3F46Caf41732964b18E508eB1d8e0f55")).toBe(true);
    expect(isValidChainAddress("base", "0xnothexadecimal")).toBe(false);

    // Bitcoin
    expect(isValidChainAddress("btc", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toBe(true);
    expect(isValidChainAddress("btc", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")).toBe(true);
    expect(isValidChainAddress("btc", "0xinvalidbtc")).toBe(false);
  });

  it("checks quote deadline expiry", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isQuoteExpired(past)).toBe(true);
    expect(isQuoteExpired(future)).toBe(false);
    expect(isQuoteExpired(undefined)).toBe(false);
  });

  it("checks swap status for deposit addresses", async () => {
    const client = new OneClickClient();
    const status = await client.getStatus("dummy_deposit_address");
    expect(status.status).toBeDefined();
  });
});
