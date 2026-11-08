import { NextResponse } from "next/server";
import {
  Money,
  NearRpcChainGateway,
  OneClickClient,
  type AccountId,
  type Currency,
  type EscrowId,
  type GrantId,
  type OnchainEvent,
  type PaymentRequestId,
  type RemittanceId,
  type TxHash,
} from "@/shared";
import {
  DEMO_ACTOR,
  DEMO_ORG_ID,
  buildDashboardSnapshot,
  getRuntime,
  invalidateDashboardSnapshotCache,
  resetRuntime,
} from "@/app/api/_runtime";

const ipRateLimits = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  entry.count++;
  return true;
}

const SIMULATION_ACTIONS = new Set([
  "SIMULATE_BUYER_DEPOSIT",
  "FAUCET_USDC",
  "AUTO_RECONCILE_DISCREPANCIES",
  "MANUAL_RECONCILE",
  "RETRY_FAILED_SETTLEMENTS",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    // 1. IP-based rate limiting
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    if (!checkIpRateLimit(clientIp)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Rate limit exceeded (max 30 requests/min). Please try again shortly.",
          },
        },
        { status: 429 },
      );
    }

    // 2. DEMO_MODE guard for simulation actions on public/production hosts
    const isProduction = process.env.NODE_ENV === "production";
    const isDemoMode = process.env.DEMO_MODE === "true";

    if (isProduction && !isDemoMode && SIMULATION_ACTIONS.has(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "DEMO_MODE_DISABLED",
            message: `Simulation action '${action}' is disabled on public hosts unless DEMO_MODE=true.`,
          },
        },
        { status: 403 },
      );
    }

    // 3. State reset protection with DEMO_ADMIN_TOKEN header
    if (action === "RESET_DEV_STATE") {
      const adminToken = process.env.DEMO_ADMIN_TOKEN;
      const authHeader = request.headers.get("x-demo-admin-token");

      if (adminToken && authHeader !== adminToken) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "UNAUTHORIZED_RESET",
              message: "State reset requires a valid x-demo-admin-token header matching DEMO_ADMIN_TOKEN.",
            },
          },
          { status: 401 },
        );
      }

      if (isProduction && !adminToken) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "RESET_DISABLED",
              message: "State reset is disabled in production without DEMO_ADMIN_TOKEN configured.",
            },
          },
          { status: 403 },
        );
      }

      resetRuntime();
      return NextResponse.json({ ok: true, message: "Runtime cache reset" });
    }

    const rt = await getRuntime();

  if (action === "CREATE_PAYMENT_REQUEST") {
    const orderRef = String(body.orderRef ?? "INV-2026-9001");
    const description = String(body.description ?? "B2B Settlement");
    const customerEmail = String(body.customerEmail ?? "finance@client.example");
    const amountDecimal = String(body.amountDecimal ?? "250.00");
    const id = `pr_${Date.now().toString(36)}` as PaymentRequestId;

    const res = await rt.payments.createPaymentRequest({
      idempotencyKey: `ui_${id}`,
      actor: DEMO_ACTOR,
      requestId: id,
      orgPublicKeyHex: rt.orgKeys.publicKeyHex,
      orderRef,
      description,
      customerEmail,
      amountDecimal,
      expiresInSec: 86400,
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 422 });
    }
    await refreshAuditorGrant(rt);
    return NextResponse.json({ ok: true, result: res.value, state: await buildDashboardSnapshot(true) });
  }

  if (action === "SIMULATE_BUYER_DEPOSIT") {
    const escrowId = String(body.escrowId ?? "") as EscrowId;
    const amountDecimal = String(body.amountDecimal ?? "0");
    const payer = String(body.payer ?? "buyer-treasury.testnet") as AccountId;
    const parsed = Money.parse(amountDecimal, "USDC");
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const txHash = await rt.chain.simulateDeposit({
      escrowId,
      depositor: payer,
      amountMinor: parsed.value.amountMinor,
    });
    await rt.indexer.runOnce();
    return NextResponse.json({
      ok: true,
      txHash,
      explorerUrl: `${rt.explorerBaseUrl}/txns/${txHash}`,
      state: await buildDashboardSnapshot(true),
    });
  }

  if (action === "FAUCET_USDC") {
    const rawAccount = String(body.accountId ?? "").trim().toLowerCase();
    const isNamedTestnet = /^[a-z0-9._-]+\.testnet$/.test(rawAccount);
    const isImplicitTestnet = /^[0-9a-f]{64}$/.test(rawAccount);

    if (!isNamedTestnet && !isImplicitTestnet) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "INVALID_ACCOUNT",
            message: "A valid NEAR testnet account (named .testnet or 64-char implicit) is required",
          },
        },
        { status: 400 },
      );
    }

    // In sandbox simulation mode (or when chain does not have real RPC signer), simulate faucet minting
    if (rt.networkMode !== "NEAR_TESTNET_RPC" || !("sendFunctionCall" in rt.chain)) {
      const txHash = `tx_faucet_sim_${Date.now()}` as TxHash;
      return NextResponse.json({
        ok: true,
        txHash,
        explorerUrl: `${rt.explorerBaseUrl}/txns/${txHash}`,
        simulated: true,
      });
    }

    try {
      // Fixed 100 USDC per call; the token contract auto-registers storage for the buyer.
      const { txHash } = await (rt.chain as NearRpcChainGateway).sendFunctionCall(
        rt.chain.usdcContractId,
        "faucet",
        {
          account_id: rawAccount,
          amount: "100000000",
        },
        50_000_000_000_000n,
      );
      return NextResponse.json({ ok: true, txHash, explorerUrl: `${rt.explorerBaseUrl}/txns/${txHash}` });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "FAUCET_TRANSACTION_FAILED",
            message: err instanceof Error ? err.message : String(err),
          },
        },
        { status: 500 },
      );
    }
  }

  if (action === "ONE_CLICK_QUOTE") {
    const originAsset = String(body.originAsset ?? "nep141:sol.omft.near");
    const amountUsdcDecimal = String(body.amountUsdcDecimal ?? "100.00");
    const dry = body.dry !== false; // default true unless explicitly requested
    const recipientNearAccount = "atelier-sari.near";
    const confirmedLiveDisclaimer = body.confirmedLiveDisclaimer === true;

    if (!dry) {
      const isLiveEnabled =
        process.env.ENABLE_LIVE_INTENTS === "true" || process.env.ENABLE_LIVE_INTENTS === "1";
      if (!isLiveEnabled || !confirmedLiveDisclaimer) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "LIVE_INTENTS_UNAUTHORIZED",
              message:
                "Live deposit address generation requires ENABLE_LIVE_INTENTS=true and explicit user confirmation.",
            },
          },
          { status: 403 },
        );
      }
    }

    const client = new OneClickClient();
    const quote = await client.requestExactOutputQuote({
      originAsset,
      targetUsdcAmountDecimal: amountUsdcDecimal,
      recipientNearAccount,
      dry,
      confirmedLiveDisclaimer,
    });

    if (!quote.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "ONE_CLICK_QUOTE_ERROR",
            message: quote.error ?? "Solver unavailable, retry",
            state: quote.state,
          },
          quote,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ ok: true, quote });
  }

  if (action === "ONE_CLICK_STATUS") {
    const depositAddress = String(body.depositAddress ?? "").trim();
    if (!depositAddress) {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_DEPOSIT_ADDRESS", message: "depositAddress is required" } },
        { status: 400 },
      );
    }

    const client = new OneClickClient();
    const status = await client.getStatus(depositAddress);
    return NextResponse.json({ ok: true, status });
  }

  if (action === "VERIFY_WALLET_TX") {
    const txHash = String(body.txHash ?? "").trim() as TxHash;
    const senderAccountId = body.senderAccountId
      ? (String(body.senderAccountId).trim() as AccountId)
      : undefined;
    if (!txHash) {
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_TX_HASH", message: "Transaction hash is required" } },
        { status: 400 },
      );
    }

    const hasIngest =
      "ingestExternalTransaction" in rt.chain &&
      typeof (rt.chain as unknown as { ingestExternalTransaction?: unknown }).ingestExternalTransaction ===
        "function";

    if (hasIngest) {
      let events: readonly OnchainEvent[] = [];
      try {
        events = await (
          rt.chain as unknown as {
            ingestExternalTransaction: (h: TxHash, s?: AccountId) => Promise<readonly OnchainEvent[]>;
          }
        ).ingestExternalTransaction(txHash, senderAccountId);
      } catch (err) {
        const rawMsg = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          rawMsg.includes("429") ||
          rawMsg.toLowerCase().includes("rate limit") ||
          rawMsg.includes("DEPRECATED");
        const message = isRateLimit
          ? `Jaringan RPC publik NEAR Testnet sedang sibuk (rate limit tercapai). Transaksi ${txHash} belum dapat diverifikasi saat ini. Silakan coba kembali dalam beberapa detik.`
          : rawMsg;

        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "TX_NOT_FOUND",
              message,
            },
          },
          { status: 422 },
        );
      }

      if (!events || events.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "NO_ESCROW_EVENTS_FOUND",
              message: `Transaction ${txHash} was queried on-chain, but contains no valid NEP-297 escrow events for contract ${rt.escrowContractId}.`,
            },
          },
          { status: 422 },
        );
      }
    } else {
      const mockChain = rt.chain as unknown as { getRecordedEvents?: () => readonly OnchainEvent[] };
      const recorded =
        typeof mockChain.getRecordedEvents === "function" ? mockChain.getRecordedEvents() : [];
      const match = recorded.filter((e) => e.txHash === txHash);
      if (match.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "TX_NOT_FOUND",
              message: `Transaction ${txHash} not found in active chain events.`,
            },
          },
          { status: 422 },
        );
      }
    }

    const indexerResult = await rt.indexer.runOnce();
    return NextResponse.json({
      ok: true,
      txHash,
      explorerUrl: `${rt.explorerBaseUrl}/txns/${txHash}`,
      eventsProcessed: indexerResult.processedCount,
      state: await buildDashboardSnapshot(true),
    });
  }

  if (action === "CREATE_AND_FUND_REMITTANCE") {
    const sourceUsdcDecimal = String(body.sourceUsdcDecimal ?? "200.00").replace(/,/g, "").trim();
    const targetCurrency = String(body.targetCurrency ?? "PHP") as Currency;
    const recipientType = (body.recipientType ?? "EWALLET") as "NEAR_ACCOUNT" | "BANK" | "EWALLET";
    const recipientName = String(body.recipientName ?? "Maria Clara Textiles").trim();
    let recipientAccountOrWallet = String(body.recipientAccountOrWallet ?? "GCASH:+63-917-882-1900").trim();
    if (recipientType === "NEAR_ACCOUNT" && !recipientAccountOrWallet.includes(".")) {
      recipientAccountOrWallet = `${recipientAccountOrWallet}.testnet`;
    }
    const recipientCountry = String(body.recipientCountry ?? "PH");
    const simulateMode = String(body.offRampMode ?? "SUCCESS") as
      | "SUCCESS"
      | "TRANSIENT_FAILURE"
      | "PERMANENT_FAILURE";

    const id = `rm_${Date.now().toString(36)}` as RemittanceId;
    const sourceMoney = Money.parse(sourceUsdcDecimal, "USDC");
    if (!sourceMoney.ok) {
      return NextResponse.json({ ok: false, error: sourceMoney.error }, { status: 400 });
    }

    const travelRule =
      sourceMoney.value.amountMinor >= 1_000_000_000n
        ? {
            originatorName: "Atelier Sari Global Ltd.",
            originatorCountry: "SG",
            beneficiaryName: recipientName,
            beneficiaryCountry: recipientCountry,
            purposeOfPayment: "Supplier trade settlement",
          }
        : undefined;

    const quoted = await rt.remittances.createQuotedRemittance({
      idempotencyKey: `ui_${id}`,
      actor: DEMO_ACTOR,
      remittanceId: id,
      orgPublicKeyHex: rt.orgKeys.publicKeyHex,
      sourceUsdcDecimal,
      targetCurrency,
      recipientType,
      recipientName,
      recipientAccountOrWallet,
      recipientCountry,
      ...(travelRule ? { travelRule } : {}),
      quoteLockSec: 3600,
    });

    if (!quoted.ok) {
      return NextResponse.json({ ok: false, error: quoted.error }, { status: 422 });
    }

    if (quoted.value.status !== "BLOCKED") {
      rt.offRamp.setBehavior({ mode: simulateMode });
      await rt.chain.simulateDeposit({
        escrowId: quoted.value.escrowId,
        depositor: "atelier-sari.ledgerly.testnet" as AccountId,
        amountMinor: BigInt(quoted.value.sourceMinor),
        commitment: quoted.value.commitment,
        kind: "Remittance",
      });
      await rt.indexer.runOnce();
      await rt.settlement.runOnce();
      rt.offRamp.setBehavior({ mode: "SUCCESS" });
    }

    await refreshAuditorGrant(rt);
    return NextResponse.json({ ok: true, state: await buildDashboardSnapshot(true) });
  }

  if (action === "RETRY_FAILED_SETTLEMENTS") {
    rt.offRamp.setBehavior({ mode: "SUCCESS" });
    const stats = await rt.settlement.runOnce();
    return NextResponse.json({ ok: true, stats, state: await buildDashboardSnapshot(true) });
  }

  if (action === "REFRESH_AUDIT_GRANT") {
    await refreshAuditorGrant(rt);
    return NextResponse.json({ ok: true, state: await buildDashboardSnapshot(true) });
  }

  if (action === "EXPORT_RECONCILIATION_CSV") {
    await rt.disclosures.recordAuditAction(
      DEMO_ACTOR.userId,
      "EXPORT_RECONCILIATION_CSV",
      `ledger_export_${Date.now()}`,
    );
    invalidateDashboardSnapshotCache();
    return NextResponse.json({ ok: true, state: await buildDashboardSnapshot(true) });
  }

  if (action === "ANCHOR_AUDIT_LOG" || action === "ANCHOR_ROOT") {
    const entry = await rt.disclosures.recordAuditAction(
      DEMO_ACTOR.userId,
      "MANUAL_ANCHOR",
      rt.defaultGrantId,
    );
    invalidateDashboardSnapshotCache();
    return NextResponse.json({ ok: true, entry, state: await buildDashboardSnapshot(true) });
  }

  if (action === "AUTO_RECONCILE_DISCREPANCIES" || action === "MANUAL_RECONCILE") {
    rt.offRamp.setBehavior({ mode: "SUCCESS" });
    const recon = await rt.reconciliation.runOnce();
    for (const d of recon.discrepancies) {
      try {
        if (d.onchainHeldMinor > 0n) {
          if (d.status === "SETTLED") {
            const receiver =
              d.kind === "PAYMENT_REQUEST"
                ? ("atelier-sari.ledgerly.testnet" as AccountId)
                : ("offramp-pool.ledgerly.testnet" as AccountId);
            await rt.chain.release({
              escrowId: d.escrowId,
              receiver,
              amountMinor: d.onchainHeldMinor,
            });
          } else if (d.status === "EXPIRED" || d.status === "QUOTED") {
            await rt.chain.refund({
              escrowId: d.escrowId,
              amountMinor: d.onchainHeldMinor,
            });
          }
        }
      } catch (err) {
        console.warn(`[Auto-Reconcile] Could not reconcile ${d.recordId}:`, err);
      }
    }
    await rt.settlement.runOnce();
    await rt.disclosures.recordAuditAction(
      DEMO_ACTOR.userId,
      "RECONCILE_DISCREPANCIES",
      `checked_${recon.checkedCount}_discrepancies_${recon.discrepancies.length}`,
    );
    invalidateDashboardSnapshotCache();
    return NextResponse.json({ ok: true, state: await buildDashboardSnapshot(true) });
  }

    return NextResponse.json(
      { ok: false, error: { code: "UNKNOWN_ACTION", message: action } },
      { status: 400 },
    );
  } catch (err) {
    console.error("[API /api/v1/actions] Unhandled error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 },
    );
  }
}

async function refreshAuditorGrant(rt: Awaited<ReturnType<typeof getRuntime>>) {
  const newGrantId = `grant_${Date.now().toString(36)}` as GrantId;
  const res = await rt.disclosures.issueScopedViewKey({
    actor: DEMO_ACTOR,
    grantId: newGrantId,
    auditorPublicKeyHex: rt.auditorKeys.publicKeyHex,
    orgPrivateKeyHex: rt.orgKeys.privateKeyHex,
    scope: {
      orgId: DEMO_ORG_ID,
      from: new Date(Date.now() - 7 * 86400 * 1000),
      to: new Date(Date.now() + 7 * 86400 * 1000),
      kinds: ["PAYMENT", "REMITTANCE"],
    },
    expiresAt: new Date(Date.now() + 30 * 86400 * 1000),
  });
  if (res.ok) {
    rt.defaultGrantId = newGrantId;
    rt.metaStore.set("default_grant_id", newGrantId);
    await rt.disclosures.recordAuditAction(DEMO_ACTOR.userId, "ROTATE_VIEW_KEY", newGrantId);
  }
}
