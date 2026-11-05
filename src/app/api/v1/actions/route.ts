import { NextResponse } from "next/server";
import {
  Money,
   type AccountId,
  type Currency,
  type EscrowId,
  type GrantId,
  type PaymentRequestId,
  type RemittanceId,
} from "@/shared";
import { DEMO_ACTOR, DEMO_ORG_ID, buildDashboardSnapshot, getRuntime } from "@/app/api/_runtime";

export async function POST(request: Request) {
  const rt = await getRuntime();
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");

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
    return NextResponse.json({ ok: true, result: res.value, state: await buildDashboardSnapshot() });
  }

  if (action === "SIMULATE_BUYER_DEPOSIT") {
    const escrowId = String(body.escrowId ?? "") as EscrowId;
    const amountDecimal = String(body.amountDecimal ?? "0");
    const payer = String(body.payer ?? "buyer-treasury.testnet") as AccountId;
    const parsed = Money.parse(amountDecimal, "USDC");
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    await rt.chain.simulateDeposit({
      escrowId,
      depositor: payer,
      amountMinor: parsed.value.amountMinor,
    });
    await rt.indexer.runOnce();
    return NextResponse.json({ ok: true, state: await buildDashboardSnapshot() });
  }

  if (action === "CREATE_AND_FUND_REMITTANCE") {
    const sourceUsdcDecimal = String(body.sourceUsdcDecimal ?? "200.00");
    const targetCurrency = String(body.targetCurrency ?? "PHP") as Currency;
    const recipientType = (body.recipientType ?? "EWALLET") as "NEAR_ACCOUNT" | "BANK" | "EWALLET";
    const recipientName = String(body.recipientName ?? "Maria Clara Textiles");
    const recipientAccountOrWallet = String(body.recipientAccountOrWallet ?? "GCASH:+63-917-882-1900");
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
      sourceMoney.value.amountMinor >= 1_000_000_000n && body.includeTravelRule !== false
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
      rt.offRamp.setBehavior({ mode: "SUCCESS" });
    }

    await refreshAuditorGrant(rt);
    return NextResponse.json({ ok: true, state: await buildDashboardSnapshot() });
  }

  if (action === "RETRY_FAILED_SETTLEMENTS") {
    rt.offRamp.setBehavior({ mode: "SUCCESS" });
    const stats = await rt.settlement.runOnce();
    return NextResponse.json({ ok: true, stats, state: await buildDashboardSnapshot() });
  }

  if (action === "REFRESH_AUDIT_GRANT") {
    await refreshAuditorGrant(rt);
    return NextResponse.json({ ok: true, state: await buildDashboardSnapshot() });
  }

  return NextResponse.json({ ok: false, error: { code: "UNKNOWN_ACTION", message: action } }, { status: 400 });
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
  }
}
