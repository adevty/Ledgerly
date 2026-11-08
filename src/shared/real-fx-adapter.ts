import { Money, type Currency } from "./money";
import type { FxRatePort } from "@/modules/remittance/domain/ports";

export type FxSourceType = "live" | "secondary" | "static-fallback";

export interface LiveFxRateEntry {
  readonly rate: number;
  readonly decimals: number;
  readonly formatted: string;
  readonly updatedAtIso: string;
  readonly asOf: string;
  readonly source: FxSourceType;
}

export type LiveFxRates = Record<Currency, LiveFxRateEntry>;

/**
 * Checks if rate timestamp is fresh (< 5 minutes old).
 */
export function isRateFresh(asOfIso?: string, maxAgeMs = 5 * 60 * 1000, nowMs = Date.now()): boolean {
  if (!asOfIso) return false;
  const t = new Date(asOfIso).getTime();
  return Number.isFinite(t) && nowMs - t < maxAgeMs && nowMs >= t - 60_000;
}

export function getFxBadgeInfo(entry?: {
  source?: string;
  asOf?: string;
  updatedAtIso?: string;
}): {
  label: string;
  isLive: boolean;
  isExecutable: boolean;
  variant: "live" | "stale" | "fallback";
} {
  if (!entry || !entry.source) {
    return {
      label: "Fallback estimate (not executable)",
      isLive: false,
      isExecutable: false,
      variant: "fallback",
    };
  }
  const asOf = entry.asOf ?? entry.updatedAtIso;
  const isFresh = isRateFresh(asOf);

  if (entry.source === "live" || entry.source === "open.er-api.com") {
    if (isFresh) {
      return { label: "Live", isLive: true, isExecutable: true, variant: "live" };
    }
    return { label: "Stale rate", isLive: false, isExecutable: true, variant: "stale" };
  }
  if (entry.source === "secondary" || entry.source.includes("frankfurter")) {
    if (isFresh) {
      return { label: "Live (Secondary)", isLive: true, isExecutable: true, variant: "live" };
    }
    return { label: "Stale rate", isLive: false, isExecutable: true, variant: "stale" };
  }
  return {
    label: "Fallback estimate (not executable)",
    isLive: false,
    isExecutable: false,
    variant: "fallback",
  };
}

/** Safe fallback rates if all external APIs are unreachable (e.g. offline testing) */
const DEFAULT_FALLBACK_RATES: Record<Currency, number> = {
  USDC: 1.0,
  USD: 1.0,
  EUR: 0.89,
  PHP: 63.0,
  IDR: 18080.0,
  INR: 86.5,
  MXN: 20.3,
  AUD: 1.45,
  SGD: 1.28,
  KRW: 1356.0,
  JPY: 158.0,
};

const CACHE_TTL_MS = 60_000; // 1 minute in-memory cache

/**
 * RealFxAdapter: Production-grade real-time FX rate adapter.
 * Connects to live open forex rate providers (open.er-api.com and frankfurter.dev)
 * to deliver true real-time spot exchange rates matching CEX/Forex markets.
 */
export class RealFxAdapter implements FxRatePort {
  private cachedRates: LiveFxRates | null = null;
  private lastFetchTime = 0;
  private fetchPromise: Promise<LiveFxRates> | null = null;
  private manualOverrides: Partial<Record<Currency, number>> = {};

  constructor(private fallbackRates = DEFAULT_FALLBACK_RATES) {}

  /** Override rate manually (e.g. for testing or mocking) */
  setRate(to: Currency, rateDecimal: string): void {
    const num = parseFloat(rateDecimal);
    if (!Number.isNaN(num) && num > 0) {
      this.manualOverrides[to] = num;
      this.fallbackRates = { ...this.fallbackRates, [to]: num };
      if (this.cachedRates && this.cachedRates[to]) {
        this.cachedRates = {
          ...this.cachedRates,
          [to]: {
            ...this.cachedRates[to],
            rate: num,
            formatted: num.toLocaleString("en-US", {
              minimumFractionDigits: this.cachedRates[to].decimals,
              maximumFractionDigits: this.cachedRates[to].decimals,
            }),
            asOf: new Date().toISOString(),
            source: "static-fallback",
          },
        };
      }
    }
  }

  /**
   * Fetch live forex rates from external APIs with failover and in-memory caching.
   */
  async getLiveRates(): Promise<LiveFxRates> {
    const now = Date.now();
    if (this.cachedRates && now - this.lastFetchTime < CACHE_TTL_MS) {
      return this.cachedRates;
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchFromProviders()
      .then((rates) => {
        this.cachedRates = rates;
        this.lastFetchTime = Date.now();
        this.fetchPromise = null;
        return rates;
      })
      .catch(() => {
        this.fetchPromise = null;
        // In case of complete network outage, return cached rates or defaults
        return this.cachedRates ?? this.buildFallbackRates("static-fallback");
      });

    return this.fetchPromise;
  }

  private async fetchFromProviders(): Promise<LiveFxRates> {
    // 1. Try Primary: open.er-api.com (zero keys, high rate limit, real-time)
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          result?: string;
          rates?: Record<string, number>;
          time_last_update_utc?: string;
        };
        if (data.rates && typeof data.rates.IDR === "number") {
          return this.mapRatesToLiveEntries(data.rates, "live", data.time_last_update_utc);
        }
      }
    } catch {
      // Primary failed; proceed to secondary
    }

    // 2. Try Secondary: frankfurter.dev (European Central Bank data)
    try {
      const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD", {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          rates?: Record<string, number>;
          date?: string;
        };
        if (data.rates && typeof data.rates.IDR === "number") {
          return this.mapRatesToLiveEntries(data.rates, "secondary", data.date);
        }
      }
    } catch {
      // Secondary failed
    }

    // 3. Fallback
    return this.buildFallbackRates("static-fallback");
  }

  private mapRatesToLiveEntries(
    rates: Record<string, number>,
    source: FxSourceType,
    updatedAt?: string,
  ): LiveFxRates {
    const isoDate = updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();

    const getVal = (curr: Currency): number => {
      if (this.manualOverrides[curr] !== undefined) return this.manualOverrides[curr]!;
      if (curr === "USDC" || curr === "USD") return 1.0;
      const v = rates[curr];
      return typeof v === "number" && v > 0 ? v : this.fallbackRates[curr] ?? 1.0;
    };

    const formatRate = (rate: number, decimals: number): string => {
      return rate.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    };

    return {
      USDC: { rate: 1.0, decimals: 2, formatted: "1.00", updatedAtIso: isoDate, asOf: isoDate, source },
      USD: { rate: 1.0, decimals: 2, formatted: "1.00", updatedAtIso: isoDate, asOf: isoDate, source },
      EUR: { rate: getVal("EUR"), decimals: 4, formatted: formatRate(getVal("EUR"), 4), updatedAtIso: isoDate, asOf: isoDate, source },
      PHP: { rate: getVal("PHP"), decimals: 2, formatted: formatRate(getVal("PHP"), 2), updatedAtIso: isoDate, asOf: isoDate, source },
      IDR: { rate: getVal("IDR"), decimals: 2, formatted: formatRate(getVal("IDR"), 2), updatedAtIso: isoDate, asOf: isoDate, source },
      INR: { rate: getVal("INR"), decimals: 2, formatted: formatRate(getVal("INR"), 2), updatedAtIso: isoDate, asOf: isoDate, source },
      MXN: { rate: getVal("MXN"), decimals: 2, formatted: formatRate(getVal("MXN"), 2), updatedAtIso: isoDate, asOf: isoDate, source },
      AUD: { rate: getVal("AUD"), decimals: 2, formatted: formatRate(getVal("AUD"), 2), updatedAtIso: isoDate, asOf: isoDate, source },
      SGD: { rate: getVal("SGD"), decimals: 2, formatted: formatRate(getVal("SGD"), 2), updatedAtIso: isoDate, asOf: isoDate, source },
      KRW: { rate: getVal("KRW"), decimals: 0, formatted: formatRate(getVal("KRW"), 0), updatedAtIso: isoDate, asOf: isoDate, source },
      JPY: { rate: getVal("JPY"), decimals: 2, formatted: formatRate(getVal("JPY"), 2), updatedAtIso: isoDate, asOf: isoDate, source },
    };
  }

  private buildFallbackRates(source: FxSourceType): LiveFxRates {
    const isoDate = new Date().toISOString();
    const result = {} as Record<Currency, LiveFxRateEntry>;
    for (const [key, val] of Object.entries(this.fallbackRates) as [Currency, number][]) {
      const decimals = key === "KRW" ? 0 : key === "EUR" ? 4 : 2;
      result[key] = {
        rate: val,
        decimals,
        formatted: val.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }),
        updatedAtIso: isoDate,
        asOf: isoDate,
        source,
      };
    }
    return result;
  }

  /**
   * Implements FxRatePort for remittance quote locking.
   * Uses real-time market rates and 0.5% protocol off-ramp fee.
   */
  async quote(from: Currency, to: Currency, source: Money): Promise<{ rate: string; fee: Money }> {
    if (from !== "USDC") {
      throw new Error(`RealFxAdapter only quotes from USDC (got ${from})`);
    }

    const liveRates = await this.getLiveRates();
    const entry = liveRates[to];
    const rateNumber = entry ? entry.rate : this.fallbackRates[to] ?? 1.0;
    const rateString = rateNumber.toString();

    // 0.5% fee or min 0.50 USDC (0 fee for direct USDC-to-USDC transfers)
    const feeMinor =
      to === "USDC"
        ? 0n
        : source.amountMinor / 200n > 500_000n
          ? source.amountMinor / 200n
          : 500_000n;

    const feeRes = Money.of(feeMinor < source.amountMinor ? feeMinor : 0n, "USDC");
    if (!feeRes.ok) {
      throw new Error(feeRes.error.message);
    }

    return {
      rate: rateString,
      fee: feeRes.value,
    };
  }
}
