/**
 * Ledgerly Capability Registry & Honesty Layer
 *
 * Implements centralized, typed tracking of every system capability and its
 * truthfulness status ('real' | 'dry-run' | 'simulated' | 'mock').
 * Enforces AGENTS.md honesty rule: every mock/simulated feature must be
 * explicitly badged and derived from this registry.
 */

export type CapabilityStatus = "real" | "dry-run" | "simulated" | "mock";

export type CapabilityId =
  | "escrow_register"
  | "escrow_deposit"
  | "escrow_release"
  | "escrow_refund"
  | "escrow_anchor"
  | "claim_refund"
  | "one_click_quote"
  | "deposit_address"
  | "solver_settlement"
  | "off_ramp_payout"
  | "sanctions_screening"
  | "travel_rule"
  | "fx_rates";

export type NetworkMode = "NEAR_TESTNET_RPC" | "LOCAL_SANDBOX_SIMULATION";

export interface Capability {
  readonly id: CapabilityId;
  readonly label: string;
  readonly status: CapabilityStatus;
  readonly note: string;
}

export const CAPABILITIES: Record<CapabilityId, Capability> = {
  escrow_register: {
    id: "escrow_register",
    label: "Escrow Registration",
    status: "real",
    note: "NEAR Testnet contract call registers immutable escrow commitment",
  },
  escrow_deposit: {
    id: "escrow_deposit",
    label: "USDC Deposit",
    status: "real",
    note: "Accepts NEP-141 USDC deposits into escrow",
  },
  escrow_release: {
    id: "escrow_release",
    label: "Escrow Settlement Release",
    status: "real",
    note: "Releases escrowed funds to merchant or off-ramp settlement pool",
  },
  escrow_refund: {
    id: "escrow_refund",
    label: "Escrow Auto-Refund",
    status: "real",
    note: "Auto-refund of overpayments or expired orders",
  },
  escrow_anchor: {
    id: "escrow_anchor",
    label: "Audit Root Anchoring",
    status: "real",
    note: "Anchors tamper-evident SHA-256 audit roots to NEAR smart contract",
  },
  claim_refund: {
    id: "claim_refund",
    label: "Payer Direct Refund Claim",
    status: "real",
    note: "Direct on-chain refund claim when refund timelock passes",
  },
  one_click_quote: {
    id: "one_click_quote",
    label: "1Click Solver Dry Quote",
    status: "real",
    note: "Live quote from NEAR Intents 1Click solver network API",
  },
  deposit_address: {
    id: "deposit_address",
    label: "Cross-Chain Deposit Address",
    status: "dry-run",
    note: "Dry-run quote by default; live deposit addresses disabled in demo",
  },
  solver_settlement: {
    id: "solver_settlement",
    label: "Multi-Chain Solver Swap",
    status: "simulated",
    note: "Sandbox solver simulation (cross-chain swap executed via mock adapter)",
  },
  off_ramp_payout: {
    id: "off_ramp_payout",
    label: "Fiat Off-Ramp Payout",
    status: "mock",
    note: "Mock fiat banking rails ('Instant Partner Settle')",
  },
  sanctions_screening: {
    id: "sanctions_screening",
    label: "OFAC Sanctions Screening",
    status: "mock",
    note: "Mock screening against in-memory demo blocklist",
  },
  travel_rule: {
    id: "travel_rule",
    label: "FATF Travel Rule Compliance",
    status: "mock",
    note: "Data sealed off-chain; inter-VASP protocol not implemented",
  },
  fx_rates: {
    id: "fx_rates",
    label: "Forex Exchange Rates",
    status: "real",
    note: "Live real-time forex exchange rates with static fallback",
  },
};

/**
 * Returns the effective capability given the active network mode.
 * When in LOCAL_SANDBOX_SIMULATION, on-chain escrow operations are marked 'simulated'.
 */
export function getCapability(id: CapabilityId, networkMode?: NetworkMode): Capability {
  const base = CAPABILITIES[id];
  if (!base) {
    throw new Error(`Unknown capability: ${id}`);
  }
  if (networkMode === "LOCAL_SANDBOX_SIMULATION") {
    if (
      id === "escrow_register" ||
      id === "escrow_deposit" ||
      id === "escrow_release" ||
      id === "escrow_refund" ||
      id === "escrow_anchor" ||
      id === "claim_refund"
    ) {
      return {
        ...base,
        status: "simulated",
        note: `${base.note} (Simulated in local sandbox)`,
      };
    }
  }
  return base;
}

export interface CapabilityBadgeDescriptor {
  readonly label: string;
  readonly tone: string;
  readonly tooltip: string;
  readonly status: CapabilityStatus;
}

export function getCapabilityBadge(
  id: CapabilityId,
  networkMode?: NetworkMode,
): CapabilityBadgeDescriptor {
  const cap = getCapability(id, networkMode);
  switch (cap.status) {
    case "real":
      return {
        label: "LIVE",
        tone: "status-pill status-pill-emerald",
        tooltip: `${cap.label}: ${cap.note}`,
        status: cap.status,
      };
    case "simulated":
      return {
        label: "SIMULATED",
        tone: "status-pill status-pill-amber",
        tooltip: `${cap.label}: ${cap.note}`,
        status: cap.status,
      };
    case "mock":
      return {
        label: "MOCK",
        tone: "status-pill status-pill-amber",
        tooltip: `${cap.label}: ${cap.note}`,
        status: cap.status,
      };
    case "dry-run":
      return {
        label: "DRY-RUN",
        tone: "status-pill status-pill-blue",
        tooltip: `${cap.label}: ${cap.note}`,
        status: cap.status,
      };
  }
}
