/**
 * Single source of truth for Ledgerly seed dataset, demo constants, and mathematical aggregates.
 * Ensures strict consistency between landing page mockups, 3D interactive hero, and /app overview.
 *
 * Totals strictly satisfy:
 *   settledMerchantUsdc (2,040.00) + settledRemittanceUsdc (2,350.00) = totalSettledUsdc (4,390.00)
 */

import type { Currency } from "@/shared";

export interface SeedInvoice {
  readonly id: string;
  readonly orderRef: string;
  readonly amountDecimal: string;
  readonly description: string;
  readonly customerEmail: string;
  readonly status: "SETTLED" | "OPEN" | "OVERPAID" | "EXPIRED";
  readonly payer: string;
  readonly simulatedDepositDecimal?: string;
  readonly refundDecimal?: string;
  readonly commitmentShort: string;
}

export interface SeedRemittance {
  readonly id: string;
  readonly sourceUsdcDecimal: string;
  readonly targetDecimal: string;
  readonly targetCurrency: Currency;
  readonly corridor: string;
  readonly rail: "EWALLET" | "BANK";
  readonly recipientName: string;
  readonly recipientAccountOrWallet: string;
  readonly recipientCountry: string;
  readonly status: "SETTLED" | "EXPIRED" | "QUOTED";
  readonly includeTravelRule: boolean;
  readonly simulatedDeposit: boolean;
}

export const SEED_INVOICES = [
  {
    id: "pr_inv_8841",
    orderRef: "INV-2026-8841",
    amountDecimal: "1450.00",
    description: "Wholesale ceramic vessel batch — Kyoto Studio",
    customerEmail: "procurement@kyoto-living.jp",
    status: "SETTLED",
    payer: "kyoto-living.testnet",
    commitmentShort: "e738c4...ab47",
  },
  {
    id: "pr_inv_8843",
    orderRef: "INV-2026-8843",
    amountDecimal: "350.00",
    description: "Custom linen tableware set (40 pcs)",
    customerEmail: "orders@atelier-nord.no",
    status: "SETTLED",
    payer: "nordic-craft.testnet",
    commitmentShort: "3a71d0...92c4",
  },
  {
    // Overpayment auto-refund example: buyer deposited 265.00 USDC on a 240.00 USDC invoice;
    // 25.00 USDC excess was auto-refunded to buyer; 240.00 USDC settled to merchant.
    id: "pr_inv_8844",
    orderRef: "INV-2026-8844",
    amountDecimal: "240.00",
    description: "Architectural stoneware planters (6 units)",
    customerEmail: "supply@bauhaus-berlin.de",
    status: "SETTLED",
    payer: "bauhaus-design.testnet",
    simulatedDepositDecimal: "265.00",
    refundDecimal: "25.00",
    commitmentShort: "8b22e1...c519",
  },
  {
    // Open payment request ready for live interactive checkout testing
    id: "pr_inv_8842",
    orderRef: "INV-2026-8842",
    amountDecimal: "420.00",
    description: "Bespoke brass lighting fixtures (12 units)",
    customerEmail: "ap@nordic-atelier.dk",
    status: "OPEN",
    payer: "nordic-atelier.testnet",
    commitmentShort: "1f7fe8...40c8",
  },
] as const;

export const SEED_REMITTANCES = [
  {
    id: "rm_mnl_301",
    sourceUsdcDecimal: "350.00",
    targetDecimal: "22057.00",
    targetCurrency: "PHP" as const,
    corridor: "PH",
    rail: "EWALLET" as const,
    recipientName: "Rosa Santos Artisans Co.",
    recipientAccountOrWallet: "GCASH:+63-917-555-0192",
    recipientCountry: "PH",
    status: "SETTLED" as const,
    includeTravelRule: false,
    simulatedDeposit: true,
  },
  {
    id: "rm_jkt_302",
    sourceUsdcDecimal: "1200.00",
    targetDecimal: "21696000",
    targetCurrency: "IDR" as const,
    corridor: "ID",
    rail: "BANK" as const,
    recipientName: "PT Nusantara Craft Studio",
    recipientAccountOrWallet: "ID_BANK:BCA-8830192841",
    recipientCountry: "ID",
    status: "SETTLED" as const,
    includeTravelRule: true, // Mandatory >= 1,000 USDC
    simulatedDeposit: true,
  },
  {
    id: "rm_syd_303",
    sourceUsdcDecimal: "800.00",
    targetDecimal: "1164.00",
    targetCurrency: "AUD" as const,
    corridor: "AU",
    rail: "BANK" as const,
    recipientName: "Bondi Design Collective",
    recipientAccountOrWallet: "PAYID:finance@bondidesign.com.au",
    recipientCountry: "AU",
    status: "SETTLED" as const,
    includeTravelRule: false,
    simulatedDeposit: true,
  },
  {
    // Expired quote example: FX lock elapsed without merchant funding; no on-chain escrow created
    id: "rm_exp_304",
    sourceUsdcDecimal: "150.00",
    targetDecimal: "133.58",
    targetCurrency: "EUR" as const,
    corridor: "EU",
    rail: "BANK" as const,
    recipientName: "Munich Material Supply GmbH",
    recipientAccountOrWallet: "IBAN:DE89370400440532013000",
    recipientCountry: "DE",
    status: "EXPIRED",
    includeTravelRule: false,
    simulatedDeposit: false,
  },
] as const;

// Recomputed mathematical aggregates
export const SEED_SETTLED_CHECKOUT_USDC = SEED_INVOICES
  .filter((i) => i.status === "SETTLED")
  .reduce((sum, i) => sum + Number(i.amountDecimal), 0); // 1450 + 350 + 240 = 2040.00

export const SEED_SETTLED_REMITTANCE_USDC = SEED_REMITTANCES
  .filter((r) => r.status === "SETTLED")
  .reduce((sum, r) => sum + Number(r.sourceUsdcDecimal), 0); // 350 + 1200 + 800 = 2350.00

export const SEED_TOTAL_SETTLED_USDC =
  SEED_SETTLED_CHECKOUT_USDC + SEED_SETTLED_REMITTANCE_USDC; // 4,390.00

export const SEED_OPEN_ESCROW_USDC = SEED_INVOICES
  .filter((i) => i.status === "OPEN")
  .reduce((sum, i) => sum + Number(i.amountDecimal), 0); // 420.00

export const SEED_OVERPAYMENT_REFUND_USDC = "25.00";

// Pre-formatted strings for dashboard and hero copy
export const SEED_DISPLAY_VALUES = {
  settledBalanceFormatted: `${SEED_TOTAL_SETTLED_USDC.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
  checkoutVolumeFormatted: `${SEED_SETTLED_CHECKOUT_USDC.toLocaleString("en-US")} checkout`,
  remittedVolumeFormatted: `${SEED_SETTLED_REMITTANCE_USDC.toLocaleString("en-US")} remitted`,
  subtitle: `${SEED_SETTLED_CHECKOUT_USDC.toLocaleString("en-US")} checkout · ${SEED_SETTLED_REMITTANCE_USDC.toLocaleString("en-US")} remitted · Balanced books`,
  openEscrowFormatted: `${SEED_OPEN_ESCROW_USDC.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
} as const;
