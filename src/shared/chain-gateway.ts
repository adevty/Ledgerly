import type { AccountId, EscrowId, TxHash } from "./ids";

/**
 * Port for interacting with the `ledgerly-escrow` NEAR smart contract.
 * Implemented by a mock/in-memory gateway in tests & local demo, and by a
 * `near-api-js` adapter against NEAR testnet.
 */
export type OnchainEscrowKind = "Payment" | "Remittance";
export type OnchainEscrowStatus = "Open" | "Held" | "Closed";

export interface OnchainEscrowView {
  readonly kind: OnchainEscrowKind;
  readonly depositor: AccountId | null;
  readonly heldMinor: bigint;
  readonly commitment: string;
  readonly status: OnchainEscrowStatus;
  readonly refundAfterNs: bigint;
}

export type OnchainEvent =
  | {
      readonly type: "OnchainDepositDetected";
      readonly txHash: TxHash;
      readonly logIndex: number;
      readonly blockHeight: bigint;
      readonly escrowId: EscrowId;
      readonly depositor: AccountId;
      readonly amountMinor: bigint;
    }
  | {
      readonly type: "OnchainRefundConfirmed";
      readonly txHash: TxHash;
      readonly logIndex: number;
      readonly blockHeight: bigint;
      readonly escrowId: EscrowId;
      readonly amountMinor: bigint;
    }
  | {
      readonly type: "OnchainReleaseConfirmed";
      readonly txHash: TxHash;
      readonly logIndex: number;
      readonly blockHeight: bigint;
      readonly escrowId: EscrowId;
      readonly amountMinor: bigint;
    };

export interface ChainGateway {
  registerEscrow(input: {
    escrowId: EscrowId;
    kind: OnchainEscrowKind;
    commitment: string;
    refundAfterNs: bigint;
  }): Promise<{ txHash: TxHash }>;

  release(input: {
    escrowId: EscrowId;
    receiver: AccountId;
    amountMinor: bigint;
  }): Promise<{ txHash: TxHash }>;

  refund(input: {
    escrowId: EscrowId;
    amountMinor: bigint;
  }): Promise<{ txHash: TxHash }>;

  anchorAuditRoot(logRootHex: string): Promise<{ txHash: TxHash }>;

  getEscrow(escrowId: EscrowId): Promise<OnchainEscrowView | null>;

  pollEvents(fromBlockHeightExclusive: bigint): Promise<{
    readonly events: readonly OnchainEvent[];
    readonly latestBlockHeight: bigint;
  }>;
}
