import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/state/route";
import { POST } from "@/app/api/v1/actions/route";

describe("Module 6 — Next.js API Routes & Live Protocol State", () => {
  it("serves initial seeded dashboard state and executes merchant + remittance + audit actions", async () => {
    const res1 = await GET();
    expect(res1.status).toBe(200);
    const initial = await res1.json();
    expect(initial.organization.nearAccount).toBe("atelier-sari.ledgerly.testnet");
    expect(initial.paymentRequests.length).toBeGreaterThanOrEqual(2);
    expect(initial.remittances.length).toBeGreaterThanOrEqual(1);
    expect(initial.audit.chainValid).toBe(true);

    // Create a new payment request via POST /api/v1/actions
    const createReq = new Request("http://localhost:3000/api/v1/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_PAYMENT_REQUEST",
        orderRef: "INV-UI-TEST-01",
        amountDecimal: "310.00",
        customerEmail: "ap@client.example",
      }),
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(200);
    const createdBody = await createRes.json();
    expect(createdBody.ok).toBe(true);
    expect(createdBody.state.paymentRequests.length).toBe(initial.paymentRequests.length + 1);
  });

  it("handles FAUCET_USDC for named and 64-character implicit accounts with proper validation", async () => {
    // 1. Valid named account
    const namedReq = new Request("http://localhost:3000/api/v1/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "FAUCET_USDC",
        accountId: "buyer.testnet",
      }),
    });
    const namedRes = await POST(namedReq);
    expect(namedRes.status).toBe(200);
    const namedBody = (await namedRes.json()) as { ok: boolean; txHash: string; explorerUrl: string };
    expect(namedBody.ok).toBe(true);
    expect(typeof namedBody.txHash).toBe("string");

    // 2. Valid 64-char implicit hex account
    const implicitReq = new Request("http://localhost:3000/api/v1/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "FAUCET_USDC",
        accountId: "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de",
      }),
    });
    const implicitRes = await POST(implicitReq);
    expect(implicitRes.status).toBe(200);
    const implicitBody = (await implicitRes.json()) as { ok: boolean; txHash: string };
    expect(implicitBody.ok).toBe(true);

    // 3. Invalid account format
    const invalidReq = new Request("http://localhost:3000/api/v1/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "FAUCET_USDC",
        accountId: "invalid_format_name",
      }),
    });
    const invalidRes = await POST(invalidReq);
    expect(invalidRes.status).toBe(400);
    const invalidBody = (await invalidRes.json()) as { ok: boolean; error: { code: string } };
    expect(invalidBody.ok).toBe(false);
    expect(invalidBody.error.code).toBe("INVALID_ACCOUNT");
  });
});
