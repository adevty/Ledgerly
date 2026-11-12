"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  ReceiptText,
  Search,
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

function getCheckoutBusyLabel(key: string | null): { title: string; desc: string } {
  switch (key) {
    case "pay_custom":
      return {
        title: "Signing & Depositing to Escrow",
        desc: "Calling ft_transfer_call on testnet USDC with escrow payload...",
      };
    case "pay_overpay":
      return {
        title: "Simulating Overpayment Deposit",
        desc: "Broadcasting deposit with excess amount to test automated split...",
      };
    case "simulate_oneclick":
      return {
        title: "Executing 1-Click Relayer Intent",
        desc: "Broadcasting solver execution to settle escrow on testnet...",
      };
    case "faucet":
      return {
        title: "Requesting Testnet USDC Faucet",
        desc: "Minting 100 testnet USDC to your connected wallet...",
      };
    case "verify_tx":
      return {
        title: "Verifying External Transaction",
        desc: "Querying NEAR RPC for receipt execution outcome...",
      };
    case "connect_meteor":
      return {
        title: "Connecting Meteor Wallet",
        desc: "Awaiting approval from browser wallet bridge...",
      };
    case "connect_embedded":
      return {
        title: "Initializing Embedded Wallet",
        desc: "Setting up testnet keypair for gasless testing...",
      };
    default:
      return {
        title: "Processing Transaction",
        desc: "Broadcasting cryptographic state to NEAR testnet...",
      };
  }
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
  const [isInvoiceMenuOpen, setIsInvoiceMenuOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceMenuFilter, setInvoiceMenuFilter] = useState<"ALL" | "OPEN" | "SETTLED">("ALL");
  const invoiceMenuRef = useRef<HTMLDivElement>(null);
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
  }, [loadState, verifyExternalTxHash]);

  // Click outside to close custom invoice dropdown menu
  useEffect(() => {
    if (!isInvoiceMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (invoiceMenuRef.current && !invoiceMenuRef.current.contains(e.target as Node)) {
        setIsInvoiceMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsInvoiceMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isInvoiceMenuOpen]);

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
        `Payment quote ready. Click Simulate Testnet Settlement below to test payment on NEAR testnet.`,
      );
    } else {
      pushToast(
        "error",
        "Could Not Generate Deposit Address",
        quote?.error ?? "Quote unavailable, retry",
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
          "Cross-Chain Payment Settled (Simulated)",
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: "0.35rem" }}>
            NEAR Smart Escrow · Multi-Chain Intent Settlement
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 650,
              letterSpacing: "-0.03em",
              marginBottom: "0.35rem",
              color: "var(--text-primary)",
            }}
          >
            Buyer Checkout &amp; Escrow Matching
          </h1>
          <p
            style={{
              fontSize: "0.86rem",
              color: "var(--text-muted)",
              maxWidth: 680,
              lineHeight: 1.55,
            }}
          >
            Deposit mock USDC on NEAR Testnet or settle across chains via 1Click Intents with automated overpayment refund.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          {/* Topbar Custom Invoice Selector Menu */}
          {requests.length > 0 && (() => {
            const openInvoices = requests.filter(
              (r) => r.status === "OPEN" || r.status === "PARTIALLY_PAID",
            );
            const settledInvoices = requests.filter((r) => r.status === "SETTLED");
            const isOpen = item?.status === "OPEN" || item?.status === "PARTIALLY_PAID";

            const filteredList = requests.filter((r) => {
              if (invoiceMenuFilter === "OPEN" && r.status !== "OPEN" && r.status !== "PARTIALLY_PAID") return false;
              if (invoiceMenuFilter === "SETTLED" && r.status !== "SETTLED") return false;
              if (invoiceSearch.trim()) {
                const q = invoiceSearch.toLowerCase().trim();
                return (
                  r.id.toLowerCase().includes(q) ||
                  r.amountDecimal.includes(q) ||
                  r.status.toLowerCase().includes(q)
                );
              }
              return true;
            });

            return (
              <div
                ref={invoiceMenuRef}
                style={{
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {/* Trigger Pill Button */}
                <button
                  type="button"
                  onClick={() => setIsInvoiceMenuOpen((v) => !v)}
                  className="group transition-all duration-150 hover:border-emerald-500/40"
                  aria-expanded={isInvoiceMenuOpen}
                  aria-haspopup="listbox"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    padding: "0.38rem 0.65rem 0.38rem 0.65rem",
                    borderRadius: 8,
                    background: "var(--surface-1)",
                    border: isInvoiceMenuOpen
                      ? "1px solid var(--accent-primary)"
                      : "1px solid var(--border-default)",
                    fontSize: "0.78rem",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    outline: "none",
                  }}
                  title="Click to view & switch invoices"
                >
                  <ReceiptText className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
                  <span
                    className={`status-pill-dot ${isOpen ? "status-pill-dot-pulse" : ""}`}
                    style={{
                      backgroundColor: isOpen
                        ? "var(--status-pending-fg)"
                        : "var(--status-settled-fg)",
                      width: 6,
                      height: 6,
                    }}
                    aria-hidden="true"
                  />
                  <span className="mono-data tabular-nums" style={{ fontWeight: 600 }}>
                    {item ? item.id : "Select Invoice"}
                  </span>
                  {item && (
                    <>
                      <span style={{ color: "var(--text-muted)", opacity: 0.6 }}>·</span>
                      <span className="tabular-nums" style={{ fontWeight: 600 }}>
                        {Number(item.amountDecimal).toLocaleString("en-US", { maximumFractionDigits: 0 })} USDC
                      </span>
                      <span
                        className="hide-on-mobile-inline"
                        style={{
                          fontSize: "0.64rem",
                          fontWeight: 700,
                          padding: "0.08rem 0.35rem",
                          borderRadius: 4,
                          background: isOpen ? "var(--status-pending-bg)" : "var(--status-settled-bg)",
                          color: isOpen ? "var(--status-pending-fg)" : "var(--status-settled-fg)",
                          border: `1px solid ${isOpen ? "var(--status-pending-border)" : "var(--status-settled-border)"}`,
                        }}
                      >
                        {item.status}
                      </span>
                    </>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
                      isInvoiceMenuOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {/* Bespoke Custom Popover Menu */}
                {isInvoiceMenuOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      width: 350,
                      maxWidth: "calc(100vw - 2rem)",
                      borderRadius: 12,
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-default)",
                      boxShadow: "0 20px 48px -6px rgba(0, 0, 0, 0.45), 0 8px 18px rgba(0, 0, 0, 0.25)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      zIndex: 100,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* Header: Search + Filter Tabs */}
                    <div
                      style={{
                        padding: "0.75rem 0.85rem 0.55rem",
                        borderBottom: "1px solid var(--border-subtle)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          padding: "0.35rem 0.6rem",
                          borderRadius: 6,
                          background: "var(--surface-1)",
                          border: "1px solid var(--border-subtle)",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" aria-hidden="true" />
                        <input
                          type="text"
                          value={invoiceSearch}
                          onChange={(e) => setInvoiceSearch(e.target.value)}
                          placeholder="Search invoice ID or amount…"
                          style={{
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            fontSize: "0.76rem",
                            color: "var(--text-primary)",
                          }}
                          autoFocus
                        />
                        {invoiceSearch && (
                          <button
                            type="button"
                            onClick={() => setInvoiceSearch("")}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: 0,
                              color: "var(--text-muted)",
                            }}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        {(
                          [
                            { id: "ALL", label: `All (${requests.length})` },
                            { id: "OPEN", label: `Open (${openInvoices.length})` },
                            { id: "SETTLED", label: `Settled (${settledInvoices.length})` },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setInvoiceMenuFilter(tab.id)}
                            style={{
                              fontSize: "0.69rem",
                              fontWeight: 600,
                              padding: "0.18rem 0.48rem",
                              borderRadius: 5,
                              border: "1px solid",
                              borderColor:
                                invoiceMenuFilter === tab.id
                                  ? "var(--accent-primary)"
                                  : "var(--border-subtle)",
                              background:
                                invoiceMenuFilter === tab.id
                                  ? "var(--accent-subtle)"
                                  : "transparent",
                              color:
                                invoiceMenuFilter === tab.id
                                  ? "var(--text-primary)"
                                  : "var(--text-muted)",
                              cursor: "pointer",
                              transition: "all 120ms ease",
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Scrollable Items */}
                    <div
                      style={{
                        maxHeight: 280,
                        overflowY: "auto",
                        padding: "0.4rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                      }}
                    >
                      {filteredList.length === 0 ? (
                        <div
                          style={{
                            padding: "1.5rem",
                            textAlign: "center",
                            fontSize: "0.76rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          No matching invoices
                        </div>
                      ) : (
                        filteredList.map((r) => {
                          const isSelected = item?.id === r.id;
                          const isItemOpen =
                            r.status === "OPEN" || r.status === "PARTIALLY_PAID";
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                handleSelectInvoice(r);
                                setIsInvoiceMenuOpen(false);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "0.6rem",
                                padding: "0.5rem 0.65rem",
                                borderRadius: 7,
                                border: isSelected
                                  ? "1px solid var(--accent-primary)"
                                  : "1px solid transparent",
                                background: isSelected
                                  ? "var(--accent-subtle)"
                                  : "transparent",
                                textAlign: "left",
                                cursor: "pointer",
                                transition: "all 120ms ease",
                                width: "100%",
                              }}
                              className="hover:bg-white/5"
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.55rem",
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  className={`status-pill-dot ${
                                    isItemOpen ? "status-pill-dot-pulse" : ""
                                  }`}
                                  style={{
                                    backgroundColor: isItemOpen
                                      ? "var(--status-pending-fg)"
                                      : "var(--status-settled-fg)",
                                    width: 6,
                                    height: 6,
                                    flexShrink: 0,
                                  }}
                                  aria-hidden="true"
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    className="mono-data tabular-nums font-semibold"
                                    style={{
                                      fontSize: "0.78rem",
                                      color: isSelected
                                        ? "var(--text-primary)"
                                        : "var(--text-secondary)",
                                    }}
                                  >
                                    {r.id}
                                  </div>
                                  <div
                                    className="tabular-nums"
                                    style={{
                                      fontSize: "0.66rem",
                                      color: "var(--text-muted)",
                                      marginTop: "0.08rem",
                                    }}
                                  >
                                    {new Date(r.createdAtIso).toLocaleString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div
                                style={{
                                  textAlign: "right",
                                  flexShrink: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                }}
                              >
                                <div>
                                  <div
                                    className="tabular-nums font-semibold"
                                    style={{
                                      fontSize: "0.78rem",
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {Number(r.amountDecimal).toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}{" "}
                                    USDC
                                  </div>
                                  <span
                                    style={{
                                      fontSize: "0.62rem",
                                      fontWeight: 700,
                                      padding: "0.06rem 0.32rem",
                                      borderRadius: 4,
                                      background: isItemOpen
                                        ? "var(--status-pending-bg)"
                                        : "var(--status-settled-bg)",
                                      color: isItemOpen
                                        ? "var(--status-pending-fg)"
                                        : "var(--status-settled-fg)",
                                      border: `1px solid ${
                                        isItemOpen
                                          ? "var(--status-pending-border)"
                                          : "var(--status-settled-border)"
                                      }`,
                                      display: "inline-block",
                                      marginTop: "0.1rem",
                                    }}
                                  >
                                    {r.status}
                                  </span>
                                </div>
                                {isSelected && (
                                  <Check
                                    className="w-3.5 h-3.5 text-emerald-400 shrink-0"
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {wallet ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}>
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
              <button
                type="button"
                className="btn-quiet"
                style={{ padding: "0.3rem 0.55rem", fontSize: "0.74rem", color: "var(--text-muted)" }}
                onClick={handleDisconnectWallet}
                title="Disconnect wallet"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
              style={{ padding: "0.42rem 0.85rem", fontSize: "0.79rem", textDecoration: "none" }}
              disabled={busyKey === "connect_meteor"}
              onClick={() => void handleConnectMeteor()}
            >
              {busyKey === "connect_meteor" ? (
                <span className="btn-spinner" aria-hidden="true" />
              ) : (
                <Wallet className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{busyKey === "connect_meteor" ? "Connecting…" : "Connect Wallet"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      <div
        className="page-transition-enter"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
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
          <section className="kpi-strip" aria-label="Invoice Payment Status">
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
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
              <div className="toast-icon-badge toast-icon-badge-error" aria-hidden="true">
                <AlertCircle className="w-4 h-4 shrink-0" />
              </div>
              <div>
                <div>
                  <span className="toast-status-chip toast-status-chip-error">
                    Payment Issue
                  </span>
                </div>
                <div style={{ fontSize: "0.82rem", opacity: 0.95, lineHeight: 1.45 }}>
                  {errorBanner}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-quiet"
              style={{
                color: "var(--status-failed-fg)",
                padding: "0.25rem 0.55rem",
                borderRadius: "4px",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                fontWeight: 600,
                fontSize: "0.76rem",
              }}
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
                    Cross-Chain Payment
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
                        Cross-Chain Quote &amp; Demo Environment
                      </span>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                      Rates: 1Click API · Escrow: NEAR Testnet
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
                          Quote Source
                        </div>
                        <div
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          1Click API
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
                        Exchange rate quotes query the live 1Click API. Because the escrow contract
                        is on <strong>NEAR Testnet</strong> for evaluation, use{" "}
                        <strong>Simulate Testnet Settlement</strong> below to complete payment.
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
                          Fetching Rate Quote…
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
                            Quote unavailable, retry
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
                          Cross-Chain Network Fee:
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
                          Direct USDC payment on NEAR has zero platform fee. Cross-chain payments include a 0.20% network fee.
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
                          <span>{oneClickQuote?.source === "live" ? "Live Rate API" : "Estimate"}</span>
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
                    <strong>Estimate only (not executable):</strong> Live exchange rate is currently
                    unavailable. Multi-chain payment is paused until a fresh rate is retrieved.
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
                      Testnet payment simulation: To settle this invoice without spending real
                      cryptocurrency, trigger a test payment using testnet USDC below.
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
                      {busyKey === "simulate_oneclick" ? (
                        <span className="btn-spinner" aria-hidden="true" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {busyKey === "simulate_oneclick"
                          ? "Simulating Testnet Settlement…"
                          : `Simulate Testnet Settlement (${formatUsdc2(
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
                        Multi-chain deposit addresses are disabled in this demo (NEAR Testnet only).
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
                            Notice: This demo operates on NEAR testnet. Do not send real mainnet funds.
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
                {/* Step 01: Payer Account & Signer */}
                <div className="form-section" style={{ paddingTop: 0 }}>
                  <div className="form-section-header">
                    <span className="form-section-title">
                      <span className="form-section-step">01</span>
                      <span>Buyer Account &amp; Signer</span>
                    </span>
                    {wallet && (
                      <span className="status-pill status-pill-emerald">
                        <span className="status-pill-dot" aria-hidden="true" />
                        <span>Connected: {wallet.accountId}</span>
                      </span>
                    )}
                  </div>

                  {/* Account Input + Alternative Providers */}
                  <div className="form-grid-2" style={{ gap: "1rem", alignItems: "flex-start" }}>
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
                      <span className="field-hint" style={{ marginTop: "0.35rem", display: "block", fontSize: "0.72rem" }}>
                        {wallet?.accountId
                          ? `Using active signer: ${wallet.accountId}`
                          : "Specify your testnet account or choose an instant signer below."}
                      </span>
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

                      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center justify-center gap-1.5"
                          style={{
                            width: "100%",
                            padding: "0.52rem 0.75rem",
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
                                1-Click Relayer Active (Gasless)
                              </span>
                            </>
                          ) : (
                            <span>1-Click Relayer (Gasless)</span>
                          )}
                        </button>

                        <button
                          type="button"
                          className="btn-secondary inline-flex items-center justify-center gap-1.5"
                          style={{ width: "100%", padding: "0.52rem 0.75rem", fontSize: "0.78rem" }}
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
                          className="btn-secondary tabular-nums inline-flex items-center justify-center gap-1.5"
                          disabled={Boolean(busyKey) || !wallet}
                          onClick={() => void requestFaucet()}
                        >
                          {busyKey === "faucet" ? (
                            <>
                              <span className="btn-spinner" aria-hidden="true" />
                              <span>Minting 100 USDC…</span>
                            </>
                          ) : (
                            <span>Get 100 test USDC</span>
                          )}
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

          {/* Right Column: Escrow Status & Payment Verification */}
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
                <span className="form-section-title">On-Chain Escrow &amp; Privacy Status</span>
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
                  className="checkout-meta-grid"
                  style={{
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
                  <span className="mono-label">Loading settlement status…</span>
                </div>
              )}
            </div>

            {/* Payment Payload Inspector & Transaction Verifier */}
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
                  <div className="form-section-title">Token Transfer Payload Inspector</div>
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
                    className="btn-secondary whitespace-nowrap inline-flex items-center gap-1.5"
                    disabled={Boolean(busyKey) || !externalTxInput.trim()}
                    onClick={() => verifyExternalTxHash(externalTxInput, wallet?.accountId)}
                  >
                    {busyKey === "verify_tx" ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      <span>Verify Tx</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating In-Flight Transaction / Action Processing HUD */}
      {busyKey && (
        <aside
          className="tx-processing-hud"
          role="status"
          aria-live="assertive"
          aria-label="Transaction in progress"
        >
          <div className="tx-hud-card">
            <div className="tx-hud-spinner-wrap">
              <span className="tx-hud-spinner" aria-hidden="true" />
              <span className="tx-hud-spinner-inner" aria-hidden="true" />
            </div>
            <div className="tx-hud-content">
              <div className="tx-hud-title-row">
                <span className="tx-hud-title">{getCheckoutBusyLabel(busyKey).title}</span>
                <span className="tx-hud-badge">IN-FLIGHT</span>
              </div>
              <div className="tx-hud-subtitle">{getCheckoutBusyLabel(busyKey).desc}</div>
            </div>
            <div className="tx-hud-bar" aria-hidden="true">
              <div className="tx-hud-bar-inner" />
            </div>
          </div>
        </aside>
      )}

      {/* Non-blocking Toast Notifications */}
      {toasts.length > 0 && (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => {
            const isSuccess = t.kind === "success";
            return (
              <div
                key={t.id}
                className={`toast-item ${
                  isSuccess ? "toast-item-success" : "toast-item-error"
                }`}
              >
                <div
                  className={`toast-icon-badge ${
                    isSuccess ? "toast-icon-badge-success" : "toast-icon-badge-error"
                  }`}
                  aria-hidden="true"
                >
                  {isSuccess ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    <span
                      className={`toast-status-chip ${
                        isSuccess ? "toast-status-chip-success" : "toast-status-chip-error"
                      }`}
                    >
                      {isSuccess ? "Success" : "Failed"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "0.15rem",
                    }}
                  >
                    {t.title}
                  </div>
                  {t.detail && (
                    <div
                      className="mono-data tabular-nums"
                      style={{
                        fontSize: "0.74rem",
                        color: "var(--text-secondary)",
                        marginTop: "0.2rem",
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                      }}
                    >
                      {t.detail}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  aria-label="Dismiss notification"
                  className="btn-quiet"
                  style={{
                    padding: "0.25rem",
                    borderRadius: "4px",
                    flexShrink: 0,
                    opacity: 0.7,
                    cursor: "pointer",
                  }}
                >
                  <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
