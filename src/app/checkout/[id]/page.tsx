"use client";

import React, { use, useCallback, useEffect, useState } from "react";

interface CheckoutItem {
  id: string;
  escrowId: string;
  status: string;
  amountDecimal: string;
  receivedDecimal: string;
  remainingDecimal: string;
  commitment: string;
}

export default function PublicCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<CheckoutItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/state", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { paymentRequests: CheckoutItem[] };
      const found = data.paymentRequests.find((p) => p.id === id) ?? null;
      setItem(found);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pay = async (amountDecimal: string) => {
    if (!item) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SIMULATE_BUYER_DEPOSIT",
          escrowId: item.escrowId,
          amountDecimal,
        }),
      });
      if (res.ok) {
        await load();
        setMsg(`Submitted ${amountDecimal} USDC deposit to escrow.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--bg-paper)",
      }}
    >
      <div className="instrument-panel" style={{ maxWidth: 520, width: "100%" }}>
        <div className="mono-label" style={{ marginBottom: "0.5rem" }}>
          LEDGERLY // PUBLIC ESCROW CHECKOUT
        </div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 400, marginBottom: "1rem" }}>
          Settlement Request {id}
        </h1>

        {!item ? (
          <div className="mono-label">LOADING ESCROW TELEMETRY…</div>
        ) : (
          <>
            <div className="hairline-top hairline-bottom" style={{ padding: "1rem 0", marginBottom: "1rem" }}>
              <div className="mono-label">AMOUNT DUE</div>
              <div className="mono-data" style={{ fontSize: "1.75rem", fontWeight: 600, margin: "0.25rem 0" }}>
                {Number(item.amountDecimal).toFixed(2)} USDC
              </div>
              <div className="mono-label">
                STATUS: {item.status} · RECEIVED: {Number(item.receivedDecimal).toFixed(2)} USDC
              </div>
              <div className="mono-label" style={{ marginTop: "0.35rem" }}>
                OPAQUE ESCROW ID: {item.escrowId.slice(0, 24)}…
              </div>
            </div>

            {msg && (
              <div className="mono-label" style={{ color: "var(--accent-emerald)", marginBottom: "0.75rem" }}>
                {msg}
              </div>
            )}

            {(item.status === "OPEN" || item.status === "PARTIALLY_PAID") && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  className="ledger-btn"
                  disabled={busy}
                  onClick={() => pay(Number(item.remainingDecimal).toFixed(2))}
                >
                  SETTLE EXACT ({Number(item.remainingDecimal).toFixed(2)} USDC)
                </button>
                <button
                  className="ledger-btn-outline"
                  disabled={busy}
                  onClick={() => pay((Number(item.amountDecimal) + 20).toFixed(2))}
                >
                  SIMULATE OVERPAY (+20 USDC)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
