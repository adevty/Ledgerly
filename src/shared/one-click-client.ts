/**
 * NEAR Intents 1Click API Client (docs.near-intents.org)
 *
 * Implements cross-chain intent settlement where clients pay from any chain
 * (Solana, Base, Ethereum, Arbitrum, Bitcoin, etc.) and solvers settle the exact
 * USDC amount on NEAR Protocol.
 */

export interface OneClickToken {
  readonly assetId: string;
  readonly decimals: number;
  readonly blockchain: string;
  readonly symbol: string;
  readonly price: number;
}

export interface OneClickQuoteResult {
  readonly ok: boolean;
  readonly state: "available" | "unavailable";
  readonly source: "live" | "oracle-fallback";
  readonly asOf: string;
  readonly depositAddress?: string;
  readonly amountIn: string;
  readonly amountInFormatted: string;
  readonly amountInUsd: string;
  readonly amountOut: string;
  readonly amountOutFormatted: string;
  readonly spotPrice?: number;
  readonly spotPriceUpdatedAt?: string;
  readonly coingeckoId?: string;
  readonly timeEstimateSeconds: number;
  readonly deadlineIso?: string;
  readonly correlationId: string;
  readonly feePercent?: number;
  readonly feeBps?: number;
  readonly feeSource?: "quote" | "documented-default";
  readonly feeLabel?: string;
  readonly appFees?: ReadonlyArray<{ recipient: string; fee: number }>;
  readonly error?: string;
}

export interface OneClickSwapStatus {
  readonly status:
    | "PENDING_DEPOSIT"
    | "KNOWN_DEPOSIT_TX"
    | "PROCESSING"
    | "SUCCESS"
    | "REFUNDED"
    | "FAILED";
  readonly updatedAt?: string;
  readonly correlationId?: string;
  readonly originTxHashes?: string[];
  readonly destinationTxHashes?: string[];
}

export const POPULAR_ONE_CLICK_ASSETS = [
  {
    symbol: "SOL",
    blockchain: "sol",
    name: "Solana",
    assetId: "nep141:sol.omft.near",
    decimals: 9,
    icon: "◎",
  },
  {
    symbol: "ETH",
    blockchain: "base",
    name: "Base (Ethereum L2)",
    assetId: "nep141:base.omft.near",
    decimals: 18,
    icon: "🔵",
  },
  {
    symbol: "USDC",
    blockchain: "arb",
    name: "Arbitrum (USDC)",
    assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
    decimals: 6,
    icon: "💲",
  },
  {
    symbol: "ETH",
    blockchain: "eth",
    name: "Ethereum Mainnet",
    assetId: "nep141:eth.omft.near",
    decimals: 18,
    icon: "Ξ",
  },
  {
    symbol: "BTC",
    blockchain: "btc",
    name: "Bitcoin",
    assetId: "nep141:btc.omft.near",
    decimals: 8,
    icon: "₿",
  },
] as const;

export const ONE_CLICK_DESTINATION_USDC =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

const BASE_URL = "https://1click.chaindefuser.com";

interface CachedTokenMeta {
  readonly price: number;
  readonly priceUpdatedAt: string;
  readonly decimals?: number;
  readonly blockchain?: string;
  readonly coingeckoId?: string;
}

const FALLBACK_SPOT_PRICES: Record<
  string,
  { price: number; decimals: number; blockchain: string; coingeckoId: string }
> = {
  "nep141:sol.omft.near": {
    price: 89.04,
    decimals: 9,
    blockchain: "sol",
    coingeckoId: "solana",
  },
  "nep141:base.omft.near": {
    price: 2231.75,
    decimals: 18,
    blockchain: "base",
    coingeckoId: "ethereum",
  },
  "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near": {
    price: 1.0,
    decimals: 6,
    blockchain: "arb",
    coingeckoId: "usd-coin",
  },
  "nep141:eth.omft.near": {
    price: 2231.75,
    decimals: 18,
    blockchain: "eth",
    coingeckoId: "ethereum",
  },
  "nep141:btc.omft.near": {
    price: 75666.0,
    decimals: 8,
    blockchain: "btc",
    coingeckoId: "bitcoin",
  },
};

/**
 * Validates a blockchain address format for safety prior to rendering.
 * Rejects malformed addresses or unexpected string shapes.
 */
export function isValidChainAddress(blockchain: string, address?: string): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  switch (blockchain.toLowerCase()) {
    case "eth":
    case "base":
    case "arb":
      return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
    case "sol":
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
    case "btc":
      return /^(bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(trimmed);
    case "near":
      return /^(([a-z0-9_-]+\.)*[a-z0-9_-]+|[0-9a-fA-F]{64})$/.test(trimmed);
    default:
      return trimmed.length >= 20 && trimmed.length <= 100 && !/\s/.test(trimmed);
  }
}

/**
 * Checks if a quote deadline has expired.
 */
export function isQuoteExpired(deadlineIso?: string, nowMs = Date.now()): boolean {
  if (!deadlineIso) return false;
  const deadline = new Date(deadlineIso).getTime();
  return Number.isFinite(deadline) && nowMs >= deadline;
}

export class OneClickClient {
  private static tokensCache: Map<string, CachedTokenMeta> | null = null;
  private static tokensCacheTime = 0;

  constructor(private readonly baseUrl = BASE_URL) {}

  /**
   * Fetch live token prices from 1Click token registry with caching.
   */
  async getTokenPrices(): Promise<Map<string, CachedTokenMeta>> {
    const now = Date.now();
    if (OneClickClient.tokensCache && now - OneClickClient.tokensCacheTime < 60_000) {
      return OneClickClient.tokensCache;
    }
    try {
      const res = await fetch(`${this.baseUrl}/v0/tokens`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const tokens = (await res.json()) as Array<{
          assetId?: string;
          price?: number;
          priceUpdatedAt?: string;
          decimals?: number;
          blockchain?: string;
          coingeckoId?: string;
        }>;
        const map = new Map<string, CachedTokenMeta>();
        for (const t of tokens) {
          if (t.assetId && typeof t.price === "number" && t.price > 0) {
            map.set(t.assetId, {
              price: t.price,
              priceUpdatedAt: t.priceUpdatedAt ?? new Date().toISOString(),
              decimals: t.decimals,
              blockchain: t.blockchain,
              coingeckoId: t.coingeckoId,
            });
          }
        }
        if (map.size > 0) {
          OneClickClient.tokensCache = map;
          OneClickClient.tokensCacheTime = now;
          return map;
        }
      }
    } catch {
      // ignore and use cache / fallback
    }
    return OneClickClient.tokensCache ?? new Map();
  }

  private buildOracleFallbackQuote(params: {
    originAsset: string;
    targetUsdcAmountDecimal: string;
    recipientNearAccount: string;
    usdcMinor: string;
    deadlineIso: string;
    tokenPrices: Map<string, CachedTokenMeta>;
    reason?: string;
  }): OneClickQuoteResult {
    const targetUsdc = Number(params.targetUsdcAmountDecimal);
    if (!Number.isFinite(targetUsdc) || targetUsdc <= 0) {
      return {
        ok: false,
        state: "unavailable",
        source: "oracle-fallback",
        asOf: new Date().toISOString(),
        depositAddress: undefined,
        amountIn: "0",
        amountInFormatted: "0",
        amountInUsd: "0",
        amountOut: "0",
        amountOutFormatted: params.targetUsdcAmountDecimal,
        timeEstimateSeconds: 20,
        correlationId: "",
        feePercent: 0.2,
        feeBps: 20,
        feeSource: "documented-default",
        feeLabel: "~0.2% (estimate)",
        error: "Invalid target USDC amount",
      };
    }

    const liveToken = params.tokenPrices.get(params.originAsset);
    const staticFallback = FALLBACK_SPOT_PRICES[params.originAsset];
    const popularAsset = POPULAR_ONE_CLICK_ASSETS.find((a) => a.assetId === params.originAsset);

    const spotPrice = liveToken?.price ?? staticFallback?.price ?? 1.0;
    const decimals =
      liveToken?.decimals ?? staticFallback?.decimals ?? popularAsset?.decimals ?? 6;
    const isStable = Math.abs(spotPrice - 1.0) < 0.03;
    // 0.05% spread for stablecoin bridges, 0.30% solver spread for volatile assets
    const spreadMultiplier = isStable ? 1.0005 : 1.003;
    const amountInUsdNum = targetUsdc * spreadMultiplier;
    const amountInNum = amountInUsdNum / spotPrice;

    const scalePow = Math.min(decimals, 8);
    const scaledInt = BigInt(Math.max(1, Math.round(amountInNum * 10 ** scalePow)));
    const extraFactor = 10n ** BigInt(Math.max(0, decimals - scalePow));
    const amountInMinor = (scaledInt * extraFactor).toString();

    const formatDecimals = isStable ? 2 : Math.min(decimals, 6);
    const amountInFormatted = amountInNum.toFixed(formatDecimals);

    return {
      ok: false,
      state: "unavailable",
      source: "oracle-fallback",
      asOf: new Date().toISOString(),
      depositAddress: undefined,
      amountIn: amountInMinor,
      amountInFormatted,
      amountInUsd: amountInUsdNum.toFixed(2),
      amountOut: params.usdcMinor,
      amountOutFormatted: params.targetUsdcAmountDecimal,
      spotPrice,
      spotPriceUpdatedAt: liveToken?.priceUpdatedAt ?? new Date().toISOString(),
      coingeckoId: liveToken?.coingeckoId ?? staticFallback?.coingeckoId,
      timeEstimateSeconds: 18,
      deadlineIso: params.deadlineIso,
      correlationId: `1click-oracle-${Date.now().toString(36)}`,
      feePercent: 0.2,
      feeBps: 20,
      feeSource: "documented-default",
      feeLabel: "~0.2% (estimate)",
      error: params.reason ?? "Solver unavailable, retry",
    };
  }

  /**
   * Request an EXACT_OUTPUT quote from NEAR Intents solvers.
   * Calculates how much source token (e.g. SOL) the buyer must send to settle
   * the exact invoice amount in USDC on NEAR.
   */
  async requestExactOutputQuote(params: {
    originAsset: string;
    targetUsdcAmountDecimal: string;
    recipientNearAccount: string;
    dry?: boolean;
    confirmedLiveDisclaimer?: boolean;
    enableLiveIntents?: boolean;
    refundToAccount?: string;
  }): Promise<OneClickQuoteResult> {
    const isDry = params.dry !== false;
    const targetNum = Number(params.targetUsdcAmountDecimal);
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      return {
        ok: false,
        state: "unavailable",
        source: "oracle-fallback",
        asOf: new Date().toISOString(),
        depositAddress: undefined,
        amountIn: "0",
        amountInFormatted: "0",
        amountInUsd: "0",
        amountOut: "0",
        amountOutFormatted: params.targetUsdcAmountDecimal,
        timeEstimateSeconds: 20,
        correlationId: "",
        feePercent: 0.2,
        feeBps: 20,
        feeSource: "documented-default",
        feeLabel: "~0.2% (estimate)",
        error: "Target USDC amount must be greater than zero",
      };
    }

    const usdcMinor = Math.round(targetNum * 1_000_000).toString();
    const deadlineIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Check live path safety requirements
    if (!isDry) {
      const liveEnabled =
        params.enableLiveIntents ??
        (process.env.ENABLE_LIVE_INTENTS === "true" || process.env.ENABLE_LIVE_INTENTS === "1");
      const confirmed = params.confirmedLiveDisclaimer === true;
      if (!liveEnabled || !confirmed) {
        return {
          ok: false,
          state: "unavailable",
          source: "oracle-fallback",
          asOf: new Date().toISOString(),
          depositAddress: undefined,
          amountIn: "0",
          amountInFormatted: "0",
          amountInUsd: "0",
          amountOut: usdcMinor,
          amountOutFormatted: params.targetUsdcAmountDecimal,
          timeEstimateSeconds: 20,
          correlationId: "",
          feePercent: 0.2,
          feeBps: 20,
          feeSource: "documented-default",
          feeLabel: "~0.2% (estimate)",
          error:
            "Live deposit address generation requires ENABLE_LIVE_INTENTS=true and explicit confirmation.",
        };
      }
    }

    const refundTo = params.refundToAccount ?? params.recipientNearAccount;
    const payload = {
      dry: isDry,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100, // 1%
      originAsset: params.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: ONE_CLICK_DESTINATION_USDC,
      amount: usdcMinor,
      recipient: params.recipientNearAccount,
      recipientType: "INTENTS",
      refundTo,
      refundType: "INTENTS",
      deadline: deadlineIso,
    };

    const tokenPricesPromise = this.getTokenPrices();

    try {
      const res = await fetch(`${this.baseUrl}/v0/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2200),
      });

      const tokenPrices = await tokenPricesPromise;

      if (!res.ok) {
        return this.buildOracleFallbackQuote({
          originAsset: params.originAsset,
          targetUsdcAmountDecimal: params.targetUsdcAmountDecimal,
          recipientNearAccount: params.recipientNearAccount,
          usdcMinor,
          deadlineIso,
          tokenPrices,
          reason: "Solver unavailable, retry",
        });
      }

      let body: {
        quote?: {
          amountIn?: string;
          amountInFormatted?: string;
          amountInUsd?: string;
          amountOut?: string;
          amountOutFormatted?: string;
          depositAddress?: string;
          timeEstimate?: number;
          deadline?: string;
        };
        quoteRequest?: {
          appFees?: Array<{ recipient: string; fee: number }>;
        };
        timestamp?: string;
        correlationId?: string;
      };

      try {
        body = (await res.json()) as typeof body;
      } catch {
        return this.buildOracleFallbackQuote({
          originAsset: params.originAsset,
          targetUsdcAmountDecimal: params.targetUsdcAmountDecimal,
          recipientNearAccount: params.recipientNearAccount,
          usdcMinor,
          deadlineIso,
          tokenPrices,
          reason: "Solver unavailable, retry",
        });
      }

      if (!body || !body.quote || !body.quote.amountIn) {
        return this.buildOracleFallbackQuote({
          originAsset: params.originAsset,
          targetUsdcAmountDecimal: params.targetUsdcAmountDecimal,
          recipientNearAccount: params.recipientNearAccount,
          usdcMinor,
          deadlineIso,
          tokenPrices,
          reason: "Solver unavailable, retry",
        });
      }

      const popularAsset = POPULAR_ONE_CLICK_ASSETS.find((a) => a.assetId === params.originAsset);
      const blockchain = popularAsset?.blockchain ?? "sol";

      // Validate deposit address if one was returned
      let validDepositAddress: string | undefined = undefined;
      if (!isDry && body.quote.depositAddress) {
        if (isValidChainAddress(blockchain, body.quote.depositAddress)) {
          validDepositAddress = body.quote.depositAddress;
        } else {
          return {
            ok: false,
            state: "unavailable",
            source: "live",
            asOf: body.timestamp ?? new Date().toISOString(),
            depositAddress: undefined,
            amountIn: body.quote.amountIn ?? "0",
            amountInFormatted: body.quote.amountInFormatted ?? "0",
            amountInUsd: body.quote.amountInUsd ?? "0",
            amountOut: body.quote.amountOut ?? usdcMinor,
            amountOutFormatted: body.quote.amountOutFormatted ?? params.targetUsdcAmountDecimal,
            timeEstimateSeconds: body.quote.timeEstimate ?? 20,
            correlationId: body.correlationId ?? "",
            feePercent: 0.2,
            feeBps: 20,
            feeSource: "documented-default",
            feeLabel: "~0.2% (estimate)",
            error: "Solver returned invalid deposit address",
          };
        }
      }

      const tokenInfo = tokenPrices.get(params.originAsset);
      const appFee = body.quoteRequest?.appFees?.[0];
      const hasFee = typeof appFee?.fee === "number";
      const feeBps = hasFee ? appFee.fee : 20;
      const feePercent = feeBps / 100;
      const feeSource = hasFee ? ("quote" as const) : ("documented-default" as const);
      const feeLabel = hasFee
        ? `${feePercent}% (${feeBps} bps)`
        : "0.2% default solver fee (no partner key)";

      return {
        ok: true,
        state: "available",
        source: "live",
        asOf: body.timestamp ?? new Date().toISOString(),
        depositAddress: validDepositAddress,
        amountIn: body.quote.amountIn,
        amountInFormatted: body.quote.amountInFormatted ?? "0",
        amountInUsd: body.quote.amountInUsd ?? "0",
        amountOut: body.quote.amountOut ?? usdcMinor,
        amountOutFormatted: body.quote.amountOutFormatted ?? params.targetUsdcAmountDecimal,
        spotPrice: tokenInfo?.price,
        spotPriceUpdatedAt: tokenInfo?.priceUpdatedAt,
        coingeckoId: tokenInfo?.coingeckoId,
        timeEstimateSeconds: body.quote.timeEstimate ?? 20,
        deadlineIso: body.quote.deadline ?? deadlineIso,
        correlationId: body.correlationId ?? "",
        feePercent,
        feeBps,
        feeSource,
        feeLabel,
        appFees: body.quoteRequest?.appFees,
      };
    } catch {
      const tokenPrices = await tokenPricesPromise;
      return this.buildOracleFallbackQuote({
        originAsset: params.originAsset,
        targetUsdcAmountDecimal: params.targetUsdcAmountDecimal,
        recipientNearAccount: params.recipientNearAccount,
        usdcMinor,
        deadlineIso,
        tokenPrices,
        reason: "Solver unavailable, retry",
      });
    }
  }

  /**
   * Poll status of an active deposit address generated by `dry: false`.
   */
  async getStatus(depositAddress: string): Promise<OneClickSwapStatus> {
    try {
      const res = await fetch(
        `${this.baseUrl}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
        { signal: AbortSignal.timeout(2500) },
      );
      if (!res.ok) {
        return { status: "PENDING_DEPOSIT" };
      }
      const body = (await res.json()) as {
        status?: OneClickSwapStatus["status"];
        updatedAt?: string;
        correlationId?: string;
        swapDetails?: {
          originChainTxHashes?: string[];
          destinationChainTxHashes?: string[];
        };
      };
      return {
        status: body.status ?? "PENDING_DEPOSIT",
        updatedAt: body.updatedAt,
        correlationId: body.correlationId,
        originTxHashes: body.swapDetails?.originChainTxHashes,
        destinationTxHashes: body.swapDetails?.destinationChainTxHashes,
      };
    } catch {
      return { status: "PENDING_DEPOSIT" };
    }
  }
}
