import {
  Money,
  Rate,
  domainError,
  err,
  newEscrowId,
  ok,
  parseAccountId,
  withIdempotency,
  type AccountId,
  type ChainGateway,
  type Clock,
  type Commitment,
  type Currency,
  type DomainError,
  type EscrowId,
  type IdempotencyStore,
  type Result,
  type RemittanceId,
  type TxHash,
} from "@/shared";
import { authorize, type Actor } from "@/modules/identity/domain/rbac";
import {
  validateTravelRule,
  type ScreeningPort,
  type TravelRulePayload,
} from "@/modules/compliance/domain/compliance";
import { sealPayload } from "@/modules/privacy/domain";
import type { LedgerPort } from "@/modules/ledger/domain/ledger";
import {
  Quote,
  Remittance,
  type FxRatePort,
  type OffRampPort,
  type Recipient,
  type RemittanceRepository,
  type RemittanceStatus,
} from "../domain";

export interface RemittanceConfidentialPayload {
  readonly recipientName: string;
  readonly recipientAccountOrWallet: string;
  readonly recipientCountry: string;
  readonly sourceUsdcDecimal: string;
  readonly targetCurrency: Currency;
  readonly travelRule?: TravelRulePayload;
}

export interface CreateRemittanceQuoteInput {
  readonly idempotencyKey: string;
  readonly actor: Actor;
  readonly remittanceId: RemittanceId;
  readonly orgPublicKeyHex: string;
  readonly sourceUsdcDecimal: string;
  readonly targetCurrency: Currency;
  readonly recipientType: "NEAR_ACCOUNT" | "BANK" | "EWALLET";
  readonly recipientName: string;
  readonly recipientAccountOrWallet: string;
  readonly recipientCountry: string;
  readonly travelRule?: TravelRulePayload;
  readonly quoteLockSec?: number;
}

export interface CreateRemittanceQuoteOutput {
  readonly remittanceId: RemittanceId;
  readonly escrowId: EscrowId;
  readonly status: RemittanceStatus;
  readonly commitment: Commitment;
  readonly sourceMinor: string;
  readonly feeMinor: string;
  readonly targetDecimal: string;
  readonly targetCurrency: Currency;
  readonly lockedUntilIso: string;
}

export class RemittanceUseCases {
  constructor(
    private readonly deps: {
      repo: RemittanceRepository;
      fx: FxRatePort;
      offRamp: OffRampPort;
      screening: ScreeningPort;
      chain: ChainGateway;
      ledger: LedgerPort;
      idempotency: IdempotencyStore;
      clock: Clock;
      offRampSettlementAccount: AccountId;
    },
  ) {}

  /**
   * 1. Authorize actor (`SEND_REMITTANCE`) and validate Travel Rule (>= 1,000 USDC).
   * 2. Fetch FX quote & lock rate.
   * 3. Seal recipient PII + Travel Rule data into an `EncryptedEnvelope` + commitment.
   * 4. Run sanctions screening; if hit -> transition aggregate to `BLOCKED`.
   */
  async createQuotedRemittance(
    input: CreateRemittanceQuoteInput,
  ): Promise<Result<CreateRemittanceQuoteOutput, DomainError>> {
    const auth = authorize(input.actor, "SEND_REMITTANCE", input.actor.orgId);
    if (!auth.ok) return auth;

    return withIdempotency(this.deps.idempotency, {
      key: input.idempotencyKey,
      actorId: input.actor.userId,
      requestPayload: {
        remittanceId: input.remittanceId,
        sourceUsdcDecimal: input.sourceUsdcDecimal,
        targetCurrency: input.targetCurrency,
        recipientType: input.recipientType,
        recipientAccountOrWallet: input.recipientAccountOrWallet,
      },
      execute: async () => {
        const source = Money.parse(input.sourceUsdcDecimal, "USDC");
        if (!source.ok) return source;

        const trCheck = validateTravelRule(source.value, input.travelRule);
        if (!trCheck.ok) return trCheck;

        let recipient: Recipient;
        if (input.recipientType === "NEAR_ACCOUNT") {
          const acc = parseAccountId(input.recipientAccountOrWallet);
          if (!acc.ok) return acc;
          recipient = {
            type: "NEAR_ACCOUNT",
            accountId: acc.value,
            country: input.recipientCountry,
          };
        } else {
          recipient = {
            type: input.recipientType,
            destinationRef: `ref_${input.remittanceId}`,
            country: input.recipientCountry,
          };
        }

        const fxQuote = await this.deps.fx.quote("USDC", input.targetCurrency, source.value);
        const rate = Rate.parse("USDC", input.targetCurrency, fxQuote.rate);
        if (!rate.ok) return rate;

        const now = this.deps.clock.now();
        const lockedUntil = new Date(now.getTime() + (input.quoteLockSec ?? 60) * 1000);
        const quote = Quote.create({
          source: source.value,
          fee: fxQuote.fee,
          rate: rate.value,
          lockedUntil,
        });
        if (!quote.ok) return quote;

        const escrowId = newEscrowId();
        const confidential: RemittanceConfidentialPayload = {
          recipientName: input.recipientName,
          recipientAccountOrWallet: input.recipientAccountOrWallet,
          recipientCountry: input.recipientCountry,
          sourceUsdcDecimal: source.value.toDecimalString(),
          targetCurrency: input.targetCurrency,
          ...(input.travelRule ? { travelRule: input.travelRule } : {}),
        };
        const sealed = sealPayload(confidential, input.orgPublicKeyHex);
        if (!sealed.ok) return sealed;

        const rmRes = Remittance.quote({
          id: input.remittanceId,
          senderId: input.actor.userId,
          escrowId,
          recipient,
          quote: quote.value,
          now,
        });
        if (!rmRes.ok) return rmRes;

        const screenRes = await this.deps.screening.screen({
          name: input.recipientName,
          country: input.recipientCountry,
          accountOrRef: input.recipientAccountOrWallet,
        });
        if (!screenRes.allowed) {
          const b = rmRes.value.block(screenRes.reasonCode, now);
          if (!b.ok) return b;
        }

        await this.deps.repo.save(rmRes.value, {
          orgId: input.actor.orgId,
          envelope: sealed.value,
          createdAt: now,
        });

        return ok({
          remittanceId: input.remittanceId,
          escrowId,
          status: rmRes.value.status,
          commitment: sealed.value.commitment,
          sourceMinor: source.value.amountMinor.toString(),
          feeMinor: fxQuote.fee.amountMinor.toString(),
          targetDecimal: quote.value.target.toDecimalString(),
          targetCurrency: quote.value.targetCurrency,
          lockedUntilIso: lockedUntil.toISOString(),
        });
      },
    });
  }

  /**
   * Process an on-chain funding deposit for a remittance and execute settlement:
   * - Wrong amount or expired quote lock -> automatic on-chain refund.
   * - NEAR_ACCOUNT recipient -> direct USDC release from escrow to recipient.
   * - BANK / EWALLET recipient -> execute off-ramp payout with idempotency key;
   *   if settled, release USDC from escrow to off-ramp settlement account;
   *   if permanent failure or attempts exhausted, refund sender on-chain.
   */
  async handleFundingAndSettle(input: {
    escrowId: EscrowId;
    txHash: TxHash;
    amountMinor: bigint;
  }): Promise<Result<{ status: RemittanceStatus; attempts: number }, DomainError>> {
    const stored = await this.deps.repo.findByEscrowId(input.escrowId);
    if (!stored) return err(domainError("NOT_FOUND", "Remittance not found for escrow"));

    const rm = stored.aggregate;
    const amount = Money.of(input.amountMinor, "USDC");
    if (!amount.ok) return amount;

    const now = this.deps.clock.now();
    const fundRes = rm.fund(input.txHash, amount.value, now);
    if (!fundRes.ok) return fundRes;

    // Mismatched amount or expired quote lock triggered REFUNDING
    if (rm.status === "REFUNDING") {
      await this.deps.chain.refund({
        escrowId: rm.escrowId,
        amountMinor: input.amountMinor,
      });
      const conf = rm.confirmRefund(now);
      if (!conf.ok) return conf;
      await this.deps.repo.save(rm);
      return ok({ status: rm.status, attempts: rm.attempts });
    }

    return this.attemptPayoutOrDirectRelease(rm);
  }

  /**
   * Retry a `PAYOUT_FAILED` remittance (called by SettlementWorker or exception queue).
   */
  async retryPayout(
    remittanceId: RemittanceId,
  ): Promise<Result<{ status: RemittanceStatus; attempts: number }, DomainError>> {
    const stored = await this.deps.repo.findById(remittanceId);
    if (!stored) return err(domainError("NOT_FOUND", "Remittance not found"));
    return this.attemptPayoutOrDirectRelease(stored.aggregate);
  }

  private async attemptPayoutOrDirectRelease(
    rm: Remittance,
  ): Promise<Result<{ status: RemittanceStatus; attempts: number }, DomainError>> {
    const now = this.deps.clock.now();
    const recipient = rm.recipient;

    // Direct NEAR account USDC settlement
    if (recipient.type === "NEAR_ACCOUNT") {
      const rel = await this.deps.chain.release({
        escrowId: rm.escrowId,
        receiver: recipient.accountId,
        amountMinor: rm.quoteVO.source.amountMinor,
      });
      const settled = rm.markSettled(rel.txHash, now);
      if (!settled.ok) return settled;

      await this.deps.ledger.postBalancedJournal({
        journalId: `remit_${rm.id}`,
        currency: "USDC",
        refType: "REMITTANCE",
        refId: rm.id,
        now,
        legs: [
          { account: "asset:escrow_usdc", debitMinor: rm.quoteVO.source.amountMinor, creditMinor: 0n },
          { account: `settlement:near:${recipient.accountId}`, debitMinor: 0n, creditMinor: rm.quoteVO.source.amountMinor },
        ],
      });

      await this.deps.repo.save(rm);
      return ok({ status: rm.status, attempts: rm.attempts });
    }

    // Off-ramp fiat payout
    const started = rm.startPayout(now);
    if (!started.ok) return started;

    const payoutRes = await this.deps.offRamp.payout({
      idempotencyKey: started.value.idempotencyKey,
      remittanceId: rm.id,
      amount: rm.quoteVO.target,
      destinationRef: recipient.destinationRef,
      country: recipient.country,
    });

    if (payoutRes.status === "SETTLED") {
      await this.deps.chain.release({
        escrowId: rm.escrowId,
        receiver: this.deps.offRampSettlementAccount,
        amountMinor: rm.quoteVO.source.amountMinor,
      });
      const s = rm.markSettled(payoutRes.payoutRef, now);
      if (!s.ok) return s;

      await this.deps.ledger.postBalancedJournal({
        journalId: `remit_${rm.id}`,
        currency: "USDC",
        refType: "REMITTANCE",
        refId: rm.id,
        now,
        legs: [
          { account: "asset:escrow_usdc", debitMinor: rm.quoteVO.source.amountMinor, creditMinor: 0n },
          { account: "settlement:offramp_partner", debitMinor: 0n, creditMinor: rm.quoteVO.source.amountMinor },
        ],
      });
    } else {
      const f = rm.markPayoutFailed(payoutRes.code, payoutRes.retryable, now);
      if (!f.ok) return f;

      if (rm.status === "REFUNDING") {
        await this.deps.chain.refund({
          escrowId: rm.escrowId,
          amountMinor: rm.quoteVO.source.amountMinor,
        });
        const conf = rm.confirmRefund(now);
        if (!conf.ok) return conf;
      }
    }

    await this.deps.repo.save(rm);
    return ok({ status: rm.status, attempts: rm.attempts });
  }
}
