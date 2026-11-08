import { describe, expect, it, afterEach } from "vitest";
import { assertNodeSqliteSupport } from "@/shared/sqlite-persistence";
import {
  getWorkerHeartbeats,
  getWorkerHeartbeatAgesMs,
  startBackgroundWorkers,
  stopBackgroundWorkers,
  isBackgroundWorkersRunning,
} from "@/workers/runner";
import { getRuntime } from "@/app/api/_runtime";
import { GET as healthGet } from "@/app/api/health/route";
import { POST as actionsPost } from "@/app/api/v1/actions/route";

describe("Task F - Runtime Hosting, Worker Runner & Hardening", () => {
  afterEach(() => {
    stopBackgroundWorkers();
  });

  describe("Node.js runtime & node:sqlite check", () => {
    it("passes node:sqlite engine validation on Node >= 22.13", () => {
      expect(() => assertNodeSqliteSupport()).not.toThrow();
    });
  });

  describe("Background worker intervals & heartbeat tracker", () => {
    it("tracks worker heartbeats and reports elapsed ages", () => {
      const heartbeats = getWorkerHeartbeats();
      expect(typeof heartbeats.indexer).toBe("number");
      expect(typeof heartbeats.settlement).toBe("number");
      expect(typeof heartbeats.expiry).toBe("number");
      expect(typeof heartbeats.reconciliation).toBe("number");

      const ages = getWorkerHeartbeatAgesMs();
      expect(typeof ages.indexer).toBe("number");
      expect(typeof ages.settlement).toBe("number");
    });

    it("prevents double-starting workers (HMR idempotency) and shuts down cleanly", async () => {
      const rt = await getRuntime(true);
      // Force worker intervals for this test
      process.env.FORCE_WORKER_INTERVALS = "true";

      expect(isBackgroundWorkersRunning()).toBe(false);
      startBackgroundWorkers(rt);
      expect(isBackgroundWorkersRunning()).toBe(true);

      // Calling start again should be a no-op (idempotent under Next dev HMR)
      startBackgroundWorkers(rt);
      expect(isBackgroundWorkersRunning()).toBe(true);

      // Graceful stop
      stopBackgroundWorkers();
      expect(isBackgroundWorkersRunning()).toBe(false);

      delete process.env.FORCE_WORKER_INTERVALS;
    });
  });

  describe("GET /api/health", () => {
    it("returns 200 with db status, lastIndexedBlock, worker health, and zero secrets/PII", async () => {
      const res = await healthGet();
      expect(res.status).toBe(200);

      const json = (await res.json()) as Record<string, unknown>;
      expect(json.status).toBeDefined();
      expect(json.db).toBe("ok");
      expect(typeof json.lastIndexedBlock).toBe("string");
      expect(json.runtimeMode).toBeDefined();
      expect(json.workers).toBeDefined();

      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain("ed25519:");
      expect(serialized).not.toContain("privateKey");
      expect(serialized).not.toContain("secret");
      expect(serialized).not.toContain("DEMO_ADMIN_TOKEN");
    });
  });

  describe("Public-demo hardening on /api/v1/actions", () => {
    it("blocks simulation actions in production when DEMO_MODE is not true", async () => {
      const envObj = process.env as Record<string, string | undefined>;
      const origNodeEnv = envObj.NODE_ENV;
      const origDemoMode = envObj.DEMO_MODE;

      try {
        envObj.NODE_ENV = "production";
        delete envObj.DEMO_MODE;

        const req = new Request("http://localhost:3000/api/v1/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "198.51.100.1",
          },
          body: JSON.stringify({
            action: "SIMULATE_BUYER_DEPOSIT",
            escrowId: "test_escrow",
          }),
        });

        const res = await actionsPost(req);
        expect(res.status).toBe(403);
        const data = (await res.json()) as { ok: boolean; error: { code: string } };
        expect(data.ok).toBe(false);
        expect(data.error.code).toBe("DEMO_MODE_DISABLED");
      } finally {
        envObj.NODE_ENV = origNodeEnv;
        if (origDemoMode) envObj.DEMO_MODE = origDemoMode;
      }
    });

    it("enforces DEMO_ADMIN_TOKEN header for RESET_DEV_STATE", async () => {
      const origToken = process.env.DEMO_ADMIN_TOKEN;

      try {
        process.env.DEMO_ADMIN_TOKEN = "super-secret-admin-token";

        // Without header -> 401
        const reqUnauthorized = new Request("http://localhost:3000/api/v1/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "198.51.100.2",
          },
          body: JSON.stringify({ action: "RESET_DEV_STATE" }),
        });
        const resUnauth = await actionsPost(reqUnauthorized);
        expect(resUnauth.status).toBe(401);

        // With valid header -> 200
        const reqAuthorized = new Request("http://localhost:3000/api/v1/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "198.51.100.3",
            "x-demo-admin-token": "super-secret-admin-token",
          },
          body: JSON.stringify({ action: "RESET_DEV_STATE" }),
        });
        const resAuth = await actionsPost(reqAuthorized);
        expect(resAuth.status).toBe(200);
        const data = (await resAuth.json()) as { ok: boolean };
        expect(data.ok).toBe(true);
      } finally {
        if (origToken) process.env.DEMO_ADMIN_TOKEN = origToken;
        else delete process.env.DEMO_ADMIN_TOKEN;
      }
    });

    it("rate limits client IP after excessive action requests", async () => {
      const testIp = "203.0.113.99";

      // Send 30 valid requests
      for (let i = 0; i < 30; i++) {
        const req = new Request("http://localhost:3000/api/v1/actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": testIp,
          },
          body: JSON.stringify({ action: "REFRESH_AUDIT_GRANT" }),
        });
        await actionsPost(req);
      }

      // 31st request should be rate-limited
      const reqBlocked = new Request("http://localhost:3000/api/v1/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": testIp,
        },
        body: JSON.stringify({ action: "REFRESH_AUDIT_GRANT" }),
      });
      const resBlocked = await actionsPost(reqBlocked);
      expect(resBlocked.status).toBe(429);
      const data = (await resBlocked.json()) as { ok: boolean; error: { code: string } };
      expect(data.ok).toBe(false);
      expect(data.error.code).toBe("RATE_LIMIT_EXCEEDED");
    });
  });
});
