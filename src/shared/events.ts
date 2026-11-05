/**
 * Domain event base. Events are collected inside aggregates and pulled by the
 * application layer, which persists them to the transactional outbox in the
 * same DB transaction as the aggregate change (Tahap 4 §8).
 *
 * Payloads must never contain PII or decrypted business data.
 */
export interface DomainEvent<T extends string = string, P = unknown> {
  readonly type: T;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: P;
}

/** Base class giving aggregates an event buffer. */
export abstract class AggregateRoot<E extends DomainEvent> {
  private pending: E[] = [];
  /** Optimistic-locking version, incremented by the repository on save. */
  version = 0;

  protected raise(event: E): void {
    this.pending.push(event);
  }

  /** Returns and clears pending events. */
  pullEvents(): E[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
}
