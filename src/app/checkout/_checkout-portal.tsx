"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ReceiptText,
  Wallet,
  X,
  Zap,
} from "lucide-react";
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
import {
  POPULAR_ONE_CLICK_ASSETS,
  isValidChainAddress,
  isQuoteExpired,
  type OneClickQuoteResult,
} from "@/shared/one-click-client";
import { CryptoTokenIcon } from "../components/CryptoTokenIcon";
import { HashBadge } from "../components/HashBadge";
import { CapabilityBadge } from "../components/CapabilityBadge";
import { isRealNearTx } from "@/lib/validation";

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
  enableLiveIntents?: boolean;
}

interface ToastMsg {
  id: string;
  kind: "success" | "error";
  title: string;
  detail?: string;
}

function formatCryptoQuoteAmount(raw?: string | null): string {
  if (!raw || raw === "—") return "—";
  const num = Number(raw);
  if (Number.isNaN(num)) return raw;
  if (num === 0) return "0.00";
  // Max 6 decimals, trimming trailing zeros after 2nd decimal
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatUsdc2(raw?: string | number | null): string {
  const num = typeof raw === "number" ? raw : Number(raw ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CheckoutPortal({ initialRequestId }: { initialRequestId?: string }) {
  const [requests, setRequests] = useState<CheckoutItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialRequestId ?? "");
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [wallet, setWallet] = useState<NearWalletSession | null>(null);
  const [meteorDetected, setMeteorDetected] = useState(false);
  const [meteorNetwork, setMeteorNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [customBuyerAccount, setCustomBuyerAccount] = useState("");
  const [customPayAmount, setCustomPayAmount] = useState("");
  const [externalTxInput, setExternalTxInput] = useState("");
  const [showPayloadInspector, setShowPayloadInspector] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [transition, setTransition] = useState<{ from: string; to: string } | null>(null);
  const [copiedDepositAddr, setCopiedDepositAddr] = useState(false);

  // NEAR Intents / 1Click Cross-Chain State
  const [payRail, setPayRail] = useState<"NEAR_WALLET" | "ONE_CLICK_INTENTS">("NEAR_WALLET");
  const [oneClickAsset, setOneClickAsset] = useState<(typeof POPULAR_ONE_CLICK_ASSETS)[number]>(
    POPULAR_ONE_CLICK_ASSETS[0],
  );
  const [oneClickQuote, setOneClickQuote] = useState<OneClickQuoteResult | null>(null);
  const [oneClickDepositAddress, setOneClickDepositAddress] = useState<string | null>(null);
  const [oneClickStatus, setOneClickStatus] = useState<string | null>(null);
  const [oneClickLoading, setOneClickLoading] = useState(false);
  const [oneClickError, setOneClickError] = useState<string | null>(null);
  const [liveDisclaimerConfirmed, setLiveDisclaimerConfirmed] = useState(false);
  const initializedInvoiceIdRef = useRef<string>("");
  const quoteAbortRef = useRef<AbortController | null>(null);
  const quoteSeqRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
          setTimeout(() => setTransition(null), 4000);
          if (found.status === "SETTLED" || found.status === "PAID") {
            pushToast(
              "success",
              "Payment Confirmed On-Chain",
              `Invoice ${found.id} settled on NEAR Testnet (${formatUsdc2(found.amountDecimal)} USDC).`,
            );
          }
        }
        if (found.latestTxHash) {
          setLastTxHash(found.latestTxHash);
        }
        const statusChanged = Boolean(prevStatus && prevStatus !== found.status);
        if (initializedInvoiceIdRef.current !== found.id || statusChanged) {
          initializedInvoiceIdRef.current = found.id;
          const rem = Number(found.remainingDecimal);
          setCustomPayAmount(rem > 0 ? rem.toFixed(2) : Number(found.amountDecimal).toFixed(2));
        }
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
        let body: {
          ok?: boolean;
          txHash?: string;
          error?: { code?: string; message?: string };
        } | null = null;
        try {
          body = (await res.json()) as {
            ok?: boolean;
            txHash?: string;
            error?: { code?: string; message?: string };
          };
        } catch {
          // If response body is empty or non-JSON
        }

        if (res.ok && body?.ok) {
          setLastTxHash(cleanHash);
          setExternalTxInput("");
          await loadState();
          pushToast(
            "success",
            "On-Chain Transaction Verified",
            `Receipt ${cleanHash.slice(0, 14)}… ingested from NEAR RPC`,
          );
        } else {
          const errCode = body?.error?.code;
          const rawMsg = body?.error?.message ?? "";
          if (
            errCode === "TX_NOT_FOUND" ||
            rawMsg.includes("not found on NEAR RPC") ||
            rawMsg.includes("NOT_OBSERVED")
          ) {
            pushToast(
              "error",
              "Transaction Not Found",
              `Tx hash ${cleanHash.slice(0, 16)}… was not observed on NEAR RPC.`,
            );
          } else if (errCode === "NO_ESCROW_EVENTS_FOUND") {
            pushToast(
              "error",
              "Unmatched Escrow Transaction",
              `Tx verified on NEAR, but contains no deposit events for this escrow contract.`,
            );
          } else {
            pushToast(
              "error",
              "Transaction Verification Failed",
              body?.error?.message ??
                `Could not verify transaction hash on NEAR RPC (HTTP ${res.status}).`,
            );
          }
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
      if (activeSession.network === "mainnet" || activeSession.network === "testnet") {
        setMeteorNetwork(activeSession.network);
      }
    }
    if (callback.transactionHashes.length > 0) {
      const firstTx = callback.transactionHashes[0]!;
      void verifyExternalTxHash(firstTx, activeSession?.accountId);
    }
    return () => clearTimeout(timer);
  }, [loadState, verifyExternalTxHash]);

  const item = requests.find((r) => r.id === selectedId) ?? requests[0] ?? null;
  const itemId = item?.id ?? "";
  const itemStatus = item?.status ?? "";
  const effectiveQuoteAmount =
    customPayAmount || item?.remainingDecimal || item?.amountDecimal || "";

  // Auto-sync polling: refresh state while current invoice is open or partially paid
  useEffect(() => {
    if (
      !itemId ||
      itemStatus === "SETTLED" ||
      itemStatus === "EXPIRED" ||
      itemStatus === "CANCELLED"
    ) {
      return;
    }
    const interval = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        !busyKey
      ) {
        void loadState(itemStatus, itemId);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [itemId, itemStatus, busyKey, loadState]);

  const handleSelectInvoice = (req: CheckoutItem) => {
    initializedInvoiceIdRef.current = req.id;
    setSelectedId(req.id);
    setTransition(null);
    setErrorBanner(null);
    setOneClickDepositAddress(null);
    setOneClickStatus(null);
    setLastTxHash(req.latestTxHash);
    const rem = Number(req.remainingDecimal);
    setCustomPayAmount(rem > 0 ? rem.toFixed(2) : Number(req.amountDecimal).toFixed(2));
  };

  const fetchOneClickQuote = useCallback(
    async (
      assetId: string,
      amountDecimal: string,
      dry = true,
      confirmedLiveDisclaimer = false,
    ): Promise<OneClickQuoteResult | null> => {
      quoteAbortRef.current?.abort();
      const controller = new AbortController();
      quoteAbortRef.current = controller;
      const reqSeq = ++quoteSeqRef.current;
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      setOneClickLoading(true);
      setOneClickError(null);
      try {
        const res = await fetch("/api/v1/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ONE_CLICK_QUOTE",
            originAsset: assetId,
            amountUsdcDecimal: amountDecimal,
            dry,
            confirmedLiveDisclaimer,
          }),
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          ok: boolean;
          quote?: OneClickQuoteResult;
          error?: { message?: string };
        };
        if (reqSeq !== quoteSeqRef.current) return null;
        if (data.quote) {
          setOneClickQuote(data.quote);
          if (data.quote.state === "unavailable" || !data.ok) {
            setOneClickError(data.error?.message ?? data.quote.error ?? "Solver unavailable, retry");
            setOneClickDepositAddress(null);
            return data.quote;
          }
          setOneClickError(null);
          if (data.quote.depositAddress) {
            setOneClickDepositAddress(data.quote.depositAddress);
            setOneClickStatus("PENDING_DEPOSIT");
          } else {
            setOneClickDepositAddress(null);
          }
          return data.quote;
        }
        setOneClickQuote(null);
        setOneClickDepositAddress(null);
        setOneClickError(data.error?.message ?? "Solver unavailable, retry");
        return null;
      } catch (err) {
        if (reqSeq !== quoteSeqRef.current) return null;
        const isAbort = err instanceof Error && err.name === "AbortError";
        setOneClickQuote(null);
        setOneClickDepositAddress(null);
        setOneClickError(
          isAbort ? "Solver quote request timed out. Please retry." : "Solver unavailable, retry",
        );
        return null;
      } finally {
        clearTimeout(timeoutId);
        if (reqSeq === quoteSeqRef.current) {
          setOneClickLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (payRail !== "ONE_CLICK_INTENTS" || !itemId || !effectiveQuoteAmount) {
      return;
    }
    const timer = setTimeout(() => {
      void fetchOneClickQuote(oneClickAsset.assetId, effectiveQuoteAmount, true);
    }, 60);
    return () => {
      clearTimeout(timer);
    };
  }, [payRail, oneClickAsset.assetId, itemId, effectiveQuoteAmount, fetchOneClickQuote]);

  useEffect(() => {
    return () => {
      quoteAbortRef.current?.abort();
    };
  }, []);

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
    if (!liveDisclaimerConfirmed) {
      pushToast(
        "error",
        "Confirmation Required",
        "Please confirm the disclaimer before generating a live deposit address.",
      );
      return;
    }
    const amt = customPayAmount || item.remainingDecimal || item.amountDecimal;
    const quote = await fetchOneClickQuote(oneClickAsset.assetId, amt, false, true);
    if (quote?.depositAddress) {
      pushToast(
        "success",
        `1Click Deposit Address Generated for ${oneClickAsset.name}`,
        `Intent created. Use Execute Solver Settlement below to run testnet escrow fulfillment.`,
      );
    } else {
      pushToast(
        "error",
        "Could Not Generate Deposit Address",
        quote?.error ?? "Solver unavailable, retry",
      );
    }
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

  const handleConnectMeteor = async (overrideNetwork?: "testnet" | "mainnet") => {
    const targetNet = overrideNetwork ?? meteorNetwork;
    setMeteorNetwork(targetNet);
    setBusyKey("connect_meteor");
    setErrorBanner(null);
    try {
      const contractId =
        targetNet === "mainnet"
          ? "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
          : network?.escrowContractId ?? "ledgerly-escrow-9e70f9ea.testnet";
      const session = await connectMeteorWallet(contractId, targetNet);
      setWallet(session);
      setCustomBuyerAccount(session.accountId);
      pushToast(
        "success",
        `Meteor Wallet Connected (${session.network.toUpperCase()})`,
        `${session.accountId} active on ${session.network.toUpperCase()}`,
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

  const handleSwitchMeteorNetwork = async (targetNet: "testnet" | "mainnet") => {
    setMeteorNetwork(targetNet);
    await handleConnectMeteor(targetNet);
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
        "1-Click Relayer (Gasless) Active",
        `${session.accountId} · Sponsored demo relayer`,
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
      const body = (await res.json()) as {
        ok?: boolean;
        txHash?: string;
        error?: { message?: string };
      };
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
    <div style={{ minHeight: "100dvh", background: "var(--surface-canvas)", color: "var(--text-primary)" }}>
      {/* Top Navigation Bar */}
      <header className="app-topbar sticky top-0 z-50">
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "0.78rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <Link
              href="/"
              style={{
                textDecoration: "none",
                color: "var(--text-primary)",
                fontWeight: 700,
                fontSize: "1.02rem",
                letterSpacing: "-0.025em",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect width="24" height="24" rx="6" fill="var(--accent-primary)" />
                <path
                  d="M8 7.5V16.5H16"
                  stroke="var(--text-on-accent)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Ledgerly</span>
            </Link>
            <span style={{ color: "var(--border-default)" }} aria-hidden="true">
              /
            </span>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.86rem", fontWeight: 600 }}>
              Buyer Checkout
            </span>
          </div>

          <div
            className="ml-auto"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              flexWrap: "wrap",
              marginLeft: "auto",
            }}
          >
            <span
              className={
                network?.mode === "NEAR_TESTNET_RPC"
                  ? "status-pill status-pill-emerald"
                  : "status-pill status-pill-amber"
              }
            >
              <span className="status-pill-dot status-pill-dot-pulse" aria-hidden="true" />
              {network?.mode === "NEAR_TESTNET_RPC"
                ? "NEAR Testnet · Live RPC"
                : "NEAR Testnet · Sandbox"}
            </span>

            {wallet ? (
              <span
                className="status-pill status-pill-emerald"
                title={`Connected NEAR Account: ${wallet.accountId} (${wallet.provider})`}
                style={{ cursor: "default" }}
              >
                <span className="status-pill-dot" aria-hidden="true" />
                <span className="mono-data tabular-nums" style={{ fontWeight: 500 }}>
                  {wallet.accountId}
                </span>
              </span>
            ) : (
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
                style={{ padding: "0.32rem 0.68rem", fontSize: "0.76rem", textDecoration: "none" }}
                disabled={busyKey === "connect_meteor"}
                onClick={() => void handleConnectMeteor()}
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{busyKey === "connect_meteor" ? "Connecting…" : "Connect Wallet"}</span>
              </button>
            )}

            <Link
              href="/app/merchant"
              className="btn-quiet inline-flex items-center gap-1 whitespace-nowrap"
              style={{ textDecoration: "none" }}
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Merchant Console</span>
            </Link>
          </div>
        </div>
        <div className="header-rail-track" aria-hidden="true">
          <div className={busyKey ? "header-rail-line-busy" : "header-rail-line"} />
        </div>
      </header>

      {/* Main Content Container */}
      <main
        className="page-transition-enter"
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          padding: "1.65rem 1.5rem 3.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        {/* Invoice Selector Bar */}
        {requests.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div
              className="filter-pill-group overflow-x-auto"
              role="tablist"
              aria-label="Select Invoice"
              style={{ maxWidth: "100%" }}
            >
              {requests.map((r) => {
                const active = item?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSelectInvoice(r)}
                    className={`filter-pill tabular-nums whitespace-nowrap ${
                      active ? "filter-pill-active" : ""
                    }`}
                  >
                    {r.id} · {Number(r.amountDecimal).toFixed(0)} USDC ({r.status})
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
              NEP-141 Escrow Settlement · Private by Default
            </div>
            <h1
              className="text-balance tabular-nums"
              style={{
                fontSize: "1.75rem",
                fontWeight: 650,
                letterSpacing: "-0.03em",
                color: "var(--text-primary)",
              }}
            >
              {item ? `Settlement Request ${item.id}` : "Buyer Checkout"}
            </h1>
          </div>

          {lastTxHash && isRealNearTx(lastTxHash) && (
            <a
              href={`${explorerBaseUrl}/txns/${lastTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary mono-data tabular-nums inline-flex items-center gap-1.5 whitespace-nowrap"
              style={{
                padding: "0.45rem 0.85rem",
                fontSize: "0.76rem",
                color: "var(--status-settled-fg)",
                borderColor: "var(--status-settled-border)",
                background: "var(--status-settled-bg)",
              }}
            >
              <span>
                Nearblocks Receipt · Tx: {lastTxHash.slice(0, 10)}…{lastTxHash.slice(-6)}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </a>
          )}
        </div>

        {/* 4-Cell Unified KPI Strip */}
        {item && (
          <section className="kpi-strip" aria-label="Invoice Settlement Telemetry">
            <div className="kpi-cell">
              <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
                <span className="mono-label">Invoice Amount Due</span>
                <span className="kpi-icon-badge">
                  <ReceiptText className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
              <div className="kpi-value tabular-nums">
                {formatUsdc2(item.amountDecimal)}{" "}
                <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-muted)" }}>
                  USDC
                </span>
              </div>
              <span className="mono-label tabular-nums">
                Remaining: {formatUsdc2(item.remainingDecimal)} USDC
              </span>
            </div>

            <div className="kpi-cell">
              <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
                <span className="mono-label">Escrow Received</span>
                <span className="kpi-icon-badge">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
              <div className="kpi-value tabular-nums">
                {formatUsdc2(item.receivedDecimal)}{" "}
                <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-muted)" }}>
                  USDC
                </span>
              </div>
              <span className="mono-label tabular-nums">
                {item.paymentsCount} on-chain deposit(s) · Held: {formatUsdc2(item.heldDecimal)} USDC
              </span>
            </div>

            <div className="kpi-cell">
              <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
                <span className="mono-label">Settlement Status</span>
                <span className="kpi-icon-badge">
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.35rem",
                  margin: "0.2rem 0",
                }}
              >
                <span
                  className={
                    item.status === "SETTLED"
                      ? "status-pill status-pill-emerald"
                      : item.status === "PARTIALLY_PAID"
                        ? "status-pill status-pill-amber"
                        : "status-pill status-pill-blue"
                  }
                >
                  <span className="status-pill-dot" aria-hidden="true" />
                  <span>{item.status.replace(/_/g, " ")}</span>
                </span>
                {transition && (
                  <span
                    className="status-pill status-pill-emerald"
                    style={{ fontSize: "0.68rem", padding: "0 0.4rem" }}
                  >
                    <span>
                      {transition.from} → {transition.to}
                    </span>
                  </span>
                )}
              </div>
              <span
                className="mono-label"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.status === "SETTLED"
                  ? "Released to merchant"
                  : item.status === "PARTIALLY_PAID"
                    ? "Partial deposit received"
                    : "Awaiting deposit"}
              </span>
            </div>

            <div className="kpi-cell">
              <div className="inline-flex items-center justify-between" style={{ width: "100%" }}>
                <span className="mono-label">Active Buyer Wallet</span>
                <span className="kpi-icon-badge">
                  <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
              <div
                className="mono-data tabular-nums"
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  color: wallet ? "var(--text-primary)" : "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {wallet ? wallet.accountId : "Not Connected"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.2rem" }}>
                <span className="mono-label">
                  {wallet
                    ? wallet.provider === "EMBEDDED_TESTNET_SIGNER"
                      ? "1-Click Gasless Relayer"
                      : `${wallet.provider.replace(/_/g, " ")}`
                    : "Meteor / MyNearWallet / Relayer"}
                </span>
                {wallet && (
                  <span
                    className="status-transition-tag"
                    style={{
                      fontSize: "0.68rem",
                      color:
                        wallet.network === "mainnet"
                          ? "var(--accent-primary)"
                          : "var(--status-settled-fg)",
                      background:
                        wallet.network === "mainnet"
                          ? "var(--accent-subtle)"
                          : "var(--status-settled-bg)",
                      fontWeight: 600,
                    }}
                  >
                    {wallet.network.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {errorBanner && (
          <div className="inline-error-banner" role="alert" style={{ marginTop: 0 }}>
            <span className="inline-flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorBanner}</span>
            </span>
            <button
              type="button"
              className="btn-quiet"
              style={{ color: "var(--status-failed-fg)", padding: "0.2rem 0.5rem" }}
              onClick={() => setErrorBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 2-Column Main Split Grid */}
        <div className="checkout-split-grid">
          {/* Left Column: Wallet Connection + Settlement Execution */}
          <div className="fin-card" style={{ display: "flex", flexDirection: "column" }}>
            {/* Equal-Height Payment Rail Toggle: Native NEAR vs. NEAR Intents 1Click */}
            <div
              role="tablist"
              aria-label="Payment Rail Selection"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "0.4rem",
                padding: "0.32rem",
                background: "var(--surface-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: 10,
                marginBottom: "1.3rem",
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={payRail === "NEAR_WALLET"}
                className={`filter-pill inline-flex items-center justify-center gap-2 whitespace-nowrap ${
                  payRail === "NEAR_WALLET" ? "filter-pill-active" : ""
                }`}
                style={{
                  minHeight: 42,
                  padding: "0.48rem 0.75rem",
                  fontSize: "0.79rem",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  fontFamily: "var(--font-sans)",
                  borderRadius: 8,
                }}
                onClick={() => setPayRail("NEAR_WALLET")}
              >
                <CryptoTokenIcon symbol="NEAR" size={18} />
                <span className="truncate">Pay with NEAR (Meteor / Testnet)</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={payRail === "ONE_CLICK_INTENTS"}
                className={`filter-pill inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  payRail === "ONE_CLICK_INTENTS" ? "filter-pill-active" : ""
                }`}
                style={{
                  minHeight: 42,
                  padding: "0.48rem 0.75rem",
                  fontSize: "0.79rem",
                  fontWeight: 600,
                  letterSpacing: "-0.01em",
                  fontFamily: "var(--font-sans)",
                  borderRadius: 8,
                }}
                onClick={() => setPayRail("ONE_CLICK_INTENTS")}
              >
                <Zap
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: "var(--accent-primary)" }}
                  aria-hidden="true"
                />
                <span className="truncate">Pay Any Chain</span>
              </button>
            </div>

            {payRail === "ONE_CLICK_INTENTS" ? (
              <div className="form-section-last" style={{ paddingTop: 0 }}>
                <div className="form-section-header">
                  <span className="form-section-title">
                    <span className="form-section-step">01</span>
                    <span>Cross-Chain Payment Rails</span>
                  </span>
                  <span className="status-pill status-pill-emerald">
                    <span className="status-pill-dot" aria-hidden="true" />
                    Live Solver Network
                  </span>
                </div>

                {/* Protocol Execution Routing Matrix */}
                <div
                  style={{
                    marginBottom: "1.15rem",
                    borderRadius: 10,
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-2)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "0.55rem 0.85rem",
                      background: "var(--surface-3)",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.75rem",
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
                          background: "var(--status-pending-fg)",
                          display: "inline-block",
                        }}
                        aria-hidden="true"
                      />
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        Solver Routing · Evaluation Runtime
                      </span>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      Solver: Mainnet · Escrow: Testnet
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
                          padding: "0.5rem 0.65rem",
                          borderRadius: 8,
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--text-muted)",
                            marginBottom: "0.15rem",
                          }}
                        >
                          Solver Oracle Rail
                        </div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          1Click Solver API
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "0.5rem 0.65rem",
                          borderRadius: 8,
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--text-muted)",
                            marginBottom: "0.15rem",
                          }}
                        >
                          Settlement Target
                        </div>
                        <div
                          className="mono-data tabular-nums"
                          style={{
                            fontSize: "0.76rem",
                            fontWeight: 600,
                            color: "var(--status-settled-fg)",
                          }}
                        >
                          {escrowContractId}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "0.76rem",
                        lineHeight: 1.48,
                        color: "var(--text-secondary)",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--status-pending-fg)",
                          fontWeight: 700,
                          fontSize: "0.72rem",
                          flexShrink: 0,
                          marginTop: "0.08rem",
                        }}
                      >
                        Note
                      </span>
                      <span>
                        Pricing quotes and deposit addresses query production 1Click solvers in
                        real-time. Because the escrow contract is on <strong>NEAR Testnet</strong>{" "}
                        for zero-cost evaluation, use{" "}
                        <strong>Execute Solver Settlement</strong> below to test atomic settlement.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="field-group" style={{ marginBottom: "1.1rem" }}>
                  <label className="field-label">
                    <span>Select Source Token &amp; Chain</span>
                  </label>
                  <div className="token-selector-grid">
                    {POPULAR_ONE_CLICK_ASSETS.map((asset) => {
                      const isSelected = oneClickAsset.assetId === asset.assetId;
                      return (
                        <button
                          key={asset.assetId}
                          type="button"
                          className={`token-selector-card ${
                            isSelected ? "token-selector-card-active" : ""
                          }`}
                          onClick={() => {
                            setOneClickAsset(asset);
                            setOneClickDepositAddress(null);
                            setOneClickStatus(null);
                          }}
                        >
                          <CryptoTokenIcon
                            symbol={asset.symbol}
                            chain={asset.blockchain}
                            size={26}
                          />
                          <div style={{ textAlign: "left", minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 650,
                                fontSize: "0.83rem",
                                color: "var(--text-primary)",
                                lineHeight: 1.2,
                              }}
                            >
                              {asset.symbol}
                            </div>
                            <div
                              className="truncate"
                              style={{
                                fontSize: "0.68rem",
                                color: "var(--text-muted)",
                                marginTop: "0.08rem",
                              }}
                            >
                              {asset.name}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Solver Quote Ticket */}
                {item && (
                  <div
                    className="ticket-preview-card"
                    style={{
                      marginBottom: "1.05rem",
                    }}
                  >
                    <div
                      className="ticket-header-band"
                      style={{
                        padding: "0.7rem 1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div className="inline-flex items-center gap-2">
                        <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                          NEAR Intents Quote
                        </span>
                        {!oneClickDepositAddress && (
                          <span
                            className="status-pill"
                            style={{
                              background: "rgba(255, 255, 255, 0.06)",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                              color: "var(--text-muted)",
                            }}
                          >
                            DRY-RUN QUOTE — no deposit address
                          </span>
                        )}
                        {oneClickQuote?.source === "live" ? (
                          <span
                            className="status-pill status-pill-emerald"
                            style={{ fontSize: "0.68rem" }}
                          >
                            <span className="status-pill-dot status-pill-dot-pulse" aria-hidden="true" />
                            <span>Live</span>
                          </span>
                        ) : oneClickQuote?.source === "oracle-fallback" ? (
                          <span
                            className="status-pill"
                            style={{
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#f59e0b",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              fontSize: "0.68rem",
                              fontWeight: 600,
                            }}
                          >
                            Fallback estimate (not executable)
                          </span>
                        ) : null}
                      </div>

                      {oneClickLoading ? (
                        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                          Fetching Solver Quote…
                        </span>
                      ) : oneClickError || oneClickQuote?.state === "unavailable" ? (
                        <div className="inline-flex items-center gap-2">
                          <span
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--status-failed-fg)",
                              fontWeight: 600,
                            }}
                          >
                            Solver unavailable, retry
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void fetchOneClickQuote(
                                oneClickAsset.assetId,
                                effectiveQuoteAmount || item.amountDecimal,
                                true,
                              )
                            }
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: "var(--accent-primary)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Retry Quote ↻
                          </button>
                        </div>
                      ) : isQuoteExpired(oneClickQuote?.deadlineIso) ? (
                        <div className="inline-flex items-center gap-2">
                          <span style={{ fontSize: "0.72rem", color: "#f59e0b", fontWeight: 600 }}>
                            Quote expired
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void fetchOneClickQuote(
                                oneClickAsset.assetId,
                                effectiveQuoteAmount || item.amountDecimal,
                                true,
                              )
                            }
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: "var(--accent-primary)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                            }}
                          >
                            Refresh ↻
                          </button>
                        </div>
                      ) : (
                        <span
                          className="tabular-nums"
                          style={{
                            fontFamily: "var(--font-family-mono)",
                            fontSize: "0.72rem",
                            color: "var(--status-settled-fg)",
                          }}
                        >
                          Est. Finality: ~{oneClickQuote?.timeEstimateSeconds ?? 20}s
                        </span>
                      )}
                    </div>

                    <div style={{ padding: "1rem 1.15rem" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          paddingBottom: "0.65rem",
                          borderBottom: "1px dashed var(--border-default)",
                        }}
                      >
                        <span style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                          You Send on {oneClickAsset.name}:
                        </span>
                        <div style={{ textAlign: "right" }}>
                          <span
                            className="mono-data tabular-nums"
                            style={{ fontSize: "1.12rem", fontWeight: 700 }}
                            title={
                              oneClickQuote?.amountInFormatted
                                ? `Exact quote: ${oneClickQuote.amountInFormatted} ${oneClickAsset.symbol}`
                                : undefined
                            }
                          >
                            {oneClickLoading
                              ? "Calculating…"
                              : `${formatCryptoQuoteAmount(oneClickQuote?.amountInFormatted)} ${
                                  oneClickAsset.symbol
                                }`}
                          </span>
                          {oneClickQuote?.amountInUsd ? (
                            <div
                              className="mono-data tabular-nums"
                              style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}
                            >
                              ≈ ${Number(oneClickQuote.amountInUsd).toFixed(2)} USD
                            </div>
                          ) : oneClickError ? (
                            <div
                              style={{ fontSize: "0.72rem", color: "var(--status-failed-fg)" }}
                            >
                              {oneClickError}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {oneClickQuote?.spotPrice ? (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "0.5rem 0",
                            borderBottom: "1px dashed var(--border-subtle)",
                            fontSize: "0.75rem",
                          }}
                        >
                          <span style={{ color: "var(--text-muted)" }}>
                            Live Spot Price ({oneClickAsset.symbol}):
                          </span>
                          <div className="inline-flex items-center gap-2">
                            <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                              $
                              {oneClickQuote.spotPrice.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              USD
                            </span>
                            {(() => {
                              const isLiveFeed =
                                oneClickQuote.source === "live" &&
                                oneClickQuote.state === "available";
                              return (
                                <span
                                  className="inline-flex items-center gap-1"
                                  style={{
                                    color: isLiveFeed
                                      ? "var(--status-settled-fg)"
                                      : "var(--status-pending-fg)",
                                    fontSize: "0.72rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  <span
                                    className={`status-pill-dot ${isLiveFeed ? "status-pill-dot-pulse" : ""}`}
                                    aria-hidden="true"
                                  />
                                  <span>{isLiveFeed ? "Live Feed" : "Estimate"}</span>
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.5rem 0",
                          borderBottom: "1px dashed var(--border-subtle)",
                          fontSize: "0.75rem",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          Solver Protocol Fee:
                        </span>
                        <div className="inline-flex items-center gap-2">
                          <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                            {oneClickQuote?.source === "oracle-fallback" ||
                            oneClickQuote?.state === "unavailable"
                              ? "~0.2% (estimate)"
                              : oneClickQuote?.feeLabel ??
                                (oneClickQuote?.feePercent != null
                                  ? `${oneClickQuote.feePercent}% (${oneClickQuote.feeBps ?? Math.round(oneClickQuote.feePercent * 100)} bps)`
                                  : "~0.2% (estimate)")}
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          padding: "0.65rem 0 0.35rem",
                        }}
                      >
                        <span style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
                          Merchant Receives on NEAR:
                        </span>
                        <span
                          className="mono-data tabular-nums"
                          style={{
                            fontSize: "1.12rem",
                            fontWeight: 700,
                            color: "var(--status-settled-fg)",
                          }}
                          title={`${item.amountDecimal} USDC`}
                        >
                          {formatUsdc2(item.amountDecimal)} USDC
                        </span>
                      </div>

                      <div
                        className="field-hint"
                        style={{
                          marginTop: "0.35rem",
                          paddingTop: "0.5rem",
                          borderTop: "1px solid var(--border-subtle)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span>
                          Direct NEP-141 checkout has zero Ledgerly protocol fee. Cross-chain routing via NEAR Intents includes 0.20% solver network fee.
                        </span>
                        <a
                          href="https://1click.chaindefuser.com"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 whitespace-nowrap"
                          style={{
                            color: "var(--accent-primary)",
                            textDecoration: "none",
                            fontWeight: 600,
                            fontSize: "0.74rem",
                          }}
                        >
                          <span>{oneClickQuote?.source === "live" ? "Live Solver API" : "Estimate"}</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fallback Warning Notice */}
                {oneClickQuote?.source === "oracle-fallback" && (
                  <div
                    style={{
                      padding: "0.7rem 0.9rem",
                      borderRadius: 8,
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      color: "#f59e0b",
                      fontSize: "0.76rem",
                      marginBottom: "0.85rem",
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>Fallback estimate (not executable):</strong> Live solver quote is currently
                    unavailable. Deposit address generation and execution are disabled until a fresh live quote is
                    retrieved.
                  </div>
                )}

                {/* Deposit Address Box if Generated */}
                {oneClickDepositAddress &&
                item &&
                oneClickQuote?.state !== "unavailable" &&
                oneClickQuote?.source !== "oracle-fallback" &&
                !oneClickError ? (
                  <div
                    style={{
                      padding: "0.9rem 1rem",
                      borderRadius: 10,
                      border: "1px solid var(--border-default)",
                      background: "var(--surface-2)",
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 600 }}>
                          Intent Deposit Target · {oneClickAsset.symbol} ({oneClickAsset.name})
                        </span>
                        <span
                          className="status-transition-tag"
                          style={{
                            color: "var(--status-pending-fg)",
                            background: "var(--status-pending-bg)",
                            fontSize: "0.68rem",
                            fontWeight: 600,
                          }}
                        >
                          Testnet Evaluation
                        </span>
                      </div>
                      <span className="status-pill status-pill-emerald">
                        <span className="status-pill-dot" aria-hidden="true" />
                        {oneClickStatus ?? "PENDING_DEPOSIT"}
                      </span>
                    </div>

                    <div
                      className="mono-data tabular-nums"
                      style={{
                        padding: "0.55rem 0.75rem",
                        background: "var(--surface-canvas)",
                        borderRadius: 8,
                        border: "1px solid var(--border-subtle)",
                        fontSize: "0.78rem",
                        wordBreak: "break-all",
                        marginBottom: "0.55rem",
                        color: "var(--text-primary)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span>{oneClickDepositAddress}</span>
                      <button
                        type="button"
                        className="btn-secondary inline-flex items-center gap-1 whitespace-nowrap"
                        style={{
                          fontSize: "0.72rem",
                          padding: "0.24rem 0.55rem",
                          flexShrink: 0,
                          height: "auto",
                        }}
                        onClick={() => {
                          if (navigator.clipboard) {
                            void navigator.clipboard.writeText(oneClickDepositAddress);
                            setCopiedDepositAddr(true);
                            setTimeout(() => setCopiedDepositAddr(false), 1600);
                            pushToast(
                              "success",
                              "Deposit Address Copied",
                              "Inspection only: Contract runs on NEAR Testnet for evaluation.",
                            );
                          }
                        }}
                      >
                        {copiedDepositAddr ? (
                          <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3 h-3 shrink-0" aria-hidden="true" />
                        )}
                        <span>{copiedDepositAddr ? "Copied" : "Copy"}</span>
                      </button>
                    </div>

                    <div
                      style={{
                        fontSize: "0.74rem",
                        color: "var(--text-muted)",
                        marginBottom: "0.75rem",
                        lineHeight: 1.45,
                      }}
                    >
                      Live programmatic solver address. To settle the invoice without real mainnet
                      capital, execute the automated solver settlement relayer below.
                    </div>

                    <button
                      type="button"
                      className="btn-primary tabular-nums inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                      style={{
                        fontSize: "0.8rem",
                        padding: "0.55rem 0.85rem",
                        width: "100%",
                        fontWeight: 600,
                      }}
                      disabled={
                        Boolean(busyKey) || isQuoteExpired(oneClickQuote?.deadlineIso)
                      }
                      onClick={handleSimulateOneClickFulfillment}
                    >
                      <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {busyKey === "simulate_oneclick"
                          ? "Relaying Testnet Escrow Settlement…"
                          : `Execute Solver Settlement on NEAR Testnet (${formatUsdc2(
                              item.amountDecimal,
                            )} USDC)`}
                      </span>
                      <CapabilityBadge
                        id="solver_settlement"
                        networkMode={network?.mode}
                        className="ml-1"
                      />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                    {!network?.enableLiveIntents ? (
                      <div
                        style={{
                          padding: "0.65rem 0.85rem",
                          borderRadius: 8,
                          background: "var(--surface-2)",
                          border: "1px dashed var(--border-subtle)",
                          fontSize: "0.76rem",
                          color: "var(--text-muted)",
                          textAlign: "center",
                          lineHeight: 1.4,
                        }}
                      >
                        Live deposit addresses are disabled in this demo
                      </div>
                    ) : oneClickQuote?.source === "oracle-fallback" ? (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ width: "100%", opacity: 0.5, cursor: "not-allowed" }}
                        disabled
                      >
                        <span>Deposit Address Disabled (Fallback Quote)</span>
                      </button>
                    ) : (
                      <>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.55rem",
                            fontSize: "0.76rem",
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            lineHeight: 1.4,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={liveDisclaimerConfirmed}
                            onChange={(e) => setLiveDisclaimerConfirmed(e.target.checked)}
                            style={{ marginTop: "0.15rem", cursor: "pointer" }}
                          />
                          <span>
                            mainnet solver address; demo escrow is testnet; do not send real funds
                          </span>
                        </label>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ width: "100%" }}
                          disabled={
                            oneClickLoading ||
                            Boolean(busyKey) ||
                            !item ||
                            !liveDisclaimerConfirmed ||
                            isQuoteExpired(oneClickQuote?.deadlineIso)
                          }
                          onClick={handleGenerateOneClickAddress}
                        >
                          <span>
                            {isQuoteExpired(oneClickQuote?.deadlineIso)
                              ? "Quote Expired — Please Refresh"
                              : !liveDisclaimerConfirmed
                                ? "Confirm Disclaimer to Generate Address"
                                : `Generate 1Click Deposit Address (${oneClickAsset.symbol})`}
                          </span>
                        </button>
                      </>
                    )}
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
                      <span>NEAR Wallet Connection</span>
                    </span>
                    <span
                      className={
                        meteorDetected
                          ? "status-pill status-pill-emerald"
                          : "status-pill status-pill-blue"
                      }
                    >
                      <span className="status-pill-dot" aria-hidden="true" />
                      {meteorDetected ? "Meteor Extension Detected" : "Meteor Web Popup Ready"}
                    </span>
                  </div>

                  {/* Primary Provider: Meteor Wallet */}
                  <div
                    style={{
                      padding: "0.95rem 1rem",
                      borderRadius: 10,
                      border:
                        wallet?.provider === "METEOR_WALLET"
                          ? "1px solid var(--status-settled-border)"
                          : "1px solid var(--border-default)",
                      background:
                        wallet?.provider === "METEOR_WALLET"
                          ? "var(--status-settled-bg)"
                          : "var(--surface-2)",
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
                            color: "var(--text-primary)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.45rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <CryptoTokenIcon symbol="NEAR" size={18} />
                          <span>Meteor Wallet</span>
                          {wallet?.provider === "METEOR_WALLET" && (
                            <span
                              className="status-pill status-pill-emerald"
                              style={{ fontSize: "0.68rem", padding: "0.15rem 0.5rem" }}
                            >
                              <span className="status-pill-dot" aria-hidden="true" />
                              Connected: <span className="mono-data">{wallet.accountId}</span>
                            </span>
                          )}
                        </div>
                        <div className="field-hint" style={{ marginTop: "0.18rem" }}>
                          Connect via injected <code>window.meteorCom</code> bridge or Meteor Web
                          Wallet popup.
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <div className="filter-pill-group" aria-label="Meteor Network">
                          <button
                            type="button"
                            onClick={() => void handleSwitchMeteorNetwork("testnet")}
                            disabled={busyKey === "connect_meteor"}
                            className={`filter-pill ${
                              meteorNetwork === "testnet" ? "filter-pill-active" : ""
                            }`}
                            title="Switch to NEAR Testnet in Meteor Wallet"
                          >
                            {busyKey === "connect_meteor" && meteorNetwork === "testnet" ? (
                              <>
                                <span
                                  className="btn-spinner"
                                  aria-hidden="true"
                                  style={{ width: 10, height: 10 }}
                                />
                                <span>Switching…</span>
                              </>
                            ) : (
                              "Testnet"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSwitchMeteorNetwork("mainnet")}
                            disabled={busyKey === "connect_meteor"}
                            className={`filter-pill ${
                              meteorNetwork === "mainnet" ? "filter-pill-active" : ""
                            }`}
                            title="Switch to NEAR Mainnet in Meteor Wallet"
                          >
                            {busyKey === "connect_meteor" && meteorNetwork === "mainnet" ? (
                              <>
                                <span
                                  className="btn-spinner"
                                  aria-hidden="true"
                                  style={{ width: 10, height: 10 }}
                                />
                                <span>Switching…</span>
                              </>
                            ) : (
                              "Mainnet"
                            )}
                          </button>
                        </div>

                        {wallet?.provider === "METEOR_WALLET" ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{
                              padding: "0.48rem 0.95rem",
                              fontSize: "0.8rem",
                              color: "var(--status-failed-fg)",
                              borderColor: "var(--status-failed-border)",
                              background: "var(--status-failed-bg)",
                              fontWeight: 500,
                            }}
                            disabled={Boolean(busyKey)}
                            onClick={handleDisconnectWallet}
                          >
                            Disconnect
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ padding: "0.48rem 0.95rem", fontSize: "0.8rem" }}
                            disabled={Boolean(busyKey)}
                            onClick={() => void handleConnectMeteor()}
                          >
                            {busyKey === "connect_meteor" ? (
                              <>
                                <span className="btn-spinner" aria-hidden="true" />
                                <span>Connecting…</span>
                              </>
                            ) : (
                              <span>Connect Meteor</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Alternative Providers: MyNearWallet + Embedded Ed25519 Testnet Signer */}
                  <div className="form-grid-2" style={{ gap: "0.75rem", alignItems: "flex-start" }}>
                    <div className="field-group">
                      <label className="field-label" htmlFor="buyer-near-account">
                        <span>Buyer NEAR Account (.testnet)</span>
                      </label>
                      <input
                        id="buyer-near-account"
                        className="ledger-input mono-data"
                        value={customBuyerAccount}
                        onChange={(e) => setCustomBuyerAccount(e.target.value)}
                        placeholder="e.g. yourname.testnet"
                      />
                    </div>

                    <div className="field-group">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.4rem",
                        }}
                      >
                        <label className="field-label" style={{ marginBottom: 0 }}>
                          <span>Alternative Signers</span>
                        </label>
                        {wallet?.provider === "EMBEDDED_TESTNET_SIGNER" && (
                          <button
                            type="button"
                            className="btn-quiet inline-flex items-center gap-1"
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--status-failed-fg)",
                              padding: "0.1rem 0.35rem",
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                            onClick={handleDisconnectWallet}
                            title="Disconnect relayer session"
                          >
                            Disconnect ✕
                          </button>
                        )}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center justify-center gap-1 whitespace-nowrap"
                          style={{
                            padding: "0.52rem 0.7rem",
                            fontSize: "0.78rem",
                            borderColor:
                              wallet?.provider === "EMBEDDED_TESTNET_SIGNER"
                                ? "var(--status-settled-border)"
                                : undefined,
                            background:
                              wallet?.provider === "EMBEDDED_TESTNET_SIGNER"
                                ? "var(--status-settled-bg)"
                                : undefined,
                          }}
                          disabled={Boolean(busyKey)}
                          onClick={handleConnectEmbedded}
                        >
                          {wallet?.provider === "EMBEDDED_TESTNET_SIGNER" ? (
                            <>
                              <Check
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: "var(--status-settled-fg)" }}
                                aria-hidden="true"
                              />
                              <span style={{ color: "var(--status-settled-fg)", fontWeight: 650 }}>
                                Relayer Active
                              </span>
                            </>
                          ) : (
                            <span>1-Click Relayer (Gasless)</span>
                          )}
                        </button>

                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center justify-center gap-1 whitespace-nowrap"
                          style={{ padding: "0.52rem 0.7rem", fontSize: "0.78rem" }}
                          disabled={Boolean(busyKey)}
                          onClick={handleConnectMyNearWallet}
                        >
                          <span>MyNearWallet</span>
                          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        </button>
                      </div>
                      <span className="field-hint" style={{ marginTop: "0.35rem", display: "block", fontSize: "0.72rem" }}>
                        Sponsored gasless relayer for instant checkout demo.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Step 02: Settlement Execution */}
                {item && (
                  <div className="form-section-last">
                    <div className="form-section-header">
                      <span className="form-section-title">
                        <span className="form-section-step">02</span>
                        <span>Execute NEP-141 Escrow Deposit</span>
                      </span>
                    </div>

                    <div className="field-group" style={{ marginBottom: "0.85rem" }}>
                      <div className="field-label">
                        <label htmlFor="checkout-deposit-amount">Deposit Amount</label>
                        <div className="filter-pill-group">
                          <button
                            type="button"
                            className="filter-pill tabular-nums"
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
                            className="filter-pill tabular-nums"
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
                            className="filter-pill tabular-nums"
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
                          id="checkout-deposit-amount"
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
                        Excess overpayments are automatically refunded; exact invoice amount is
                        released to the merchant.
                      </span>
                    </div>

                    {item.status === "SETTLED" ? (
                      <div
                        style={{
                          padding: "0.95rem 1rem",
                          borderRadius: 10,
                          border: "1px solid var(--status-settled-border)",
                          background: "var(--status-settled-bg)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            className="tabular-nums"
                            style={{
                              fontSize: "0.86rem",
                              fontWeight: 600,
                              color: "var(--status-settled-fg)",
                            }}
                          >
                            Invoice Settled On-Chain ({formatUsdc2(item.amountDecimal)} USDC)
                          </div>
                          <div className="field-hint" style={{ color: "var(--status-settled-fg)" }}>
                            Double-entry journal posted and escrow closed on {escrowContractId}.
                          </div>
                        </div>
                        {lastTxHash && isRealNearTx(lastTxHash) && (
                          <a
                            href={`${explorerBaseUrl}/txns/${lastTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary inline-flex items-center gap-1 whitespace-nowrap"
                            style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}
                          >
                            <span>View Tx on Nearblocks</span>
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="btn-primary tabular-nums"
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
                              <span>Signing &amp; Broadcasting to NEAR Testnet…</span>
                            </>
                          ) : (
                            <span>
                              Sign &amp; Pay (
                              {formatUsdc2(customPayAmount || item.remainingDecimal)} USDC)
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          className="btn-secondary tabular-nums"
                          disabled={Boolean(busyKey) || !wallet}
                          onClick={() => void requestFaucet()}
                        >
                          {busyKey === "faucet" ? "Minting…" : "Get 100 test USDC"}
                        </button>

                        <button
                          type="button"
                          className="btn-secondary tabular-nums"
                          disabled={Boolean(busyKey)}
                          onClick={() =>
                            executePayment(
                              "pay_overpay",
                              (Number(item.amountDecimal) + 20).toFixed(2),
                            )
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

          {/* Right Column: Escrow Telemetry & NEP-141 Payload Inspector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="fin-card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                }}
              >
                <span className="form-section-title">On-Chain Escrow &amp; Privacy Telemetry</span>
                {(() => {
                  const hasRealTx = Boolean(item?.latestTxHash);
                  const isHeldOrClosed =
                    item?.status === "PAID" ||
                    item?.status === "SETTLED" ||
                    item?.status === "HELD" ||
                    item?.status === "CLOSED" ||
                    item?.status === "OVERPAID" ||
                    item?.status === "PARTIALLY_PAID";
                  const isLiveTestnet = network?.mode === "NEAR_TESTNET_RPC";

                  if (hasRealTx && isHeldOrClosed && isLiveTestnet) {
                    return (
                      <span className="status-pill status-pill-emerald">
                        <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>Verified on NEAR</span>
                      </span>
                    );
                  }
                  if (network?.mode === "LOCAL_SANDBOX_SIMULATION" && isHeldOrClosed) {
                    return (
                      <span className="status-pill status-pill-amber">
                        <span className="status-pill-dot" aria-hidden="true" />
                        <span>Simulated (Sandbox)</span>
                      </span>
                    );
                  }
                  return (
                    <span className="status-pill status-pill-blue">
                      <span
                        className="status-pill-dot status-pill-dot-pulse"
                        aria-hidden="true"
                      />
                      <span>Pending Settlement</span>
                    </span>
                  );
                })()}
              </div>

              {item ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "160px minmax(0, 1fr)",
                    fontSize: "0.82rem",
                  }}
                >
                  <div
                    className="mono-label"
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Request ID
                  </div>
                  <div
                    className="mono-data tabular-nums"
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {item.id}
                  </div>

                  <div
                    className="mono-label"
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Escrow Contract
                  </div>
                  <div
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <HashBadge
                      value={escrowContractId}
                      href={`${explorerBaseUrl}/address/${escrowContractId}`}
                    />
                  </div>

                  <div
                    className="mono-label"
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Opaque Escrow ID
                  </div>
                  <div
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <HashBadge value={item.escrowId} startChars={12} endChars={8} />
                  </div>

                  <div
                    className="mono-label"
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    SHA-256 Commitment
                  </div>
                  <div
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <HashBadge value={item.commitment} startChars={12} endChars={8} />
                  </div>

                  <div
                    className="mono-label"
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Private Payload
                  </div>
                  <div
                    style={{
                      padding: "0.8rem 1.15rem",
                      borderBottom: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <HashBadge
                      value={item.cipherPreview.replace(/…$/, "")}
                      startChars={12}
                      endChars={6}
                    />
                    <span className="mono-label" style={{ fontSize: "0.7rem" }}>
                      Off-Chain Encrypted
                    </span>
                  </div>

                  <div
                    className="mono-label"
                    style={{
                      padding: "0.8rem 1.15rem",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Latest On-Chain Tx
                  </div>
                  <div
                    style={{
                      padding: "0.8rem 1.15rem",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {lastTxHash && isRealNearTx(lastTxHash) ? (
                      <HashBadge
                        value={lastTxHash}
                        startChars={10}
                        endChars={8}
                        href={`${explorerBaseUrl}/txns/${lastTxHash}`}
                      />
                    ) : (
                      <span className="mono-label" style={{ color: "var(--text-muted)" }}>
                        Pending on-chain payment
                      </span>
                    )}
                  </div>
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
                    Verify that no invoice numbers, emails, or business metadata touch NEAR
                    on-chain.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
                  style={{ padding: "0.38rem 0.75rem", fontSize: "0.75rem" }}
                  onClick={() => setShowPayloadInspector((v) => !v)}
                >
                  <Code2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{showPayloadInspector ? "Hide JSON" : "Inspect JSON"}</span>
                </button>
              </div>

              {showPayloadInspector && ftPreview && (
                <pre
                  className="mono-data tabular-nums"
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: 8,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
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
                <label
                  className="field-label"
                  htmlFor="external-tx-input"
                  style={{ marginBottom: "0.35rem" }}
                >
                  <span>Verify External NEAR Transaction Hash</span>
                </label>
                <div style={{ display: "flex", gap: "0.45rem" }}>
                  <input
                    id="external-tx-input"
                    className="ledger-input mono-data"
                    placeholder="Paste Nearblocks txHash (e.g. 8kkX2fMU7tYo...)"
                    value={externalTxInput}
                    onChange={(e) => setExternalTxInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary whitespace-nowrap"
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
              <div
                style={{
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "flex-start",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <span
                  className="status-pill-dot"
                  style={{
                    marginTop: "0.38rem",
                    color:
                      t.kind === "error" ? "var(--status-failed-fg)" : "var(--status-settled-fg)",
                  }}
                  aria-hidden="true"
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {t.title}
                  </div>
                  {t.detail && (
                    <div
                      className="mono-data tabular-nums"
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        marginTop: "0.2rem",
                        lineHeight: 1.35,
                        wordBreak: "break-word",
                      }}
                    >
                      {t.detail}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="btn-quiet"
                style={{
                  padding: "0.15rem",
                  flexShrink: 0,
                }}
              >
                <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
