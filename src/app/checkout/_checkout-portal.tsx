"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  buildFtTransferCallPreview,
  buildMyNearWalletLoginUrl,
  connectEmbeddedTestnetWallet,
  connectMeteorWallet,
  consumeNearWalletCallbackUrl,
  disconnectNearWallet,
  isMeteorExtensionDetected,
  loadNearWalletSession,
  signFtDepositWithMeteor,
  type NearWalletSession,
} from "@/shared/near-wallet-client";
import { POPULAR_ONE_CLICK_ASSETS, type OneClickQuoteResult } from "@/shared/one-click-client";

export interface CheckoutItem {
  id: string;
  escrowId: string;
  status: string;
  amountDecimal: string;
  receivedDecimal: string;
  remainingDecimal: string;
  excessDecimal: string;
  heldDecimal: string;
  commitment: string;
  cipherPreview: string;
  paymentsCount: number;
  latestTxHash: string | null;
  createdAtIso: string;
}

export interface NetworkInfo {
  mode: "NEAR_TESTNET_RPC" | "LOCAL_SANDBOX_SIMULATION";
  rpcUrl: string;
  escrowContractId: string;
  usdcContractId: string;
  explorerBaseUrl: string;
}

interface ToastMsg {
  id: string;
  kind: "success" | "error";
  title: string;
  detail?: string;
}

export function CheckoutPortal({ initialRequestId }: { initialRequestId?: string }) {
  const [requests, setRequests] = useState<CheckoutItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialRequestId ?? "");
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [wallet, setWallet] = useState<NearWalletSession | null>(null);
  const [meteorDetected, setMeteorDetected] = useState(false);
  const [meteorNetwork, setMeteorNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [customBuyerAccount, setCustomBuyerAccount] = useState("kyoto-living.testnet");
  const [customPayAmount, setCustomPayAmount] = useState("");
  const [externalTxInput, setExternalTxInput] = useState("");
  const [showPayloadInspector, setShowPayloadInspector] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [transition, setTransition] = useState<{ from: string; to: string } | null>(null);

  // NEAR Intents / 1Click Cross-Chain State
  const [payRail, setPayRail] = useState<"NEAR_WALLET" | "ONE_CLICK_INTENTS">("NEAR_WALLET");
  const [oneClickAsset, setOneClickAsset] = useState<typeof POPULAR_ONE_CLICK_ASSETS[number]>(
    POPULAR_ONE_CLICK_ASSETS[0],
  );
  const [oneClickQuote, setOneClickQuote] = useState<OneClickQuoteResult | null>(null);
  const [oneClickDepositAddress, setOneClickDepositAddress] = useState<string | null>(null);
  const [oneClickStatus, setOneClickStatus] = useState<string | null>(null);
  const [oneClickLoading, setOneClickLoading] = useState(false);

  const pushToast = useCallback((kind: "success" | "error", title: string, detail?: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, kind, title, detail }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const loadState = useCallback(
    async (prevStatus?: string, targetId?: string) => {
      const res = await fetch("/api/v1/state", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        network?: NetworkInfo;
        paymentRequests: CheckoutItem[];
      };
      if (data.network) {
        setNetwork(data.network);
      }
      const list = data.paymentRequests ?? [];
      setRequests(list);

      const effectiveId =
        targetId ||
        selectedId ||
        initialRequestId ||
        list.find((r) => r.status === "OPEN" || r.status === "PARTIALLY_PAID")?.id ||
        list[0]?.id ||
        "";

      if (effectiveId && effectiveId !== selectedId) {
        setSelectedId(effectiveId);
      }

      const found = list.find((p) => p.id === effectiveId) ?? null;
      if (found) {
        if (prevStatus && prevStatus !== found.status) {
          setTransition({ from: prevStatus, to: found.status });
          if (found.status === "SETTLED" || found.status === "PAID") {
            pushToast(
              "success",
              "Payment Confirmed On-Chain",
              `Invoice ${found.id} settled on NEAR Testnet (${found.amountDecimal} USDC).`,
            );
          }
        }
        if (found.latestTxHash) {
          setLastTxHash(found.latestTxHash);
        }
        const rem = Number(found.remainingDecimal);
        setCustomPayAmount(rem > 0 ? rem.toFixed(2) : Number(found.amountDecimal).toFixed(2));
      }
    },
    [initialRequestId, selectedId, pushToast],
  );

  const verifyExternalTxHash = useCallback(
    async (txHash: string, senderAccountId?: string) => {
      const cleanHash = txHash.trim();
      if (!cleanHash) return;
      setBusyKey("verify_tx");
      setErrorBanner(null);
      try {
        const res = await fetch("/api/v1/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "VERIFY_WALLET_TX",
            txHash: cleanHash,
            senderAccountId,
          }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          txHash?: string;
          error?: { message?: string };
        };
        if (res.ok && body.ok) {
          setLastTxHash(cleanHash);
          setExternalTxInput("");
          await loadState();
          pushToast(
            "success",
            "On-chain transaction verified",
            `Receipt ${cleanHash.slice(0, 14)}… ingested from NEAR RPC`,
          );
        } else {
          setErrorBanner(body.error?.message ?? "Could not verify transaction hash on NEAR RPC.");
        }
      } finally {
        setBusyKey(null);
      }
    },
    [loadState, pushToast],
  );

  useEffect(() => {
    void loadState();
    setMeteorDetected(isMeteorExtensionDetected());
    const timer = setTimeout(() => {
      setMeteorDetected(isMeteorExtensionDetected());
    }, 350);

    const existing = loadNearWalletSession();
    const callback = consumeNearWalletCallbackUrl();
    const activeSession = callback.session ?? existing;
    if (activeSession) {
      setWallet(activeSession);
      setCustomBuyerAccount(activeSession.accountId);
    }
    if (callback.transactionHashes.length > 0) {
      const firstTx = callback.transactionHashes[0]!;
      void verifyExternalTxHash(firstTx, activeSession?.accountId);
    }
    return () => clearTimeout(timer);
  }, [loadState, verifyExternalTxHash]);

  const item = requests.find((r) => r.id === selectedId) ?? requests[0] ?? null;

  // Auto-sync polling: refresh state while current invoice is open or partially paid
  useEffect(() => {
    if (!item || item.status === "SETTLED" || item.status === "EXPIRED" || item.status === "CANCELLED") {
      return;
    }
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible" && !busyKey) {
        void loadState(item.status, item.id);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [item, busyKey, loadState]);

  const handleSelectInvoice = (req: CheckoutItem) => {
    setSelectedId(req.id);
    setTransition(null);
    setErrorBanner(null);
    setLastTxHash(req.latestTxHash);
    const rem = Number(req.remainingDecimal);
    setCustomPayAmount(rem > 0 ? rem.toFixed(2) : Number(req.amountDecimal).toFixed(2));
  };

  const fetchOneClickQuote = useCallback(
    async (assetId: string, amountDecimal: string, dry = true) => {
      setOneClickLoading(true);
      try {
        const res = await fetch("/api/v1/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ONE_CLICK_QUOTE",
            originAsset: assetId,
            amountUsdcDecimal: amountDecimal,
            dry,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          quote?: OneClickQuoteResult;
          error?: { message?: string };
        };
        if (data.ok && data.quote) {
          setOneClickQuote(data.quote);
          if (data.quote.depositAddress) {
            setOneClickDepositAddress(data.quote.depositAddress);
            setOneClickStatus("PENDING_DEPOSIT");
          }
        } else {
          setOneClickQuote(null);
        }
      } catch {
        setOneClickQuote(null);
      } finally {
        setOneClickLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (payRail === "ONE_CLICK_INTENTS" && item) {
      const amt = customPayAmount || item.remainingDecimal || item.amountDecimal;
      void fetchOneClickQuote(oneClickAsset.assetId, amt, true);
    }
  }, [payRail, oneClickAsset, item, customPayAmount, fetchOneClickQuote]);

  useEffect(() => {
    if (!oneClickDepositAddress || item?.status === "SETTLED") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/v1/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ONE_CLICK_STATUS",
            depositAddress: oneClickDepositAddress,
          }),
        });
        const data = (await res.json()) as { ok: boolean; status?: { status?: string } };
        if (data.ok && data.status?.status) {
          setOneClickStatus(data.status.status);
          if (data.status.status === "SUCCESS") {
            pushToast(
              "success",
              "1Click Cross-Chain Swap Settled",
              "Funds bridged and deposited to escrow on NEAR.",
            );
            void loadState();
          }
        }
      } catch {
        // ignore network error during background polling
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [oneClickDepositAddress, item, loadState, pushToast]);

  const handleGenerateOneClickAddress = async () => {
    if (!item) return;
    const amt = customPayAmount || item.remainingDecimal || item.amountDecimal;
    await fetchOneClickQuote(oneClickAsset.assetId, amt, false);
    pushToast(
      "success",
      `1Click Deposit Address Generated for ${oneClickAsset.name}`,
      `Intent created. Use Simulate Solver Settlement below to execute testnet escrow fulfillment.`,
    );
  };

  const handleSimulateOneClickFulfillment = async () => {
    if (!item) return;
    setBusyKey("simulate_oneclick");
    try {
      const amt = customPayAmount || item.remainingDecimal || item.amountDecimal;
      const res = await fetch("/api/v1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SIMULATE_BUYER_DEPOSIT",
          escrowId: item.escrowId,
          amountDecimal: amt,
          payer: `solver.${oneClickAsset.blockchain}.near`,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; txHash?: string };
      if (data.ok) {
        setOneClickStatus("SUCCESS");
        if (data.txHash) setLastTxHash(data.txHash);
        await loadState(item.status, item.id);
        pushToast(
          "success",
          "Cross-Chain Intent Settled by Solver",
          `Simulated fulfillment from ${oneClickAsset.name} to NEAR Testnet escrow.`,
        );
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleConnectMeteor = async () => {
    setBusyKey("connect_meteor");
    setErrorBanner(null);
    try {
      const contractId = network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";
      const session = await connectMeteorWallet(contractId, meteorNetwork);
      setWallet(session);
      setCustomBuyerAccount(session.accountId);
      pushToast(
        "success",
        "Meteor Wallet Connected",
        `${session.accountId} (${session.network.toUpperCase()})`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect to Meteor Wallet.";
      setErrorBanner(message);
      pushToast("error", "Meteor Wallet Connection Failed", message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleConnectMyNearWallet = () => {
    if (typeof window === "undefined") return;
    const contractId = network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";
    const loginUrl = buildMyNearWalletLoginUrl(contractId, window.location.href);
    window.location.href = loginUrl;
  };

  const handleConnectEmbedded = async () => {
    setBusyKey("connect_embedded");
    setErrorBanner(null);
    try {
      const session = await connectEmbeddedTestnetWallet(customBuyerAccount);
      setWallet(session);
      setCustomBuyerAccount(session.accountId);
      pushToast(
        "success",
        "Ed25519 Testnet Signer Active",
        `${session.accountId} · ${session.publicKey.slice(0, 18)}…`,
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleDisconnectWallet = () => {
    disconnectNearWallet();
    setWallet(null);
    pushToast("success", "Wallet Disconnected", "Cleared active NEAR buyer session.");
  };

  const requestFaucet = async () => {
    if (!wallet) return;
    setBusyKey("faucet");
    setErrorBanner(null);
    try {
      const res = await fetch("/api/v1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "FAUCET_USDC", accountId: wallet.accountId }),
      });
      const body = (await res.json()) as { ok?: boolean; txHash?: string; error?: { message?: string } };
      if (res.ok && body.ok) {
        pushToast("success", "100 test USDC minted", `To ${wallet.accountId}`);
      } else {
        const msg = body.error?.message ?? "Faucet failed.";
        setErrorBanner(msg);
        pushToast("error", "Faucet failed", msg);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const executePayment = async (key: string, amountDecimal: string) => {
    if (!item) return;
    setErrorBanner(null);
    let activeWallet = wallet;
    if (!activeWallet) {
      activeWallet = await connectEmbeddedTestnetWallet(customBuyerAccount);
      setWallet(activeWallet);
    }

    const prevStatus = item.status;
    setBusyKey(key);
    const start = Date.now();
    try {
      // Real path: the buyer's Meteor Wallet signs ft_transfer_call itself.
      if (activeWallet.provider === "METEOR_WALLET") {
        try {
          const { txHash } = await signFtDepositWithMeteor(activeWallet, {
            usdcContractId: network?.usdcContractId ?? network?.escrowContractId ?? "",
            escrowContractId: network?.escrowContractId ?? "",
            escrowId: item.escrowId,
            amountDecimal,
          });
          if (txHash) {
            await verifyExternalTxHash(txHash, activeWallet.accountId);
          } else {
            await loadState(prevStatus, item.id);
            pushToast(
              "success",
              "Signed in Meteor Wallet",
              "Wallet returned no tx hash; paste it under 'Verify transaction' if the status does not update.",
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : "Meteor Wallet could not sign.";
          setErrorBanner(message);
          pushToast("error", "Wallet signing failed", message);
        }
        return;
      }
      const res = await fetch("/api/v1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SIMULATE_BUYER_DEPOSIT",
          escrowId: item.escrowId,
          amountDecimal,
          payer: activeWallet.accountId,
        }),
      });
      const elapsed = Date.now() - start;
      if (elapsed < 320) {
        await new Promise((r) => setTimeout(r, 320 - elapsed));
      }
      const body = (await res.json()) as {
        ok?: boolean;
        txHash?: string;
        explorerUrl?: string;
        error?: { message?: string };
      };
      if (res.ok && body.ok) {
        if (body.txHash) {
          setLastTxHash(body.txHash);
        }
        await loadState(prevStatus, item.id);
        pushToast(
          "success",
          `Settled ${Number(amountDecimal).toFixed(2)} USDC on NEAR Testnet`,
          body.txHash
            ? `Payer: ${activeWallet.accountId} · Tx: ${body.txHash.slice(0, 12)}…`
            : `Payer: ${activeWallet.accountId}`,
        );
      } else {
        const errMsg = body.error?.message ?? "Deposit transaction could not be processed.";
        setErrorBanner(errMsg);
        pushToast("error", "Settlement Failed", errMsg);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const explorerBaseUrl = network?.explorerBaseUrl ?? "https://testnet.nearblocks.io";
  const escrowContractId = network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";
  const usdcContractId = network?.usdcContractId ?? escrowContractId;

  const ftPreview =
    item &&
    buildFtTransferCallPreview({
      usdcContractId,
      escrowContractId,
      escrowId: item.escrowId,
      depositorAccountId: wallet?.accountId ?? customBuyerAccount,
      amountDecimal:
        customPayAmount && Number(customPayAmount) > 0
          ? customPayAmount
          : Number(item.remainingDecimal) > 0
            ? item.remainingDecimal
            : item.amountDecimal,
    });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-ivory)", color: "var(--ink-charcoal)" }}>
      {/* Top Architectural Navigation Bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "rgba(252, 251, 249, 0.94)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "0.75rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", flexWrap: "wrap" }}>
            <Link
              href="/"
              style={{
                textDecoration: "none",
                color: "var(--ink-charcoal)",
                fontWeight: 600,
                fontSize: "0.98rem",
                letterSpacing: "-0.02em",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "var(--sage-green)",
                  display: "inline-block",
                }}
              />
              <span>Ledgerly</span>
            </Link>
            <span style={{ color: "var(--line-medium)" }}>/</span>
            <span className="mono-label" style={{ color: "var(--ink-body)" }}>
              Confidential Buyer Checkout
            </span>

            {requests.length > 0 && (
              <div className="filter-pill-group" role="tablist" aria-label="Select Invoice">
                {requests.map((r) => {
                  const active = item?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleSelectInvoice(r)}
                      className={`filter-pill ${active ? "filter-pill-active" : ""}`}
                    >
                      {r.id} · {Number(r.amountDecimal).toFixed(0)} USDC ({r.status})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            <span
              className={
                network?.mode === "NEAR_TESTNET_RPC"
                  ? "status-pill status-pill-emerald"
                  : "status-pill status-pill-amber"
              }
            >
              <span className="status-pill-dot status-pill-dot-pulse" />
              {network?.mode === "NEAR_TESTNET_RPC"
                ? "NEAR Testnet · Live RPC"
                : "NEAR Testnet · Sandbox"}
            </span>

            <a
              href={`${explorerBaseUrl}/address/${escrowContractId}`}
              target="_blank"
              rel="noreferrer"
              className="status-pill status-pill-blue"
              style={{ textDecoration: "none" }}
            >
              {escrowContractId.slice(0, 18)}… ↗
            </a>

            {wallet ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <span className="status-pill status-pill-emerald">
                  <span className="status-pill-dot" />
                  {wallet.accountId}
                </span>
                <button
                  type="button"
                  className="btn-quiet"
                  style={{ padding: "0.24rem 0.55rem", fontSize: "0.72rem" }}
                  onClick={handleDisconnectWallet}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-primary"
                style={{ padding: "0.36rem 0.75rem", fontSize: "0.76rem" }}
                disabled={busyKey === "connect_meteor"}
                onClick={handleConnectMeteor}
              >
                {busyKey === "connect_meteor" ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    <span>Opening Meteor…</span>
                  </>
                ) : (
                  <span>Connect Meteor Wallet</span>
                )}
              </button>
            )}

            <Link href="/app/merchant" className="btn-quiet" style={{ textDecoration: "none" }}>
              ← Merchant Console
            </Link>
          </div>
        </div>
        <div className="header-rail-track">
          <div className={busyKey ? "header-rail-line-busy" : "header-rail-line"} />
        </div>
      </header>

      {/* Main Content Container */}
      <main
        className="page-transition-enter"
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "1.75rem 1.5rem 3.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.35rem",
        }}
      >
        {/* Title & Subtitle Row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="eyebrow" style={{ marginBottom: "0.3rem" }}>
              NEP-141 ESCROW SETTLEMENT · ZERO ON-CHAIN PII
            </div>
            <h1
              style={{
                fontSize: "1.55rem",
                fontWeight: 600,
                letterSpacing: "-0.025em",
                color: "var(--ink-charcoal)",
              }}
            >
              {item ? `Settlement Request ${item.id}` : "Confidential Buyer Checkout"}
            </h1>
          </div>

          {lastTxHash && (
            <a
              href={`${explorerBaseUrl}/txns/${lastTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary mono-data"
              style={{
                padding: "0.45rem 0.85rem",
                fontSize: "0.76rem",
                color: "var(--sage-green)",
                borderColor: "rgba(47, 94, 75, 0.28)",
                background: "var(--sage-green-soft)",
              }}
            >
              Nearblocks Receipt · Tx: {lastTxHash.slice(0, 10)}…{lastTxHash.slice(-6)} ↗
            </a>
          )}
        </div>

        {/* 4-Cell Unified Architectural KPI Strip */}
        {item && (
          <section className="kpi-strip" aria-label="Invoice Settlement Telemetry">
            <div className="kpi-cell">
              <span className="mono-label">Invoice Amount Due</span>
              <div className="kpi-value tabular-nums">
                {Number(item.amountDecimal).toFixed(2)}{" "}
                <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--ink-muted)" }}>
                  USDC
                </span>
              </div>
              <span className="mono-label">
                Remaining: {Number(item.remainingDecimal).toFixed(2)} USDC
              </span>
            </div>

            <div className="kpi-cell">
              <span className="mono-label">Escrow Received</span>
              <div className="kpi-value tabular-nums">
                {Number(item.receivedDecimal).toFixed(2)}{" "}
                <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--ink-muted)" }}>
                  USDC
                </span>
              </div>
              <span className="mono-label">
                {item.paymentsCount} on-chain deposit(s) · Held: {Number(item.heldDecimal).toFixed(2)} USDC
              </span>
            </div>

            <div className="kpi-cell">
              <span className="mono-label">Settlement Status</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", margin: "0.2rem 0" }}>
                <span
                  className={
                    item.status === "SETTLED"
                      ? "status-pill status-pill-emerald"
                      : item.status === "PARTIALLY_PAID"
                        ? "status-pill status-pill-amber"
                        : "status-pill status-pill-blue"
                  }
                >
                  <span className="status-pill-dot" />
                  {item.status}
                </span>
                {transition && (
                  <span className="status-pill status-pill-emerald">
                    {transition.from} → {transition.to}
                  </span>
                )}
              </div>
              <span className="mono-label">
                {item.status === "SETTLED"
                  ? "Released to merchant account"
                  : "Awaiting NEP-141 deposit"}
              </span>
            </div>

            <div className="kpi-cell">
              <span className="mono-label">Active Buyer Wallet</span>
              <div
                className="mono-data"
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: wallet ? "var(--ink-charcoal)" : "var(--ink-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {wallet ? wallet.accountId : "Not Connected"}
              </div>
              <span className="mono-label">
                {wallet
                  ? `${wallet.provider.replace(/_/g, " ")} (${wallet.network})`
                  : "Meteor / MyNearWallet / Ed25519"}
              </span>
            </div>
          </section>
        )}

        {errorBanner && (
          <div className="inline-error-banner" style={{ marginTop: 0 }}>
            <span>{errorBanner}</span>
            <button
              type="button"
              className="btn-quiet"
              style={{ color: "var(--crimson-red)", padding: "0.2rem 0.5rem" }}
              onClick={() => setErrorBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 2-Column Main Split Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          {/* Left Column: Wallet Connection + Settlement Execution */}
          <div className="fin-card" style={{ display: "flex", flexDirection: "column" }}>
            {/* Top-Level Payment Rail Toggle: Native NEAR vs. NEAR Intents 1Click */}
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                padding: "0.35rem",
                background: "rgba(20, 21, 23, 0.04)",
                borderRadius: 6,
                marginBottom: "1.25rem",
              }}
            >
              <button
                type="button"
                className={`filter-pill ${payRail === "NEAR_WALLET" ? "filter-pill-active" : ""}`}
                style={{
                  flex: 1,
                  padding: "0.55rem 0.8rem",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                }}
                onClick={() => setPayRail("NEAR_WALLET")}
              >
                <span>Pay with NEAR (Meteor / Testnet)</span>
              </button>
              <button
                type="button"
                className={`filter-pill ${payRail === "ONE_CLICK_INTENTS" ? "filter-pill-active" : ""}`}
                style={{
                  flex: 1,
                  padding: "0.55rem 0.8rem",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                }}
                onClick={() => setPayRail("ONE_CLICK_INTENTS")}
              >
                <span>⚡ Pay Any Chain (NEAR Intents)</span>
                <span
                  style={{
                    background: "var(--sage-green)",
                    color: "#ffffff",
                    fontSize: "0.62rem",
                    padding: "0.1rem 0.35rem",
                    borderRadius: 3,
                    fontWeight: 600,
                  }}
                >
                  SOL / BASE / ETH
                </span>
              </button>
            </div>

            {payRail === "ONE_CLICK_INTENTS" ? (
              <div className="form-section-last" style={{ paddingTop: 0 }}>
                <div className="form-section-header">
                  <span className="form-section-title">
                    <span className="form-section-step">⚡</span>
                    NEAR Intents 1Click Multichain Rail
                  </span>
                  <span className="status-pill status-pill-emerald">
                    <span className="status-pill-dot" />
                    Live Solver Network
                  </span>
                </div>

                {/* Protocol Execution Routing Matrix (Fintech Precision Callout) */}
                <div
                  style={{
                    marginBottom: "1.15rem",
                    borderRadius: 6,
                    border: "1px solid var(--line-medium)",
                    background: "var(--bg-ivory-card)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "0.5rem 0.85rem",
                      background: "rgba(20, 21, 23, 0.03)",
                      borderBottom: "1px solid var(--line-soft)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.68rem",
                      flexWrap: "wrap",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--amber-warm)",
                          display: "inline-block",
                        }}
                      />
                      <span
                        className="mono-label"
                        style={{
                          letterSpacing: "0.06em",
                          fontWeight: 600,
                          color: "var(--ink-charcoal)",
                        }}
                      >
                        ROUTING SPEC // EVALUATION RUNTIME
                      </span>
                    </div>
                    <span
                      className="mono-label"
                      style={{
                        fontSize: "0.64rem",
                        color: "var(--ink-muted)",
                      }}
                    >
                      SOLVER: MAINNET · ESCROW: TESTNET
                    </span>
                  </div>

                  <div style={{ padding: "0.75rem 0.85rem" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "0.6rem",
                        marginBottom: "0.65rem",
                      }}
                    >
                      <div
                        style={{
                          padding: "0.45rem 0.6rem",
                          borderRadius: 4,
                          background: "var(--bg-ivory)",
                          border: "1px solid var(--line-soft)",
                        }}
                      >
                        <div
                          className="mono-label"
                          style={{ fontSize: "0.62rem", color: "var(--ink-muted)", marginBottom: "0.15rem" }}
                        >
                          SOLVER ORACLE RAIL
                        </div>
                        <div
                          className="mono-data"
                          style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--ink-charcoal)" }}
                        >
                          NEAR Intents Mainnet API
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "0.45rem 0.6rem",
                          borderRadius: 4,
                          background: "var(--bg-ivory)",
                          border: "1px solid var(--line-soft)",
                        }}
                      >
                        <div
                          className="mono-label"
                          style={{ fontSize: "0.62rem", color: "var(--ink-muted)", marginBottom: "0.15rem" }}
                        >
                          SETTLEMENT TARGET
                        </div>
                        <div
                          className="mono-data"
                          style={{ fontSize: "0.76rem", fontWeight: 600, color: "var(--sage-green)" }}
                        >
                          ledgerly-escrow-9e70f9ea.testnet
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "0.73rem",
                        lineHeight: 1.45,
                        color: "var(--ink-muted)",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--amber-warm)",
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.68rem",
                          flexShrink: 0,
                          marginTop: "0.08rem",
                        }}
                      >
                        [EVALUATION NOTE]
                      </span>
                      <span>
                        Pricing quotes and deposit addresses query production 1Click solvers in real-time. Because the escrow contract is on <strong>NEAR Testnet</strong> for zero-cost judge evaluation, do not transfer real mainnet assets. Use the <strong>Simulate Solver Settlement</strong> action below to test atomic settlement.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="field-group" style={{ marginBottom: "1rem" }}>
                  <label className="field-label">
                    <span>Select Source Token &amp; Chain</span>
                    <span className="mono-label">1Click Swap API</span>
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: "0.5rem",
                    }}
                  >
                    {POPULAR_ONE_CLICK_ASSETS.map((asset) => {
                      const isSelected = oneClickAsset.assetId === asset.assetId;
                      return (
                        <button
                          key={asset.assetId}
                          type="button"
                          className={`filter-pill ${isSelected ? "filter-pill-active" : ""}`}
                          style={{
                            padding: "0.55rem 0.75rem",
                            justifyContent: "flex-start",
                            gap: "0.5rem",
                            height: "auto",
                          }}
                          onClick={() => {
                            setOneClickAsset(asset);
                            setOneClickDepositAddress(null);
                            setOneClickStatus(null);
                          }}
                        >
                          <span style={{ fontSize: "1.1rem" }}>{asset.icon}</span>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                              {asset.symbol}
                            </div>
                            <div style={{ fontSize: "0.65rem", opacity: 0.75 }}>
                              {asset.name}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Solver Quote Card */}
                {item && (
                  <div
                    style={{
                      padding: "1rem",
                      borderRadius: 6,
                      border: "1px solid var(--line-medium)",
                      background: "#ffffff",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.6rem",
                      }}
                    >
                      <span className="mono-label">Live Intent Solver Quote</span>
                      {oneClickLoading ? (
                        <span className="mono-label">Fetching Solver Quote…</span>
                      ) : (
                        <span className="mono-label" style={{ color: "var(--sage-green)" }}>
                          Est. Time: {oneClickQuote?.timeEstimateSeconds ?? 20}s
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        padding: "0.6rem 0",
                        borderBottom: "1px dotted var(--line-soft)",
                      }}
                    >
                      <span style={{ fontSize: "0.84rem", color: "var(--ink-muted)" }}>
                        You Send on {oneClickAsset.name}:
                      </span>
                      <div style={{ textAlign: "right" }}>
                        <span
                          className="mono-data"
                          style={{ fontSize: "1.05rem", fontWeight: 700 }}
                        >
                          {oneClickLoading
                            ? "Calculating…"
                            : `${oneClickQuote?.amountInFormatted ?? "—"} ${oneClickAsset.symbol}`}
                        </span>
                        {oneClickQuote?.amountInUsd && (
                          <div
                            className="mono-data"
                            style={{ fontSize: "0.72rem", color: "var(--ink-muted)" }}
                          >
                            ≈ ${Number(oneClickQuote.amountInUsd).toFixed(2)} USD
                          </div>
                        )}
                      </div>
                    </div>

                    {oneClickQuote?.spotPrice ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.45rem 0",
                          borderBottom: "1px dotted var(--line-soft)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span style={{ color: "var(--ink-muted)" }}>
                          Live Spot Price ({oneClickAsset.symbol}):
                        </span>
                        <div style={{ textAlign: "right" }}>
                          <span className="mono-data" style={{ fontWeight: 600 }}>
                            ${oneClickQuote.spotPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                          </span>
                          <span
                            className="mono-label"
                            style={{ color: "var(--sage-green)", marginLeft: "0.4rem", fontSize: "0.65rem" }}
                          >
                            🟢 Live CEX/DEX Feed
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        padding: "0.6rem 0",
                      }}
                    >
                      <span style={{ fontSize: "0.84rem", color: "var(--ink-muted)" }}>
                        Merchant Receives on NEAR:
                      </span>
                      <span
                        className="mono-data"
                        style={{
                          fontSize: "1.05rem",
                          fontWeight: 700,
                          color: "var(--sage-green)",
                        }}
                      >
                        {item.amountDecimal} USDC
                      </span>
                    </div>

                    <div
                      className="field-hint"
                      style={{
                        marginTop: "0.4rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>
                        Solvers execute cross-chain intent settlement directly via NEAR Intents.
                      </span>
                      <a
                        href="https://1click.chaindefuser.com"
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--sage-green)",
                          textDecoration: "underline",
                          fontSize: "0.7rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Live Solver API ↗
                      </a>
                    </div>
                  </div>
                )}

                {/* Deposit Address Box if Generated */}
                {oneClickDepositAddress && item ? (
                  <div
                    style={{
                      padding: "0.85rem 1rem",
                      borderRadius: 6,
                      border: "1px solid var(--line-medium)",
                      background: "var(--bg-ivory-card)",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.6rem",
                        flexWrap: "wrap",
                        gap: "0.4rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                        <span
                          className="mono-label"
                          style={{ color: "var(--ink-charcoal)", fontWeight: 600 }}
                        >
                          INTENT DEPOSIT TARGET // {oneClickAsset.symbol} ({oneClickAsset.name.toUpperCase()})
                        </span>
                        <span
                          className="status-transition-tag"
                          style={{
                            color: "var(--amber-warm)",
                            background: "var(--amber-warm-soft)",
                            fontSize: "0.62rem",
                            fontWeight: 600,
                          }}
                        >
                          TESTNET EVALUATION
                        </span>
                      </div>
                      <span className="status-pill status-pill-emerald">
                        <span className="status-pill-dot" />
                        {oneClickStatus ?? "PENDING_DEPOSIT"}
                      </span>
                    </div>

                    <div
                      className="mono-data"
                      style={{
                        padding: "0.55rem 0.75rem",
                        background: "#ffffff",
                        borderRadius: 4,
                        border: "1px solid var(--line-soft)",
                        fontSize: "0.78rem",
                        wordBreak: "break-all",
                        marginBottom: "0.55rem",
                        color: "var(--ink-charcoal)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>{oneClickDepositAddress}</span>
                      <button
                        type="button"
                        className="btn-secondary mono-data"
                        style={{
                          fontSize: "0.68rem",
                          padding: "0.22rem 0.45rem",
                          flexShrink: 0,
                          height: "auto",
                        }}
                        onClick={() => {
                          if (navigator.clipboard) {
                            void navigator.clipboard.writeText(oneClickDepositAddress);
                            pushToast(
                              "success",
                              "Deposit Address Copied",
                              "Inspection only: Contract runs on NEAR Testnet for evaluation.",
                            );
                          }
                        }}
                      >
                        Copy
                      </button>
                    </div>

                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--ink-muted)",
                        marginBottom: "0.75rem",
                        lineHeight: 1.45,
                      }}
                    >
                      Live programmatic solver address. To settle the invoice without real mainnet capital, execute the automated solver settlement relayer below.
                    </div>

                    <button
                      type="button"
                      className="btn-primary mono-data"
                      style={{
                        fontSize: "0.78rem",
                        padding: "0.5rem 0.85rem",
                        background: "var(--sage-green)",
                        width: "100%",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                      disabled={Boolean(busyKey)}
                      onClick={handleSimulateOneClickFulfillment}
                    >
                      {busyKey === "simulate_oneclick"
                        ? "Relaying Testnet Escrow Settlement…"
                        : `⚡ Execute Solver Settlement on NEAR Testnet (${item.amountDecimal} USDC)`}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ flex: 1 }}
                      disabled={oneClickLoading || Boolean(busyKey) || !item}
                      onClick={handleGenerateOneClickAddress}
                    >
                      <span>
                        Generate 1Click Deposit Address ({oneClickAsset.symbol})
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
            {/* Step 01: Wallet Provider */}
            <div className="form-section" style={{ paddingTop: 0 }}>
              <div className="form-section-header">
                <span className="form-section-title">
                  <span className="form-section-step">01</span>
                  NEAR Wallet Connection
                </span>
                <span
                  className={
                    meteorDetected
                      ? "status-pill status-pill-emerald"
                      : "status-pill status-pill-blue"
                  }
                >
                  <span className="status-pill-dot" />
                  {meteorDetected ? "Meteor Extension Detected" : "Meteor Web Popup Ready"}
                </span>
              </div>

              {/* Primary Provider: Meteor Wallet */}
              <div
                style={{
                  padding: "0.95rem 1rem",
                  borderRadius: 5,
                  border:
                    wallet?.provider === "METEOR_WALLET"
                      ? "1px solid var(--sage-green)"
                      : "1px solid var(--line-medium)",
                  background:
                    wallet?.provider === "METEOR_WALLET" ? "var(--sage-green-soft)" : "#ffffff",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.88rem",
                        fontWeight: 600,
                        color: "var(--ink-charcoal)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.45rem",
                      }}
                    >
                      <span>Meteor Wallet</span>
                      <span className="mono-label" style={{ fontSize: "0.62rem" }}>
                        {meteorDetected ? "CHROME EXTENSION" : "EXTENSION / POPUP"}
                      </span>
                    </div>
                    <div className="field-hint" style={{ marginTop: "0.18rem" }}>
                      Connect via injected <code>window.meteorCom</code> bridge or Meteor Web Wallet
                      popup.
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <div className="filter-pill-group" aria-label="Meteor Network">
                      <button
                        type="button"
                        onClick={() => setMeteorNetwork("testnet")}
                        className={`filter-pill ${
                          meteorNetwork === "testnet" ? "filter-pill-active" : ""
                        }`}
                      >
                        Testnet
                      </button>
                      <button
                        type="button"
                        onClick={() => setMeteorNetwork("mainnet")}
                        className={`filter-pill ${
                          meteorNetwork === "mainnet" ? "filter-pill-active" : ""
                        }`}
                      >
                        Mainnet
                      </button>
                    </div>

                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: "0.48rem 0.9rem", fontSize: "0.8rem" }}
                      disabled={Boolean(busyKey)}
                      onClick={handleConnectMeteor}
                    >
                      {busyKey === "connect_meteor" ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          <span>Connecting…</span>
                        </>
                      ) : wallet?.provider === "METEOR_WALLET" ? (
                        <span>Reconnect Meteor</span>
                      ) : (
                        <span>Connect Meteor</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Alternative Providers: MyNearWallet + Embedded Ed25519 Testnet Signer */}
              <div className="form-grid-2" style={{ gap: "0.75rem" }}>
                <div className="field-group">
                  <label className="field-label">
                    <span>Buyer NEAR Account (.testnet)</span>
                    <span className="mono-label">Ed25519</span>
                  </label>
                  <input
                    className="ledger-input mono-data"
                    value={customBuyerAccount}
                    onChange={(e) => setCustomBuyerAccount(e.target.value)}
                    placeholder="kyoto-living.testnet"
                  />
                </div>

                <div className="field-group" style={{ justifyContent: "flex-end" }}>
                  <label className="field-label">
                    <span>Alternative Signers</span>
                    <span className="mono-label">Testnet</span>
                  </label>
                  <div style={{ display: "flex", gap: "0.45rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1, padding: "0.52rem 0.7rem", fontSize: "0.78rem" }}
                      disabled={Boolean(busyKey)}
                      onClick={handleConnectEmbedded}
                    >
                      Use Ed25519 Signer
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1, padding: "0.52rem 0.7rem", fontSize: "0.78rem" }}
                      disabled={Boolean(busyKey)}
                      onClick={handleConnectMyNearWallet}
                    >
                      MyNearWallet ↗
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 02: Settlement Execution */}
            {item && (
              <div className="form-section-last">
                <div className="form-section-header">
                  <span className="form-section-title">
                    <span className="form-section-step">02</span>
                    Execute NEP-141 Escrow Deposit
                  </span>
                  <span className="mono-label">Token: USDC (6 decimals)</span>
                </div>

                <div className="field-group" style={{ marginBottom: "0.85rem" }}>
                  <div className="field-label">
                    <span>Deposit Amount</span>
                    <div className="filter-pill-group">
                      <button
                        type="button"
                        className="filter-pill"
                        onClick={() =>
                          setCustomPayAmount(
                            (Number(item.remainingDecimal) > 0
                              ? Number(item.remainingDecimal)
                              : Number(item.amountDecimal)
                            ).toFixed(2),
                          )
                        }
                      >
                        Exact (
                        {(Number(item.remainingDecimal) > 0
                          ? Number(item.remainingDecimal)
                          : Number(item.amountDecimal)
                        ).toFixed(2)}
                        )
                      </button>
                      <button
                        type="button"
                        className="filter-pill"
                        onClick={() =>
                          setCustomPayAmount(
                            Math.max(10, Number(item.amountDecimal) / 2).toFixed(2),
                          )
                        }
                      >
                        Partial (50%)
                      </button>
                      <button
                        type="button"
                        className="filter-pill"
                        onClick={() =>
                          setCustomPayAmount((Number(item.amountDecimal) + 20).toFixed(2))
                        }
                      >
                        Overpay (+20)
                      </button>
                    </div>
                  </div>

                  <div className="input-affix-wrap">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="ledger-input tabular-nums"
                      value={customPayAmount}
                      onChange={(e) => setCustomPayAmount(e.target.value)}
                      disabled={item.status === "SETTLED"}
                    />
                    <span className="input-affix-tag">USDC</span>
                  </div>
                  <span className="field-hint">
                    Overpayments are automatically split: excess USDC is refunded to the buyer and
                    exact invoice amount is released to the merchant.
                  </span>
                </div>

                {item.status === "SETTLED" ? (
                  <div
                    style={{
                      padding: "0.95rem 1rem",
                      borderRadius: 5,
                      border: "1px solid rgba(47, 94, 75, 0.25)",
                      background: "var(--sage-green-soft)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "0.86rem",
                          fontWeight: 600,
                          color: "var(--sage-green)",
                        }}
                      >
                        Invoice Settled On-Chain ({Number(item.amountDecimal).toFixed(2)} USDC)
                      </div>
                      <div className="field-hint" style={{ color: "var(--sage-green)" }}>
                        Double-entry journal posted and escrow closed on {escrowContractId}.
                      </div>
                    </div>
                    {lastTxHash && (
                      <a
                        href={`${explorerBaseUrl}/txns/${lastTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary mono-data"
                        style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}
                      >
                        View Tx on Nearblocks ↗
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ flex: 1 }}
                      disabled={Boolean(busyKey)}
                      onClick={() =>
                        executePayment(
                          "pay_custom",
                          customPayAmount || Number(item.remainingDecimal).toFixed(2),
                        )
                      }
                    >
                      {busyKey === "pay_custom" ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          <span>Signing & Broadcasting to NEAR Testnet…</span>
                        </>
                      ) : (
                        <span>
                          Sign & Pay ({Number(customPayAmount || item.remainingDecimal).toFixed(2)}{" "}
                          USDC)
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busyKey) || !wallet}
                      onClick={() => void requestFaucet()}
                    >
                      {busyKey === "faucet" ? "Minting…" : "Get 100 test USDC"}
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(busyKey)}
                      onClick={() =>
                        executePayment("pay_overpay", (Number(item.amountDecimal) + 20).toFixed(2))
                      }
                    >
                      {busyKey === "pay_overpay" ? (
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
              </div>
            )}
              </>
            )}
          </div>

          {/* Right Column: Cryptographic Telemetry & NEP-141 Payload Inspector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="fin-card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid var(--line-soft)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span className="form-section-title">On-Chain Escrow & Privacy Telemetry</span>
                <span className="status-pill status-pill-emerald">X25519 + AES-256-GCM</span>
              </div>

              {item ? (
                <div className="ledger-table-wrap">
                  <table className="ledger-table">
                    <tbody>
                      <tr>
                        <td className="mono-label" style={{ width: "36%" }}>
                          Request ID
                        </td>
                        <td className="mono-data">{item.id}</td>
                      </tr>
                      <tr>
                        <td className="mono-label">Escrow Contract</td>
                        <td className="mono-data">
                          <a
                            href={`${explorerBaseUrl}/address/${escrowContractId}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "var(--sage-green)", textDecoration: "none" }}
                          >
                            {escrowContractId} ↗
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td className="mono-label">Opaque Escrow ID</td>
                        <td
                          className="mono-data"
                          style={{ wordBreak: "break-all", fontSize: "0.74rem" }}
                        >
                          {item.escrowId}
                        </td>
                      </tr>
                      <tr>
                        <td className="mono-label">SHA-256 Commitment</td>
                        <td
                          className="mono-data"
                          style={{ wordBreak: "break-all", fontSize: "0.74rem" }}
                        >
                          {item.commitment}
                        </td>
                      </tr>
                      <tr>
                        <td className="mono-label">Sealed Envelope</td>
                        <td className="mono-data" style={{ color: "var(--ink-muted)" }}>
                          {item.cipherPreview} (Off-chain encrypted)
                        </td>
                      </tr>
                      <tr>
                        <td className="mono-label">Latest On-Chain Tx</td>
                        <td className="mono-data">
                          {lastTxHash ? (
                            <a
                              href={`${explorerBaseUrl}/txns/${lastTxHash}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "var(--sage-green)",
                                textDecoration: "none",
                                fontWeight: 600,
                              }}
                            >
                              {lastTxHash} ↗
                            </a>
                          ) : (
                            <span style={{ color: "var(--ink-muted)" }}>
                              Pending buyer deposit
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state-box">
                  <span className="mono-label">Loading settlement telemetry…</span>
                </div>
              )}
            </div>

            {/* NEP-141 Payload Inspector & External Tx Verifier */}
            <div className="fin-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: showPayloadInspector ? "0.85rem" : 0,
                }}
              >
                <div>
                  <div className="form-section-title">NEP-141 Transaction Inspector</div>
                  <div className="field-hint">
                    Verify that no invoice numbers, emails, or business metadata touch NEAR on-chain.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "0.38rem 0.75rem", fontSize: "0.75rem" }}
                  onClick={() => setShowPayloadInspector((v) => !v)}
                >
                  {showPayloadInspector ? "Hide JSON" : "Inspect JSON"}
                </button>
              </div>

              {showPayloadInspector && ftPreview && (
                <pre
                  className="mono-data"
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: 5,
                    background: "#141517",
                    color: "#f6f4ef",
                    fontSize: "0.73rem",
                    overflowX: "auto",
                    lineHeight: 1.5,
                    marginBottom: "0.9rem",
                  }}
                >
                  {JSON.stringify(ftPreview, null, 2)}
                </pre>
              )}

              <div
                className="hairline-top"
                style={{ marginTop: "0.9rem", paddingTop: "0.9rem" }}
              >
                <label className="field-label" style={{ marginBottom: "0.35rem" }}>
                  <span>Verify External NEAR Transaction Hash</span>
                  <span className="mono-label">RPC Ingest</span>
                </label>
                <div style={{ display: "flex", gap: "0.45rem" }}>
                  <input
                    className="ledger-input mono-data"
                    placeholder="Paste Nearblocks txHash (e.g. 8kkX2fMU7tYo...)"
                    value={externalTxInput}
                    onChange={(e) => setExternalTxInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={Boolean(busyKey) || !externalTxInput.trim()}
                    onClick={() => verifyExternalTxHash(externalTxInput, wallet?.accountId)}
                  >
                    {busyKey === "verify_tx" ? "Verifying…" : "Verify Tx"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Non-blocking Toast Notifications */}
      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast-item ${
                t.kind === "error" ? "toast-item-error" : "toast-item-success"
              }`}
            >
              <div>
                <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{t.title}</div>
                {t.detail && (
                  <div className="mono-data" style={{ fontSize: "0.72rem", color: "var(--ink-muted)", marginTop: "0.15rem" }}>
                    {t.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
