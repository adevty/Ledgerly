/**
 * src/workers/runner.ts
 *
 * Manages background worker standing intervals with HMR protection,
 * heartbeat monitoring, graceful SIGTERM shutdown, and idempotent resumption.
 */

import type { LedgerlyRuntime } from "@/app/api/_runtime";

export interface WorkerHeartbeats {
  indexer: number;
  settlement: number;
  expiry: number;
  reconciliation: number;
}

const globalForWorkers = globalThis as unknown as {
  __ledgerlyWorkersStarted?: boolean;
  __ledgerlyWorkerTimers?: NodeJS.Timeout[];
  __ledgerlyWorkerHeartbeats?: WorkerHeartbeats;
  __ledgerlySigtermRegistered?: boolean;
};

const DEFAULT_HEARTBEATS: WorkerHeartbeats = {
  indexer: 0,
  settlement: 0,
  expiry: 0,
  reconciliation: 0,
};

export function getWorkerHeartbeats(): WorkerHeartbeats {
  if (!globalForWorkers.__ledgerlyWorkerHeartbeats) {
    globalForWorkers.__ledgerlyWorkerHeartbeats = { ...DEFAULT_HEARTBEATS };
  }
  return { ...globalForWorkers.__ledgerlyWorkerHeartbeats };
}

export function getWorkerHeartbeatAgesMs(): Record<keyof WorkerHeartbeats, number> {
  const current = getWorkerHeartbeats();
  const now = Date.now();
  return {
    indexer: current.indexer ? now - current.indexer : -1,
    settlement: current.settlement ? now - current.settlement : -1,
    expiry: current.expiry ? now - current.expiry : -1,
    reconciliation: current.reconciliation ? now - current.reconciliation : -1,
  };
}

export function startBackgroundWorkers(rt: LedgerlyRuntime): void {
  // Guard against double-start under Next.js development HMR or concurrent module evaluation
  if (globalForWorkers.__ledgerlyWorkersStarted) {
    return;
  }

  // Do not run background intervals during vitest / unit test runs unless explicitly invoked
  const isTest = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
  if (isTest && !process.env.FORCE_WORKER_INTERVALS) {
    return;
  }

  globalForWorkers.__ledgerlyWorkersStarted = true;
  globalForWorkers.__ledgerlyWorkerHeartbeats = {
    indexer: Date.now(),
    settlement: Date.now(),
    expiry: Date.now(),
    reconciliation: Date.now(),
  };

  const timers: NodeJS.Timeout[] = [];

  // 1. Chain Indexer: poll for contract events (~3s interval)
  const indexerTimer = setInterval(async () => {
    try {
      await rt.indexer.runOnce();
      if (globalForWorkers.__ledgerlyWorkerHeartbeats) {
        globalForWorkers.__ledgerlyWorkerHeartbeats.indexer = Date.now();
      }
    } catch (err) {
      console.error("[ChainIndexerWorker] Error during poll:", err);
    }
  }, 3000);
  if (typeof indexerTimer.unref === "function") indexerTimer.unref();
  timers.push(indexerTimer);

  // 2. Settlement Worker: retry transient payout failures (~5s interval)
  const settlementTimer = setInterval(async () => {
    try {
      await rt.settlement.runOnce();
      if (globalForWorkers.__ledgerlyWorkerHeartbeats) {
        globalForWorkers.__ledgerlyWorkerHeartbeats.settlement = Date.now();
      }
    } catch (err) {
      console.error("[SettlementWorker] Error during retry pass:", err);
    }
  }, 5000);
  if (typeof settlementTimer.unref === "function") settlementTimer.unref();
  timers.push(settlementTimer);

  // 3. Expiry Worker: expire stale payment requests and FX quotes (~60s interval)
  const expiryTimer = setInterval(async () => {
    try {
      await rt.expiry.runOnce();
      if (globalForWorkers.__ledgerlyWorkerHeartbeats) {
        globalForWorkers.__ledgerlyWorkerHeartbeats.expiry = Date.now();
      }
    } catch (err) {
      console.error("[ExpiryWorker] Error during expiry pass:", err);
    }
  }, 60000);
  if (typeof expiryTimer.unref === "function") expiryTimer.unref();
  timers.push(expiryTimer);

  // 4. Reconciliation Worker: scan exception queues & balance discrepancies (~60s interval)
  const reconciliationTimer = setInterval(async () => {
    try {
      await rt.reconciliation.runOnce();
      if (globalForWorkers.__ledgerlyWorkerHeartbeats) {
        globalForWorkers.__ledgerlyWorkerHeartbeats.reconciliation = Date.now();
      }
    } catch (err) {
      console.error("[ReconciliationWorker] Error during audit scan:", err);
    }
  }, 60000);
  if (typeof reconciliationTimer.unref === "function") reconciliationTimer.unref();
  timers.push(reconciliationTimer);

  globalForWorkers.__ledgerlyWorkerTimers = timers;

  // Graceful shutdown on process termination
  if (!globalForWorkers.__ledgerlySigtermRegistered && typeof process !== "undefined" && process.on) {
    globalForWorkers.__ledgerlySigtermRegistered = true;
    process.on("SIGTERM", () => {
      console.log("[Ledgerly] SIGTERM received. Gracefully shutting down worker intervals...");
      stopBackgroundWorkers();
    });
    process.on("SIGINT", () => {
      console.log("[Ledgerly] SIGINT received. Stopping worker intervals...");
      stopBackgroundWorkers();
    });
  }
}

export function stopBackgroundWorkers(): void {
  if (globalForWorkers.__ledgerlyWorkerTimers) {
    for (const timer of globalForWorkers.__ledgerlyWorkerTimers) {
      clearInterval(timer);
    }
    globalForWorkers.__ledgerlyWorkerTimers = [];
  }
  globalForWorkers.__ledgerlyWorkersStarted = false;
}

export function isBackgroundWorkersRunning(): boolean {
  return Boolean(globalForWorkers.__ledgerlyWorkersStarted);
}
