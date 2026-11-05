import {
  domainError,
  err,
  ok,
  type AccountId,
  type DomainError,
  type Money,
  type Result,
} from "@/shared";

/**
 * Verified payee registry entry (solves P8: address poisoning & BEC fraud).
 */
export interface VerifiedPayee {
  readonly accountId: AccountId;
  readonly displayName: string;
  readonly country: string;
  readonly verifiedAt: Date;
}

export interface ScreeningSubject {
  readonly name: string;
  readonly country: string;
  readonly accountOrRef: string;
}

export type ScreeningDecision =
  | { allowed: true }
  | { allowed: false; reasonCode: string };

export interface ScreeningPort {
  screen(subject: ScreeningSubject): Promise<ScreeningDecision>;
}

/**
 * FATF Travel Rule data required when cross-border remittance >= 1,000 USDC
 * (FR-10, Tahap 4 §6). Sealed inside the encrypted off-chain envelope.
 */
export interface TravelRulePayload {
  readonly originatorName: string;
  readonly originatorCountry: string;
  readonly beneficiaryName: string;
  readonly beneficiaryCountry: string;
  readonly purposeOfPayment?: string;
}

/** 1,000 USDC in 6-decimal minor units. */
export const TRAVEL_RULE_THRESHOLD_USDC_MINOR = 1_000_000_000n;

export function validateTravelRule(
  sourceUsdc: Money,
  travelRule?: TravelRulePayload,
): Result<true, DomainError> {
  if (sourceUsdc.currency !== "USDC") {
    return err(domainError("CURRENCY_MISMATCH", "Travel Rule check expects USDC"));
  }
  if (sourceUsdc.amountMinor < TRAVEL_RULE_THRESHOLD_USDC_MINOR) {
    return ok(true);
  }
  if (
    !travelRule ||
    !travelRule.originatorName.trim() ||
    !travelRule.originatorCountry.trim() ||
    !travelRule.beneficiaryName.trim() ||
    !travelRule.beneficiaryCountry.trim()
  ) {
    return err(
      domainError(
        "TRAVEL_RULE_REQUIRED",
        "Remittances >= 1,000 USDC require originator and beneficiary Travel Rule information",
      ),
    );
  }
  return ok(true);
}
