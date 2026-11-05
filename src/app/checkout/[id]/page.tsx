"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [transition, setTransition] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async (prevStatus?: string) => {
    const res = await fetch("/api/v1/state", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { paymentRequests: CheckoutItem[] };
      const found = data.paymentRequests.find((p) => p.id === id) ?? null;
      if (prevStatus && found && prevStatus !== found.status) {
        setTransition({ from: prevStatus, to: found.status });
      }
      setItem(found);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const pay = async (key: string, amountDecimal: string) => {
    if (!item) return;
    const prevStatus = item.status;
    setBusyKey(key);
    setMsg(null);
    const start = Date.now();
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
      const elapsed = Date.now() - start;
      if (elapsed < 360) {
        await new Promise((r) => setTimeout(r, 360 - elapsed));
      }
      if (res.ok) {
        await load(prevStatus);
        setMsg({
          kind: "success",
          text: `Confirmed ${amountDecimal} USDC deposit to escrow on NEAR Testnet.`,
        });
      } else {
        setMsg({
          kind: "error",
          text: "Deposit transaction could not be processed.",
        });
      }
    } finally {
      setBusyKey(null);
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
        background: "var(--bg-ivory)",
      }}
    >
      <div className="fin-card" style={{ maxWidth: 540, width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.65rem",
          }}
        >
          <span className="mono-label">Ledgerly · Confidential Buyer Checkout</span>
          <Link
            href="/app/merchant"
            style={{
              fontSize: "0.78rem",
              color: "var(--sage-green)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ← Back to Merchant View
          </Link>
        </div>

        <h1 style={{ fontSize: "1.6rem", fontWeight: 500, marginBottom: "1rem" }}>
          Settlement Request {id}
        </h1>

        {!item ? (
          <div className="mono-label">Loading escrow telemetry…</div>
        ) : (
          <>
            <div
              className={`hairline-top hairline-bottom ${transition ? "tx-row-transitioned" : ""}`}
              style={{ padding: "1.1rem 0.65rem", marginBottom: "1rem", borderRadius: 6 }}
            >
              <div className="mono-label">Amount Due</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  margin: "0.35rem 0",
                }}
              >
                <div className="mono-data" style={{ fontSize: "1.75rem", fontWeight: 600 }}>
                  {Number(item.amountDecimal).toFixed(2)} USDC
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  {transition && (
                    <span className="status-transition-tag">
                      {transition.from} → {transition.to}
                    </span>
                  )}
                  <span
                    className={
                      item.status === "SETTLED"
                        ? "status-pill status-pill-emerald"
                        : "status-pill status-pill-blue"
                    }
                  >
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="mono-label">
                Received: {Number(item.receivedDecimal).toFixed(2)} USDC · Remaining:{" "}
                {Number(item.remainingDecimal).toFixed(2)} USDC
              </div>
              <div className="mono-label" style={{ marginTop: "0.35rem" }}>
                Opaque Escrow ID: {item.escrowId.slice(0, 24)}…
              </div>
            </div>

            {msg && (
              <div
                className={msg.kind === "error" ? "inline-error-banner" : undefined}
                style={
                  msg.kind === "success"
                    ? {
                        padding: "0.75rem 0.95rem",
                        borderRadius: 8,
                        border: "1px solid rgba(62, 107, 88, 0.28)",
                        background: "var(--sage-green-soft)",
                        color: "var(--sage-green)",
                        fontSize: "0.84rem",
                        fontWeight: 500,
                        marginBottom: "1rem",
                      }
                    : { marginBottom: "1rem" }
                }
              >
                {msg.text}
              </div>
            )}

            {(item.status === "OPEN" || item.status === "PARTIALLY_PAID") && (
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  className="btn-primary"
                  disabled={Boolean(busyKey)}
                  onClick={() => pay("exact", Number(item.remainingDecimal).toFixed(2))}
                >
                  {busyKey === "exact" ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      <span>Processing…</span>
                    </>
                  ) : (
                    <span>Settle Exact ({Number(item.remainingDecimal).toFixed(2)} USDC)</span>
                  )}
                </button>
                <button
                  className="btn-secondary"
                  disabled={Boolean(busyKey)}
                  onClick={() => pay("overpay", (Number(item.amountDecimal) + 20).toFixed(2))}
                >
                  {busyKey === "overpay" ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      <span>Processing…</span>
                    </>
                  ) : (
                    <span>Simulate Overpay (+20 USDC)</span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
