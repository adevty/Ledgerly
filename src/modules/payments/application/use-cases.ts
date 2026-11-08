import {
  Money,
  domainError,
  err,
  newEscrowId,
  ok,
  withIdempotency,
  type AccountId,
  type ChainGateway,
  type Clock,
  type Commitment,
  type DomainError,
  type EscrowId,
  type IdempotencyStore,
  type OrgId,
  type PaymentRequestId,
  type Result,
  type TxHash,
} from "@/shared";
import { authorize, type Actor } from "@/modules/identity/domain/rbac";
import { sealPayload } from "@/modules/privacy/domain";
import type { LedgerPort } from "@/modules/ledger/domain/ledger";
import {
  PaymentRequest,
  type PaymentRequestRepository,
  type PaymentStatus,
} from "../domain";
import {
  validateInvoiceRef,
  validateUsdcAmount,
  validateCustomerEmail,
  MAX_INVOICE_USDC_DECIMAL,
} from "@/lib/validation";

/**
 * Confidential business payload sealed inside `EncryptedEnvelope` for a
 * merchant payment request (never exposed on-chain).
 */
export interface PaymentRequestConfidentialPayload {
  readonly orderRef: string;
  readonly description?: string;
  readonly customerEmail?: string;
  readonly amountDecimal: string;
  readonly currency: "USDC";
}

export interface CreatePaymentRequestInput {
  readonly idempotencyKey: string;
  readonly actor: Actor;
  readonly requestId: PaymentRequestId;
  readonly orgPublicKeyHex: string;
  readonly orderRef: string;
  readonly description?: string;
  readonly customerEmail?: string;
  readonly amountDecimal: string;
  readonly expiresInSec: number;
}

export interface CreatePaymentRequestOutput {
  readonly requestId: PaymentRequestId;
  readonly escrowId: EscrowId;
  readonly commitment: Commitment;
  readonly amountMinor: string;
  readonly expiresAtIso: string;
  readonly checkoutUrl: string;
}

export class PaymentUseCases {
  constructor(
    private readonly deps: {
      repo: PaymentRequestRepository;
      chain: ChainGateway;
      ledger: LedgerPort;
      idempotency: IdempotencyStore;
      clock: Clock;
      merchantNearAccounts: Map<OrgId, AccountId>;
    },
  ) {}

  /**
   * 1. Authorize actor (`CREATE_PAYMENT_REQUEST`).
   * 2. Seal confidential payload (AES-256-GCM + X25519 DEK wrap) and compute on-chain commitment.
   * 3. Register escrow + commitment on `ledgerly-escrow`.
   * 4. Persist aggregate + envelope + outbox event.
   */
  async createPaymentRequest(
    input: CreatePaymentRequestInput,
  ): Promise<Result<CreatePaymentRequestOutput, DomainError>> {
    const auth = authorize(input.actor, "CREATE_PAYMENT_REQUEST", input.actor.orgId);
    if (!auth.ok) return auth;

    return withIdempotency(this.deps.idempotency, {
      key: input.idempotencyKey,
      actorId: input.actor.userId,
      requestPayload: {
        requestId: input.requestId,
        orderRef: input.orderRef,
        amountDecimal: input.amountDecimal,
        expiresInSec: input.expiresInSec,
      },
      execute: async () => {
        const refValidation = validateInvoiceRef(input.orderRef);
        if (!refValidation.valid) {
          return err(domainError("INVALID_ORDER_REF", refValidation.error ?? "Invalid invoice reference"));
        }

        if (this.deps.repo.hasOrderRef) {
          const exists = await this.deps.repo.hasOrderRef(input.actor.orgId, refValidation.value!);
          if (exists) {
            return err(
              domainError(
                "DUPLICATE_ORDER_REF",
                `Invoice reference '${refValidation.value}' already exists for this merchant`,
              ),
            );
          }
        }

        const amtValidation = validateUsdcAmount(input.amountDecimal, {
          maxAmountDecimal: MAX_INVOICE_USDC_DECIMAL,
          fieldName: "Invoice amount",
        });
        if (!amtValidation.valid) {
          return err(domainError("INVALID_AMOUNT", amtValidation.error ?? "Invalid amount"));
        }

        if (input.customerEmail) {
          const emailValidation = validateCustomerEmail(input.customerEmail, false);
          if (!emailValidation.valid) {
            return err(domainError("INVALID_EMAIL", emailValidation.error ?? "Invalid customer email"));
          }
        }

        const amount = Money.of(amtValidation.value!.amountMinor, "USDC");
        if (!amount.ok) return amount;

        const now = this.deps.clock.now();
        const expiresAt = new Date(now.getTime() + input.expiresInSec * 1000);
        const escrowId = newEscrowId();

        const payload: PaymentRequestConfidentialPayload = {
          orderRef: refValidation.value!,
          ...(input.description ? { description: input.description } : {}),
          ...(input.customerEmail ? { customerEmail: input.customerEmail.trim() } : {}),
          amountDecimal: amtValidation.value!.decimal,
          currency: "USDC",
        };

        const sealed = sealPayload(payload, input.orgPublicKeyHex);
        if (!sealed.ok) return sealed;

        const prRes = PaymentRequest.create({
          id: input.requestId,
          merchantId: input.actor.orgId,
          escrowId,
          amount: amount.value,
          expiresAt,
          now,
        });
        if (!prRes.ok) return prRes;

        // Default safety timeout: request expiry + 24h (OQ-3)
        const refundAfterNs = BigInt(expiresAt.getTime() + 24 * 3600 * 1000) * 1_000_000n;
        await this.deps.chain.registerEscrow({
          escrowId,
          kind: "Payment",
          commitment: sealed.value.commitment,
          refundAfterNs,
        });

        await this.deps.repo.save(prRes.value, sealed.value, now);
        if (this.deps.repo.recordOrderRef) {
          await this.deps.repo.recordOrderRef(input.actor.orgId, refValidation.value!, input.requestId);
        }

        return ok({
          requestId: input.requestId,
          escrowId,
          commitment: sealed.value.commitment,
          amountMinor: amount.value.amountMinor.toString(),
          expiresAtIso: expiresAt.toISOString(),
          checkoutUrl: `/checkout/${input.requestId}`,
        });
      },
    });
  }

  /**
   * Handle an on-chain deposit (`escrow_funded`) detected by the indexer:
   * - Exact payment -> release funds to merchant & post balanced double-entry journal.
   * - Overpayment -> auto-refund excess to buyer, then release exact amount to merchant.
   * - Underpayment -> keep in `PARTIALLY_PAID` awaiting remaining balance or expiry.
   */
  async handleOnchainDeposit(input: {
    escrowId: EscrowId;
    txHash: TxHash;
    payer: AccountId;
    amountMinor: bigint;
  }): Promise<Result<{ status: PaymentStatus }, DomainError>> {
    const stored = await this.deps.repo.findByEscrowId(input.escrowId);
    if (!stored) {
      return err(domainError("NOT_FOUND", `No PaymentRequest for escrow ${input.escrowId}`));
    }
    const pr = stored.aggregate;
    const amount = Money.of(input.amountMinor, "USDC");
    if (!amount.ok) return amount;

    const now = this.deps.clock.now();
    const recRes = pr.recordPayment({
      txHash: input.txHash,
      payer: input.payer,
      amount: amount.value,
      detectedAt: now,
    });
    if (!recRes.ok) {
      if (recRes.error.code === "DUPLICATE_PAYMENT") {
        return ok({ status: pr.status }); // Idempotent no-op
      }
      return recRes;
    }

    // Record deposit into escrow holding account in internal ledger
    await this.deps.ledger.postBalancedJournal({
      journalId: `dep_${input.txHash}`,
      currency: "USDC",
      refType: "PAYMENT_REQUEST",
      refId: pr.id,
      now,
      legs: [
        { account: "asset:escrow_usdc", debitMinor: input.amountMinor, creditMinor: 0n },
        { account: `liability:merchant_pending:${pr.snapshot().merchantId}`, debitMinor: 0n, creditMinor: input.amountMinor },
      ],
    });

    // Auto-refund excess on overpayment (Journey 1)
    if (pr.status === "OVERPAID") {
      const excess = pr.excess();
      await this.deps.chain.refund({
        escrowId: pr.escrowId,
        amountMinor: excess.amountMinor,
      });
      const conf = pr.confirmRefund(excess, now);
      if (!conf.ok) return conf;

      await this.deps.ledger.postBalancedJournal({
        journalId: `overpay_ref_${input.txHash}`,
        currency: "USDC",
        refType: "PAYMENT_REQUEST",
        refId: pr.id,
        now,
        legs: [
          { account: `liability:merchant_pending:${pr.snapshot().merchantId}`, debitMinor: excess.amountMinor, creditMinor: 0n },
          { account: "asset:escrow_usdc", debitMinor: 0n, creditMinor: excess.amountMinor },
        ],
      });
    }

    // Settle to merchant when PAID
    if (pr.status === "PAID") {
      const merchantAccount =
        this.deps.merchantNearAccounts.get(pr.snapshot().merchantId) ??
        ("merchant.ledgerly.testnet" as AccountId);

      await this.deps.chain.release({
        escrowId: pr.escrowId,
        receiver: merchantAccount,
        amountMinor: pr.amount.amountMinor,
      });
      const settled = pr.markSettled(pr.amount, now);
      if (!settled.ok) return settled;

      await this.deps.ledger.postBalancedJournal({
        journalId: `settle_${pr.id}`,
        currency: "USDC",
        refType: "PAYMENT_REQUEST",
        refId: pr.id,
        now,
        legs: [
          { account: `liability:merchant_pending:${pr.snapshot().merchantId}`, debitMinor: pr.amount.amountMinor, creditMinor: 0n },
          { account: "asset:escrow_usdc", debitMinor: 0n, creditMinor: pr.amount.amountMinor },
        ],
      });
    }

    await this.deps.repo.save(pr);
    return ok({ status: pr.status });
  }

  /**
   * Merchant-initiated refund.
   */
  async refundPaymentRequest(input: {
    idempotencyKey: string;
    actor: Actor;
    requestId: PaymentRequestId;
    amountDecimal: string;
    reason: string;
  }): Promise<Result<{ status: PaymentStatus }, DomainError>> {
    const stored = await this.deps.repo.findById(input.requestId);
    if (!stored) return err(domainError("NOT_FOUND", "PaymentRequest not found"));

    const auth = authorize(input.actor, "REFUND_PAYMENT", stored.aggregate.snapshot().merchantId);
    if (!auth.ok) return auth;

    return withIdempotency(this.deps.idempotency, {
      key: input.idempotencyKey,
      actorId: input.actor.userId,
      requestPayload: {
        requestId: input.requestId,
        amountDecimal: input.amountDecimal,
        reason: input.reason,
      },
      execute: async () => {
        const amount = Money.parse(input.amountDecimal, "USDC");
        if (!amount.ok) return amount;

        const now = this.deps.clock.now();
        const pr = stored.aggregate;
        const wasSettled = pr.status === "SETTLED";
        const reqRes = pr.requestRefund(amount.value, input.reason, now);
        if (!reqRes.ok) return reqRes;

        if (!wasSettled) {
          await this.deps.chain.refund({
            escrowId: pr.escrowId,
            amountMinor: amount.value.amountMinor,
          });
        }
        const conf = pr.confirmRefund(amount.value, now);
        if (!conf.ok) return conf;

        await this.deps.repo.save(pr);
        return ok({ status: pr.status });
      },
    });
  }
}
