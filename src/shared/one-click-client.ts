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

export class OneClickClient {
  private static tokensCache: Map<string, { price: number; priceUpdatedAt: string; coingeckoId?: string }> | null = null;
  private static tokensCacheTime = 0;

  constructor(private readonly baseUrl = BASE_URL) {}

  /**
   * Fetch live token prices from 1Click token registry with caching.
   */
  async getTokenPrices(): Promise<Map<string, { price: number; priceUpdatedAt: string; coingeckoId?: string }>> {
    const now = Date.now();
    if (OneClickClient.tokensCache && now - OneClickClient.tokensCacheTime < 30_000) {
      return OneClickClient.tokensCache;
    }
    try {
      const res = await fetch(`${this.baseUrl}/v0/tokens`, {
        signal: AbortSignal.timeout(3500),
      });
      if (res.ok) {
        const tokens = (await res.json()) as Array<{
          assetId?: string;
          price?: number;
          priceUpdatedAt?: string;
          coingeckoId?: string;
        }>;
        const map = new Map<string, { price: number; priceUpdatedAt: string; coingeckoId?: string }>();
        for (const t of tokens) {
          if (t.assetId && typeof t.price === "number") {
            map.set(t.assetId, {
              price: t.price,
              priceUpdatedAt: t.priceUpdatedAt ?? new Date().toISOString(),
              coingeckoId: t.coingeckoId,
            });
          }
        }
        OneClickClient.tokensCache = map;
        OneClickClient.tokensCacheTime = now;
        return map;
      }
    } catch {
      // ignore
    }
    return OneClickClient.tokensCache ?? new Map();
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
    refundToAccount?: string;
  }): Promise<OneClickQuoteResult> {
    const usdcMinor = Math.round(Number(params.targetUsdcAmountDecimal) * 1_000_000).toString();
    const deadlineIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const refundTo = params.refundToAccount ?? params.recipientNearAccount;

    const payload = {
      dry: params.dry ?? true,
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

    try {
      const res = await fetch(`${this.baseUrl}/v0/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          ok: false,
          amountIn: "0",
          amountInFormatted: "0",
          amountInUsd: "0",
          amountOut: usdcMinor,
          amountOutFormatted: params.targetUsdcAmountDecimal,
          timeEstimateSeconds: 20,
          correlationId: "",
          error: `1Click API returned HTTP ${res.status}: ${errText.slice(0, 160)}`,
        };
      }

      const body = (await res.json()) as {
        quote?: {
          amountIn: string;
          amountInFormatted: string;
          amountInUsd: string;
          amountOut: string;
          amountOutFormatted: string;
          depositAddress?: string;
          timeEstimate?: number;
          deadline?: string;
        };
        correlationId?: string;
      };

      if (!body.quote) {
        return {
          ok: false,
          amountIn: "0",
          amountInFormatted: "0",
          amountInUsd: "0",
          amountOut: usdcMinor,
          amountOutFormatted: params.targetUsdcAmountDecimal,
          timeEstimateSeconds: 20,
          correlationId: body.correlationId ?? "",
          error: "1Click API did not return quote body",
        };
      }

      const tokenPrices = await this.getTokenPrices();
      const tokenInfo = tokenPrices.get(params.originAsset);

      return {
        ok: true,
        depositAddress: body.quote.depositAddress,
        amountIn: body.quote.amountIn,
        amountInFormatted: body.quote.amountInFormatted,
        amountInUsd: body.quote.amountInUsd,
        amountOut: body.quote.amountOut,
        amountOutFormatted: body.quote.amountOutFormatted,
        spotPrice: tokenInfo?.price,
        spotPriceUpdatedAt: tokenInfo?.priceUpdatedAt,
        coingeckoId: tokenInfo?.coingeckoId,
        timeEstimateSeconds: body.quote.timeEstimate ?? 20,
        deadlineIso: body.quote.deadline,
        correlationId: body.correlationId ?? "",
      };
    } catch (err) {
      return {
        ok: false,
        amountIn: "0",
        amountInFormatted: "0",
        amountInUsd: "0",
        amountOut: usdcMinor,
        amountOutFormatted: params.targetUsdcAmountDecimal,
        timeEstimateSeconds: 20,
        correlationId: "",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Poll status of an active deposit address generated by `dry: false`.
   */
  async getStatus(depositAddress: string): Promise<OneClickSwapStatus> {
    try {
      const res = await fetch(
        `${this.baseUrl}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
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
