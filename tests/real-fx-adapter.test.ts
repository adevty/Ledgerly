import { describe, expect, it } from "vitest";
import { RealFxAdapter } from "../src/shared/real-fx-adapter";
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
    expect(rates.IDR.updatedAtIso).toBeDefined();
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
