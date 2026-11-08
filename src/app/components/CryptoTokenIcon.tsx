import React, { useId } from "react";

export type SupportedTokenSymbol =
  | "NEAR"
  | "SOL"
  | "ETH"
  | "BASE"
  | "ARB"
  | "USDC"
  | "BTC"
  | string;

export interface CryptoTokenIconProps {
  symbol: SupportedTokenSymbol;
  chain?: string;
  size?: number;
  className?: string;
}

function ArbitrumSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="var(--token-arb-bg)" />
      <path
        d="M16 5.2L7.2 10.3V21.7L16 26.8L24.8 21.7V10.3L16 5.2Z"
        fill="var(--token-arb-fill)"
        stroke="var(--token-arb-stroke)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14.85 10.1L9.95 19.65L12.05 20.85L17.05 10.95L14.85 10.1Z"
        fill="var(--token-glyph)"
      />
      <path
        d="M17.85 11.35L13.1 20.9L15.2 22.1L19.95 12.55L17.85 11.35Z"
        fill="var(--token-arb-stroke)"
      />
      <path
        d="M20.65 14.3L17.15 21.35L19.25 22.4L22.25 16.35L20.65 14.3Z"
        fill="var(--token-arb-stroke)"
      />
    </svg>
  );
}

function BaseSvg({ size, maskId }: { size: number; maskId: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <mask id={maskId}>
          <rect width="32" height="32" fill="var(--token-mask-light)" />
          <rect
            x="0"
            y="14.55"
            width="17.2"
            height="2.9"
            rx="1.2"
            fill="var(--token-mask-dark)"
          />
        </mask>
      </defs>
      <circle cx="16" cy="16" r="16" fill="var(--token-base)" />
      <circle
        cx="16.2"
        cy="16"
        r="9.4"
        fill="var(--token-glyph)"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

export function CryptoTokenIcon({
  symbol,
  chain,
  size = 22,
  className = "",
}: CryptoTokenIconProps) {
  const uid = useId().replace(/:/g, "");
  const solGradId = `sol_grad_${uid}`;
  const baseMaskId = `base_mask_${uid}`;

  const upperSymbol = symbol.toUpperCase();
  const lowerChain = (chain ?? "").toLowerCase();

  const effectiveKey =
    upperSymbol === "BASE" || (upperSymbol === "ETH" && lowerChain === "base")
      ? "BASE"
      : upperSymbol === "ARB"
        ? "ARB"
        : upperSymbol;

  const showArbSubBadge = upperSymbol === "USDC" && lowerChain === "arb";
  const showEthSubBadge = upperSymbol === "ETH" && lowerChain === "base";

  const badgeSize = Math.max(11, Math.round(size * 0.48));

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`.trim()}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {effectiveKey === "NEAR" && (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="var(--token-near-bg)" />
          <path
            d="M21.24 9.54L17.46 15.16C17.24 15.49 17.68 15.88 17.98 15.61L21.68 12.39C21.82 12.26 22.05 12.36 22.05 12.56V22.34C22.05 22.56 21.77 22.65 21.64 22.48L11.77 10.03C11.45 9.63 10.97 9.4 10.45 9.4H10.09C9.16 9.4 8.4 10.16 8.4 11.09V20.91C8.4 21.84 9.16 22.6 10.09 22.6C10.68 22.6 11.23 22.29 11.54 21.79L15.32 16.17C15.54 15.84 15.1 15.45 14.8 15.72L11.1 18.94C10.96 19.07 10.73 18.97 10.73 18.77V9.98C10.73 9.76 11.01 9.67 11.14 9.84L21.01 22.29C21.33 22.69 21.81 22.92 22.33 22.92H22.69C23.62 22.92 24.38 22.16 24.38 21.23V11.09C24.38 10.16 23.62 9.4 22.69 9.4C22.1 9.4 21.55 9.71 21.24 10.21V9.54Z"
            fill="var(--token-glyph)"
          />
        </svg>
      )}

      {effectiveKey === "SOL" && (
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none">
          <circle cx="16" cy="16" r="16" fill="var(--token-near-bg)" />
          <path
            d="M9.9 20.6c.2-.2.5-.3.8-.3h12.8c.5 0 .8.6.4 1l-2.1 2.1c-.2.2-.5.3-.8.3H8.2c-.5 0-.8-.6-.4-1l2.1-2.1zm12.2-5.7c-.2-.2-.5-.3-.8-.3H8.5c-.5 0-.8.6-.4 1l2.1 2.1c.2.2.5.3.8.3h12.8c.5 0 .8-.6.4-1l-2.1-2.1zm-10.1-4c.2-.2.5-.3.8-.3h12.8c.5 0 .8-.6.4-1l-2.1-2.1c-.2-.2-.5-.3-.8-.3H8.2c-.5 0-.8.6-.4 1l2.1 2.1z"
            fill={`url(#${solGradId})`}
          />
          <defs>
            <linearGradient
              id={solGradId}
              x1="8"
              y1="23"
              x2="24"
              y2="9"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="var(--token-sol-start)" />
              <stop offset="1" stopColor="var(--token-sol-end)" />
            </linearGradient>
          </defs>
        </svg>
      )}

      {effectiveKey === "ETH" && (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="var(--token-eth)" />
          <path
            d="M16.498 6V13.437L22.795 16.25L16.498 6Z"
            fill="var(--token-glyph)"
            fillOpacity="0.65"
          />
          <path d="M16.498 6L10.2 16.25L16.498 13.437V6Z" fill="var(--token-glyph)" />
          <path
            d="M16.498 21.088V25.996L22.8 17.412L16.498 21.088Z"
            fill="var(--token-glyph)"
            fillOpacity="0.65"
          />
          <path
            d="M16.498 25.996V21.087L10.2 17.412L16.498 25.996Z"
            fill="var(--token-glyph)"
          />
          <path
            d="M16.498 19.92L22.795 16.25L16.498 13.439V19.92Z"
            fill="var(--token-glyph)"
            fillOpacity="0.35"
          />
          <path
            d="M10.2 16.25L16.498 19.92V13.439L10.2 16.25Z"
            fill="var(--token-glyph)"
            fillOpacity="0.8"
          />
        </svg>
      )}

      {effectiveKey === "BASE" && <BaseSvg size={size} maskId={baseMaskId} />}

      {effectiveKey === "ARB" && <ArbitrumSvg size={size} />}

      {effectiveKey === "USDC" && (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="var(--token-usdc)" />
          <path
            d="M19.55 18.23C19.55 16.37 18.43 15.73 16.19 15.41C14.59 15.19 14.27 14.76 14.27 13.99C14.27 13.22 14.86 12.71 16.03 12.71C17.09 12.71 17.68 13.09 17.95 13.99C18.02 14.21 18.21 14.35 18.43 14.35H19.52C19.79 14.35 19.99 14.11 19.93 13.84C19.64 12.42 18.68 11.43 17.06 11.16V9.79C17.06 9.52 16.85 9.31 16.58 9.31H15.55C15.28 9.31 15.07 9.52 15.07 9.79V11.13C13.34 11.39 12.22 12.48 12.22 14.11C12.22 15.87 13.31 16.56 15.58 16.85C17.09 17.11 17.51 17.52 17.51 18.39C17.51 19.26 16.74 19.86 15.65 19.86C14.21 19.86 13.69 19.25 13.48 18.32C13.43 18.09 13.24 17.93 13 17.93H11.88C11.61 17.93 11.41 18.17 11.46 18.44C11.75 20.03 12.74 21.02 15.07 21.31V22.66C15.07 22.93 15.28 23.14 15.55 23.14H16.58C16.85 23.14 17.06 22.93 17.06 22.66V21.29C18.82 20.99 19.55 19.82 19.55 18.23Z"
            fill="var(--token-glyph)"
          />
          <path
            d="M11.66 24.49C7.54 23.01 5.38 18.45 6.86 14.32C7.68 12.03 9.48 10.22 11.77 9.4C12.02 9.3 12.17 9.04 12.12 8.77L11.88 7.8C11.81 7.51 11.5 7.36 11.22 7.46C6.18 9.29 3.59 14.87 5.42 19.91C6.51 22.93 8.89 25.31 11.91 26.4C12.19 26.5 12.5 26.35 12.57 26.06L12.81 25.09C12.86 24.82 12.71 24.55 12.46 24.46L11.66 24.49Z"
            fill="var(--token-glyph)"
          />
          <path
            d="M20.78 7.46C20.5 7.36 20.19 7.51 20.12 7.8L19.88 8.77C19.83 9.04 19.98 9.31 20.23 9.4C24.35 10.88 26.51 15.44 25.03 19.57C24.21 21.86 22.41 23.67 20.12 24.49C19.87 24.59 19.72 24.85 19.77 25.12L20.01 26.09C20.08 26.38 20.39 26.53 20.67 26.43C25.71 24.6 28.3 19.02 26.47 13.98C25.38 10.96 23 8.58 19.98 7.49L20.78 7.46Z"
            fill="var(--token-glyph)"
          />
        </svg>
      )}

      {effectiveKey === "BTC" && (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="var(--token-btc)" />
          <path
            d="M22.25 14.12C22.55 12.11 21.02 11.03 18.93 10.31L19.61 7.58L17.95 7.17L17.29 9.82C16.85 9.71 16.4 9.61 15.96 9.51L16.63 6.84L14.97 6.43L14.29 9.16C13.93 9.08 13.58 9 13.24 8.91L10.95 8.34L10.51 10.11C10.51 10.11 11.74 10.39 11.71 10.41C12.38 10.58 12.5 11.02 12.48 11.37L11.71 14.47C11.76 14.48 11.82 14.5 11.89 14.53L11.71 14.49L10.63 18.82C10.55 19.02 10.34 19.32 9.88 19.21C9.9 19.24 8.67 18.91 8.67 18.91L7.84 20.81L10 21.35C10.4 21.45 10.79 21.56 11.18 21.66L10.49 24.43L12.15 24.84L12.83 22.11C13.28 22.23 13.72 22.34 14.15 22.44L13.47 25.16L15.13 25.57L15.82 22.81C18.65 23.35 20.78 23.13 21.68 20.56C22.4 18.5 21.64 17.31 20.15 16.53C21.24 16.28 22.06 15.56 22.25 14.12ZM18.49 19.39C17.97 21.46 14.46 20.34 13.32 20.06L14.24 16.37C15.38 16.66 19.03 17.24 18.49 19.39ZM19.01 14.01C18.54 15.89 15.62 14.94 14.68 14.7L15.51 11.36C16.45 11.6 19.5 12.05 19.01 14.01Z"
            fill="var(--token-glyph)"
          />
        </svg>
      )}

      {showArbSubBadge && (
        <span
          style={{
            position: "absolute",
            right: -3,
            bottom: -2,
            width: badgeSize,
            height: badgeSize,
            borderRadius: "50%",
            border: "1.5px solid var(--surface-1)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            backgroundColor: "var(--token-arb-bg)",
          }}
        >
          <ArbitrumSvg size={badgeSize} />
        </span>
      )}

      {showEthSubBadge && (
        <span
          style={{
            position: "absolute",
            right: -3,
            bottom: -2,
            width: badgeSize,
            height: badgeSize,
            borderRadius: "50%",
            border: "1.5px solid var(--surface-1)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--token-eth)",
          }}
        >
          <svg width={badgeSize - 2} height={badgeSize - 2} viewBox="0 0 32 32" fill="none">
            <path d="M16 5L10 16L16 19.8L22 16L16 5Z" fill="var(--token-glyph)" />
            <path
              d="M16 27L22 17.5L16 21.2L10 17.5L16 27Z"
              fill="var(--token-glyph)"
              fillOpacity="0.85"
            />
          </svg>
        </span>
      )}
    </span>
  );
}
