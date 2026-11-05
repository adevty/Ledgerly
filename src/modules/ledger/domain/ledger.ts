import { domainError, err, ok, type Currency, type DomainError, type Money, type Result } from "@/shared";

export interface LedgerEntryRecord {
  readonly id: string;
  readonly journalId: string;
  readonly account: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
  readonly currency: Currency;
  readonly refType: "PAYMENT_REQUEST" | "REMITTANCE";
  readonly refId: string;
  readonly createdAt: Date;
}

export interface LedgerLeg {
  readonly account: string;
  readonly debitMinor: bigint;
  readonly creditMinor: bigint;
}

export interface LedgerPort {
  postBalancedJournal(input: {
    journalId: string;
    currency: Currency;
    refType: "PAYMENT_REQUEST" | "REMITTANCE";
    refId: string;
    legs: readonly LedgerLeg[];
    now: Date;
  }): Promise<Result<readonly LedgerEntryRecord[], DomainError>>;

  listEntries(filter?: {
    refType?: "PAYMENT_REQUEST" | "REMITTANCE";
    refId?: string;
  }): Promise<readonly LedgerEntryRecord[]>;
}

/**
 * Validate double-entry accounting invariant: Σ debits == Σ credits > 0.
 */
export function validateBalancedLegs(legs: readonly LedgerLeg[]): Result<true, DomainError> {
  if (legs.length < 2) {
    return err(domainError("INVALID_AMOUNT", "Journal requires at least 2 legs"));
  }
  let totalDebit = 0n;
  let totalCredit = 0n;
  for (const leg of legs) {
    if (leg.debitMinor < 0n || leg.creditMinor < 0n) {
      return err(domainError("INVALID_AMOUNT", "Ledger leg amounts cannot be negative"));
    }
    if ((leg.debitMinor === 0n && leg.creditMinor === 0n) || (leg.debitMinor > 0n && leg.creditMinor > 0n)) {
      return err(domainError("INVALID_AMOUNT", "Each leg must have either debit or credit > 0"));
    }
    totalDebit += leg.debitMinor;
    totalCredit += leg.creditMinor;
  }
  if (totalDebit !== totalCredit || totalDebit === 0n) {
    return err(
      domainError("INVALID_AMOUNT", `Unbalanced journal: debit=${totalDebit} credit=${totalCredit}`),
    );
  }
  return ok(true);
}

/**
 * Format ledger entries into a clean reconciliation CSV for ERP import
 * (Xero / QuickBooks / Jurnal compatible — FR-11).
 */
export function exportLedgerToCsv(entries: readonly LedgerEntryRecord[]): string {
  const header = "id,journal_id,created_at,account,debit_minor,credit_minor,currency,ref_type,ref_id";
  const rows = entries.map((e) =>
    [
      csvEscape(e.id),
      csvEscape(e.journalId),
      csvEscape(e.createdAt.toISOString()),
      csvEscape(e.account),
      e.debitMinor.toString(),
      e.creditMinor.toString(),
      e.currency,
      e.refType,
      csvEscape(e.refId),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
