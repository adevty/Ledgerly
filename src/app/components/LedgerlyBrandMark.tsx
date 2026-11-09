import React from "react";

export interface LedgerlyBrandMarkProps {
  size?: number;
  className?: string;
}

export function LedgerlyBrandMark({
  size = 26,
  className = "",
}: LedgerlyBrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="ledgerly-mark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF7E47" />
          <stop offset="100%" stopColor="#E5561A" />
        </linearGradient>
      </defs>
      {/* Outer rounded squircle with brand gradient */}
      <rect width="28" height="28" rx="7.5" fill="url(#ledgerly-mark-gradient)" />
      {/* Specular hairline inner border */}
      <rect
        x="0.75"
        y="0.75"
        width="26.5"
        height="26.5"
        rx="6.75"
        stroke="rgba(255, 255, 255, 0.28)"
        strokeWidth="1"
        fill="none"
      />
      {/* Outer Escrow Ledger Path (Balanced Leg 1) */}
      <path
        d="M8.5 7.5V19.5C8.5 20.05 8.95 20.5 9.5 20.5H19.5"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner Dual-Entry Fold Path (Balanced Leg 2) */}
      <path
        d="M13.5 11.5V16C13.5 16.28 13.72 16.5 14 16.5H18.5"
        stroke="rgba(255, 255, 255, 0.72)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Luminous cryptographic settlement node */}
      <circle cx="19.5" cy="20.5" r="1.25" fill="#FFFFFF" />
    </svg>
  );
}

export default LedgerlyBrandMark;
