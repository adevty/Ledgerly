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
});
