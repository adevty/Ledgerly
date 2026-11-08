"use client";

import React, { useState } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";

export interface HashBadgeProps {
  value: string;
  label?: string;
  startChars?: number;
  endChars?: number;
  truncate?: boolean;
  href?: string;
  linkLabel?: string;
  className?: string;
  copyable?: boolean;
}

export function formatTruncatedHash(
  value: string,
  startChars = 8,
  endChars = 6,
  truncate = true,
): string {
  if (!value || value === "—") return "—";
  if (!truncate) return value;
  if (value.includes("…") || value.includes("...")) return value;
  if ((value.endsWith(".testnet") || value.endsWith(".near")) && value.length <= 36) {
    return value;
  }
  if (value.length <= startChars + endChars + 3) {
    return value;
  }
  if (endChars <= 0) {
    return `${value.slice(0, startChars)}…`;
  }
  return `${value.slice(0, startChars)}…${value.slice(-endChars)}`;
}

export function HashBadge({
  value,
  label,
  startChars = 8,
  endChars = 6,
  truncate = true,
  href,
  linkLabel,
  className = "",
  copyable = true,
}: HashBadgeProps) {
  const [copied, setCopied] = useState(false);

  const cleanValue = value?.trim() || "—";
  const isCopyable = copyable && cleanValue !== "—";
  const displayValue = formatTruncatedHash(cleanValue, startChars, endChars, truncate);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isCopyable) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(cleanValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <span
      className={`hash-badge-pill inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums ${className}`.trim()}
      title={cleanValue}
    >
      {label && <span className="hash-badge-label">{label}</span>}

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="hash-badge-link inline-flex items-center gap-1 whitespace-nowrap"
        >
          <span>{linkLabel ?? displayValue}</span>
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </a>
      ) : (
        <span className="hash-badge-value">{displayValue}</span>
      )}

      {isCopyable && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? `Copied ${label ?? "value"}` : `Copy ${label ?? cleanValue}`}
          title={copied ? "Copied to clipboard" : "Copy full value"}
          className="hash-badge-copy-btn"
        >
          {copied ? (
            <Check
              className="w-3 h-3 shrink-0"
              style={{ color: "var(--status-settled-fg)" }}
              aria-hidden="true"
            />
          ) : (
            <Copy className="w-3 h-3 shrink-0" aria-hidden="true" />
          )}
        </button>
      )}
    </span>
  );
}
