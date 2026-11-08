import { describe, expect, it } from "vitest";
import { RealFxAdapter, getFxBadgeInfo, isRateFresh } from "../src/shared/real-fx-adapter";
import { Money, unwrap } from "../src/shared";

describe("RealFxAdapter (Live Real-Time Forex API)", () => {
  it("fetches live rates or returns structured live fallback with real-time format", async () => {
    const adapter = new RealFxAdapter();
    const rates = await adapter.getLiveRates();

    expect(rates.USDC.rate).toBe(1.0);
    expect(rates.IDR.rate).toBeGreaterThan(10000);
    expect(rates.PHP.rate).toBeGreaterThan(40);
    expect(rates.EUR.rate).toBeGreaterThan(0.5);
    expect(rates.AUD.rate).toBeGreaterThan(1.0);
    expect(rates.SGD.rate).toBeGreaterThan(1.0);
    expect(rates.KRW.rate).toBeGreaterThan(1000);
    expect(rates.JPY.rate).toBeGreaterThan(100);
    expect(rates.IDR.formatted).toBeDefined();
    expect(rates.IDR.source).toBeDefined();
    expect(["live", "secondary", "static-fallback"]).toContain(rates.IDR.source);
    expect(rates.IDR.updatedAtIso).toBeDefined();
    expect(rates.IDR.asOf).toBeDefined();
  });

  it("checks FX rate freshness within 5 minutes window", () => {
    const now = Date.now();
    const freshIso = new Date(now - 2 * 60 * 1000).toISOString(); // 2 mins ago
    const staleIso = new Date(now - 10 * 60 * 1000).toISOString(); // 10 mins ago

    expect(isRateFresh(freshIso, 5 * 60 * 1000, now)).toBe(true);
    expect(isRateFresh(staleIso, 5 * 60 * 1000, now)).toBe(false);
    expect(isRateFresh(undefined)).toBe(false);
  });

  it("determines correct UI badge info based on source and freshness", () => {
    const now = Date.now();
    const freshIso = new Date(now - 60_000).toISOString();
    const staleIso = new Date(now - 10 * 60 * 1000).toISOString();

    // Live and fresh
    const liveFresh = getFxBadgeInfo({ source: "live", asOf: freshIso });
    expect(liveFresh.isLive).toBe(true);
    expect(liveFresh.variant).toBe("live");
    expect(liveFresh.isExecutable).toBe(true);

    // Live but stale
    const liveStale = getFxBadgeInfo({ source: "live", asOf: staleIso });
    expect(liveStale.isLive).toBe(false);
    expect(liveStale.variant).toBe("stale");
    expect(liveStale.label).toBe("Stale rate");

    // Static fallback
    const fallback = getFxBadgeInfo({ source: "static-fallback", asOf: freshIso });
    expect(fallback.isLive).toBe(false);
    expect(fallback.variant).toBe("fallback");
    expect(fallback.isExecutable).toBe(false);
    expect(fallback.label).toContain("Fallback estimate (not executable)");
  });

  it("quotes USDC to IDR with real-time rate and 0.5% protocol fee", async () => {
    const adapter = new RealFxAdapter();
    const source = unwrap(Money.parse("100.00", "USDC"));
    const quote = await adapter.quote("USDC", "IDR", source);

    expect(Number(quote.rate)).toBeGreaterThan(10000);
    expect(quote.fee.toDecimalString()).toBe("0.500000");
  });

  it("quotes USDC to PHP with 0.5% protocol fee", async () => {
    const adapter = new RealFxAdapter();
    const source = unwrap(Money.parse("200.00", "USDC"));
    const quote = await adapter.quote("USDC", "PHP", source);

    expect(Number(quote.rate)).toBeGreaterThan(40);
    expect(quote.fee.toDecimalString()).toBe("1.000000");
  });

  it("charges 0 fee for direct USDC-to-USDC transfers", async () => {
    const adapter = new RealFxAdapter();
    const source = unwrap(Money.parse("500.00", "USDC"));
    const quote = await adapter.quote("USDC", "USDC", source);

    expect(quote.rate).toBe("1");
    expect(quote.fee.toDecimalString()).toBe("0.000000");
  });

  it("supports manual rate override for test determinism", async () => {
    const adapter = new RealFxAdapter();
    adapter.setRate("IDR", "19000.50");
    const source = unwrap(Money.parse("10.00", "USDC"));
    const quote = await adapter.quote("USDC", "IDR", source);

    expect(quote.rate).toBe("19000.5");
  });
});
