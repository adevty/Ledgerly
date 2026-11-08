import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  getCapability,
  getCapabilityBadge,
  type CapabilityId,
  type CapabilityStatus,
} from "@/lib/capabilities";

describe("Task C: Capability Registry & Honesty Layer", () => {
  const allCapabilityIds: CapabilityId[] = [
    "escrow_register",
    "escrow_deposit",
    "escrow_release",
    "escrow_refund",
    "escrow_anchor",
    "claim_refund",
    "one_click_quote",
    "deposit_address",
    "solver_settlement",
    "off_ramp_payout",
    "sanctions_screening",
    "travel_rule",
    "fx_rates",
  ];

  it("registers every required system capability with valid metadata", () => {
    for (const id of allCapabilityIds) {
      const cap = CAPABILITIES[id];
      expect(cap).toBeDefined();
      expect(cap.id).toBe(id);
      expect(cap.label.length).toBeGreaterThan(0);
      expect(cap.note.length).toBeGreaterThan(0);
      expect(["real", "dry-run", "simulated", "mock"]).toContain(cap.status);
    }
  });

  it("honesty rule: every simulated or mock capability has an explicit explanatory note", () => {
    for (const id of allCapabilityIds) {
      const cap = CAPABILITIES[id];
      if (cap.status === "simulated" || cap.status === "mock") {
        expect(cap.note).toMatch(/mock|simulat|not implemented|sandbox/i);
      }
    }
  });

  it("dynamically resolves on-chain capabilities to 'simulated' in sandbox mode and 'real' in live mode", () => {
    const onchainOps: CapabilityId[] = [
      "escrow_register",
      "escrow_deposit",
      "escrow_release",
      "escrow_refund",
      "escrow_anchor",
      "claim_refund",
    ];

    for (const id of onchainOps) {
      const sandboxCap = getCapability(id, "LOCAL_SANDBOX_SIMULATION");
      expect(sandboxCap.status).toBe("simulated");
      expect(sandboxCap.note).toContain("Simulated in local sandbox");

      const liveCap = getCapability(id, "NEAR_TESTNET_RPC");
      expect(liveCap.status).toBe("real");
    }
  });

  it("generates correct badge descriptors with distinct visual tones and tooltips", () => {
    const mockBadge = getCapabilityBadge("off_ramp_payout");
    expect(mockBadge.status).toBe("mock");
    expect(mockBadge.label).toBe("MOCK");
    expect(mockBadge.tone).toContain("amber");
    expect(mockBadge.tooltip).toContain("Instant Partner Settle");

    const simBadge = getCapabilityBadge("solver_settlement");
    expect(simBadge.status).toBe("simulated");
    expect(simBadge.label).toBe("SIMULATED");
    expect(simBadge.tone).toContain("amber");

    const dryBadge = getCapabilityBadge("deposit_address");
    expect(dryBadge.status).toBe("dry-run");
    expect(dryBadge.label).toBe("DRY-RUN");
    expect(dryBadge.tone).toContain("blue");

    const liveBadge = getCapabilityBadge("one_click_quote");
    expect(liveBadge.status).toBe("real");
    expect(liveBadge.label).toBe("LIVE");
    expect(liveBadge.tone).toContain("emerald");
  });

  it("registry-level test: throws if an unregistered capability ID is queried", () => {
    expect(() => getCapability("non_existent_capability" as CapabilityId)).toThrow(
      /Unknown capability/,
    );
  });

  it("verifies mock and simulated capabilities cannot be misrepresented as real", () => {
    const simulatedOrMock: CapabilityId[] = [
      "solver_settlement",
      "off_ramp_payout",
      "sanctions_screening",
      "travel_rule",
    ];

    for (const id of simulatedOrMock) {
      const cap = getCapability(id);
      expect(cap.status).not.toBe("real");
      const badge = getCapabilityBadge(id);
      expect(badge.label).not.toBe("LIVE");
      expect(badge.label).toMatch(/MOCK|SIMULATED/);
    }
  });

  it("verifies README.md capabilities table remains in sync with capability registry", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const readmePath = resolve(process.cwd(), "README.md");
    expect(existsSync(readmePath)).toBe(true);
    const content = readFileSync(readmePath, "utf8");

    for (const id of allCapabilityIds) {
      const cap = CAPABILITIES[id];
      expect(content).toContain(cap.label);
    }
  });
});
