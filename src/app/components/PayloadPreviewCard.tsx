"use client";

import React, { useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Code2 } from "lucide-react";

export interface PayloadPreviewCardProps {
  payload: Record<string, unknown> | string;
  kind?: "PAYMENT" | "REMITTANCE";
}

function formatMoney2(raw: unknown): string {
  const num = typeof raw === "number" ? raw : Number(String(raw ?? "0"));
  if (Number.isNaN(num)) return String(raw ?? "0.00");
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PayloadPreviewCard({ payload, kind }: PayloadPreviewCardProps) {
  const [showRaw, setShowRaw] = useState(false);

  const parsed: Record<string, unknown> = React.useMemo(() => {
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return { raw: payload };
      }
    }
    return payload ?? {};
  }, [payload]);

  const isRemittance =
    kind === "REMITTANCE" ||
    "recipientName" in parsed ||
    "recipientAccountOrWallet" in parsed ||
    "targetCurrency" in parsed;

  const isPayment =
    !isRemittance &&
    (kind === "PAYMENT" || "orderRef" in parsed || "customerEmail" in parsed);

  const rawJsonFormatted = React.useMemo(
    () => JSON.stringify(parsed, null, 2),
    [parsed],
  );

  if (isRemittance) {
    const recipientName = String(parsed.recipientName ?? "Beneficiary");
    const country = String(parsed.recipientCountry ?? "INTL");
    const account = String(parsed.recipientAccountOrWallet ?? "—");
    const sourceUsdc = formatMoney2(parsed.sourceUsdcDecimal ?? parsed.amountDecimal ?? 0);
    const targetCurrency = String(parsed.targetCurrency ?? "USDC");
    const hasTravelRule = Boolean(parsed.travelRule);

    return (
      <div className="payload-preview-card">
        <div className="payload-preview-top">
          <div className="inline-flex items-center gap-1.5 min-w-0">
            <span className="payload-preview-title truncate" title={recipientName}>
              {recipientName}
            </span>
            <span className="payload-country-badge">{country}</span>
            {hasTravelRule && (
              <span
                className="payload-compliance-badge inline-flex items-center gap-1"
                title="FATF Travel Rule Originator & Beneficiary Metadata Verified"
              >
                <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>FATF</span>
              </span>
            )}
          </div>

          <span className="payload-amount-pill tabular-nums inline-flex items-center gap-1 whitespace-nowrap">
            <span>{sourceUsdc} USDC</span>
            <ArrowRight className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{targetCurrency}</span>
          </span>
        </div>

        <div className="payload-preview-bottom">
          <span className="payload-account-pill tabular-nums" title={account}>
            {account}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowRaw((v) => !v);
            }}
            aria-expanded={showRaw}
            className="payload-raw-btn inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Code2 className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Raw JSON</span>
            {showRaw ? (
              <ChevronUp className="w-3 h-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>

        {showRaw && (
          <pre className="payload-raw-pre tabular-nums">{rawJsonFormatted}</pre>
        )}
      </div>
    );
  }

  if (isPayment) {
    const orderRef = String(parsed.orderRef ?? "Invoice");
    const email = parsed.customerEmail ? String(parsed.customerEmail) : null;
    const description = parsed.description ? String(parsed.description) : null;
    const amount = formatMoney2(parsed.amountDecimal ?? 0);
    const currency = String(parsed.currency ?? "USDC");

    return (
      <div className="payload-preview-card">
        <div className="payload-preview-top">
          <div className="inline-flex items-center gap-1.5 min-w-0">
            <span className="payload-preview-title tabular-nums">{orderRef}</span>
            <span className="payload-country-badge">Invoice</span>
          </div>

          <span className="payload-amount-pill tabular-nums whitespace-nowrap">
            {amount} {currency}
          </span>
        </div>

        <div className="payload-preview-bottom">
          <div className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
            {email && (
              <span className="payload-account-pill" title={email}>
                {email}
              </span>
            )}
            {description && (
              <span className="payload-desc-text truncate" title={description}>
                {description}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowRaw((v) => !v);
            }}
            aria-expanded={showRaw}
            className="payload-raw-btn inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Code2 className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>Raw JSON</span>
            {showRaw ? (
              <ChevronUp className="w-3 h-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>

        {showRaw && (
          <pre className="payload-raw-pre tabular-nums">{rawJsonFormatted}</pre>
        )}
      </div>
    );
  }

  return (
    <div className="payload-preview-card">
      <div className="payload-preview-bottom">
        <span className="payload-account-pill">Private Record</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowRaw((v) => !v);
          }}
          aria-expanded={showRaw}
          className="payload-raw-btn inline-flex items-center gap-1 whitespace-nowrap"
        >
          <Code2 className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Raw JSON</span>
        </button>
      </div>
      {showRaw && <pre className="payload-raw-pre tabular-nums">{rawJsonFormatted}</pre>}
    </div>
  );
}
