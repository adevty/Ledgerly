import { describe, expect, it } from "vitest";
import { Money, Rate, parseAccountId, newEscrowId, ESCROW_ID_RE, unwrap } from "@/shared";

describe("Money", () => {
  it("parses decimals without floating point", () => {
    const m = unwrap(Money.parse("120.5", "USDC"));
    expect(m.amountMinor).toBe(120_500_000n);
    expect(m.toDecimalString()).toBe("120.500000");
  });

  it("handles the classic 0.1 + 0.2 case exactly", () => {
    const a = unwrap(Money.parse("0.1", "USD"));
    const b = unwrap(Money.parse("0.2", "USD"));
    expect(unwrap(a.add(b)).toDecimalString()).toBe("0.30");
  });

  it("rejects too many decimals, negatives and currency mismatch", () => {
    expect(Money.parse("1.001", "USD").ok).toBe(false);
    expect(Money.of(-1n, "USDC").ok).toBe(false);
    const r = Money.zero("USDC").add(Money.zero("PHP"));
    expect(!r.ok && r.error.code).toBe("CURRENCY_MISMATCH");
  });

  it("refuses to go negative on subtract", () => {
    const r = Money.zero("USDC").subtract(unwrap(Money.parse("1", "USDC")));
    expect(r.ok).toBe(false);
  });
});

describe("Rate", () => {
  it("converts USDC → PHP rounding down", () => {
    const rate = unwrap(Rate.parse("USDC", "PHP", "56.1234"));
    const out = unwrap(rate.convert(unwrap(Money.parse("199", "USDC"))));
    expect(out.toDecimalString()).toBe("11168.55"); // 11168.5566 floored
  });
});

describe("ids", () => {
  it("validates NEAR account ids", () => {
    expect(parseAccountId("maria.ledgerly.testnet").ok).toBe(true);
    expect(parseAccountId("Bad..Account").ok).toBe(false);
    expect(parseAccountId("a").ok).toBe(false);
  });

  it("generates opaque 32-byte hex escrow ids", () => {
    expect(newEscrowId()).toMatch(ESCROW_ID_RE);
  });
});
