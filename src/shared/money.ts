import { err, ok, type Result } from "./result";
import { domainError, type DomainError } from "./errors";

/**
 * Supported currencies and their minor-unit precision.
 * USDC on NEAR uses 6 decimals. Fiat currencies are used for quotes/payouts only.
 */
export const CURRENCY_DECIMALS = {
  USDC: 6,
  USD: 2,
  EUR: 2,
  PHP: 2,
  IDR: 2,
  INR: 2,
  MXN: 2,
  AUD: 2,
  SGD: 2,
  KRW: 2,
  JPY: 2,
} as const;

export type Currency = keyof typeof CURRENCY_DECIMALS;

export const isCurrency = (c: string): c is Currency => c in CURRENCY_DECIMALS;

/**
 * Money value object. Amounts are ALWAYS integer minor units (bigint).
 * Floats are never used for money (NFR-04).
 * Immutable: every operation returns a new instance.
 */
export class Money {
  private constructor(
    readonly amountMinor: bigint,
    readonly currency: Currency,
  ) {}

  /** Create from minor units. Negative amounts are rejected. */
  static of(amountMinor: bigint, currency: Currency): Result<Money, DomainError> {
    if (amountMinor < 0n) {
      return err(domainError("INVALID_AMOUNT", "Amount must be non-negative"));
    }
    return ok(new Money(amountMinor, currency));
  }

  static zero(currency: Currency): Money {
    return new Money(0n, currency);
  }

  /**
   * Parse a decimal string ("120.50") into Money without floating point.
   * Rejects more fractional digits than the currency supports.
   */
  static parse(decimal: string, currency: Currency): Result<Money, DomainError> {
    const sanitized = decimal.replace(/,/g, "").trim();
    const m = /^(\d+)(?:\.(\d+))?$/.exec(sanitized);
    if (!m) return err(domainError("INVALID_AMOUNT", `Invalid amount '${decimal}'`));
    const decimals = CURRENCY_DECIMALS[currency];
    const frac = m[2] ?? "";
    if (frac.length > decimals) {
      return err(domainError("INVALID_AMOUNT", `Too many decimals for ${currency}`));
    }
    const minor = BigInt(m[1]! + frac.padEnd(decimals, "0"));
    return Money.of(minor, currency);
  }

  /** Format as decimal string, e.g. 120500000n USDC -> "120.500000". */
  toDecimalString(): string {
    const d: number = CURRENCY_DECIMALS[this.currency];
    const s = this.amountMinor.toString().padStart(d + 1, "0");
    return d === 0 ? s : `${s.slice(0, -d)}.${s.slice(-d)}`;
  }

  isZero(): boolean {
    return this.amountMinor === 0n;
  }

  add(other: Money): Result<Money, DomainError> {
    const c = this.assertSame(other);
    return c.ok ? ok(new Money(this.amountMinor + other.amountMinor, this.currency)) : c;
  }

  /** Subtraction that refuses to go negative. */
  subtract(other: Money): Result<Money, DomainError> {
    const c = this.assertSame(other);
    if (!c.ok) return c;
    if (other.amountMinor > this.amountMinor) {
      return err(domainError("INVALID_AMOUNT", "Subtraction would result in negative amount"));
    }
    return ok(new Money(this.amountMinor - other.amountMinor, this.currency));
  }

  compare(other: Money): -1 | 0 | 1 {
    if (this.currency !== other.currency) {
      throw new Error(`compare across currencies ${this.currency}/${other.currency}`);
    }
    return this.amountMinor < other.amountMinor ? -1 : this.amountMinor > other.amountMinor ? 1 : 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  toJSON(): { amountMinor: string; currency: Currency } {
    return { amountMinor: this.amountMinor.toString(), currency: this.currency };
  }

  private assertSame(other: Money): Result<true, DomainError> {
    return this.currency === other.currency
      ? ok(true)
      : err(
          domainError("CURRENCY_MISMATCH", `Currency mismatch ${this.currency} vs ${other.currency}`),
        );
  }
}

/**
 * Exchange rate as an exact rational number (num/den) to avoid float error.
 * Semantics: 1 major unit of `from` = num/den major units of `to`.
 */
export class Rate {
  private constructor(
    readonly from: Currency,
    readonly to: Currency,
    readonly num: bigint,
    readonly den: bigint,
  ) {}

  static of(from: Currency, to: Currency, num: bigint, den: bigint): Result<Rate, DomainError> {
    if (num <= 0n || den <= 0n) return err(domainError("INVALID_AMOUNT", "Rate must be positive"));
    return ok(new Rate(from, to, num, den));
  }

  /** Parse a decimal rate string like "56.1234". */
  static parse(from: Currency, to: Currency, decimal: string): Result<Rate, DomainError> {
    const m = /^(\d+)(?:\.(\d+))?$/.exec(decimal.trim());
    if (!m) return err(domainError("INVALID_AMOUNT", `Invalid rate '${decimal}'`));
    const frac = m[2] ?? "";
    return Rate.of(from, to, BigInt(m[1]! + frac), 10n ** BigInt(frac.length));
  }

  /**
   * Convert money using this rate, rounding DOWN (floor) in minor units.
   * Rounding policy is explicit and deterministic; the dust stays with the
   * platform/partner and is recorded in the quote.
   */
  convert(money: Money): Result<Money, DomainError> {
    if (money.currency !== this.from) {
      return err(domainError("CURRENCY_MISMATCH", `Rate expects ${this.from}`));
    }
    const fromScale = 10n ** BigInt(CURRENCY_DECIMALS[this.from]);
    const toScale = 10n ** BigInt(CURRENCY_DECIMALS[this.to]);
    const minor = (money.amountMinor * this.num * toScale) / (this.den * fromScale);
    return Money.of(minor, this.to);
  }

  toString(): string {
    return `1 ${this.from} = ${this.num}/${this.den} ${this.to}`;
  }
}
