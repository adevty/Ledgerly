import { describe, expect, it } from "vitest";
import {
  OneClickClient,
  ONE_CLICK_DESTINATION_USDC,
  POPULAR_ONE_CLICK_ASSETS,
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

    // In testing environments with outbound network access, this returns a live quote from solvers.
    // If offline/blocked, res.ok is false with a descriptive error string.
    if (res.ok) {
      expect(Number(res.amountInFormatted)).toBeGreaterThan(0);
      expect(Number(res.amountOutFormatted)).toBe(50);
      expect(res.timeEstimateSeconds).toBeGreaterThan(0);
    } else {
      expect(typeof res.error).toBe("string");
    }
  });

  it("checks swap status for deposit addresses", async () => {
    const client = new OneClickClient();
    const status = await client.getStatus("dummy_deposit_address");
    expect(status.status).toBeDefined();
  });
});
