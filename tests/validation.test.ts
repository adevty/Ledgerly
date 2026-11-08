import { describe, expect, it } from "vitest";
import {
  validateCustomerEmail,
  validateInvoiceRef,
  validateRemittanceInput,
  validateUsdcAmount,
  MAX_INVOICE_USDC_DECIMAL,
  MAX_REMITTANCE_USDC_DECIMAL,
  TRAVEL_RULE_THRESHOLD_USDC,
} from "@/lib/validation";

describe("Task E - Validation Guards & Edge Cases", () => {
  describe("validateInvoiceRef", () => {
    it("accepts valid invoice references with allowed charset", () => {
      const validCases = [
        "INV-2026-8841",
        "ORD.123_45#6-ABC",
        "ref-100",
        "A12", // 3 chars
        "A".repeat(64), // 64 chars
      ];
      for (const ref of validCases) {
        const res = validateInvoiceRef(ref);
        expect(res.valid, `Expected '${ref}' to be valid`).toBe(true);
        expect(res.value).toBe(ref);
      }
    });

    it("trims surrounding whitespace", () => {
      const res = validateInvoiceRef("   INV-2026-001   ");
      expect(res.valid).toBe(true);
      expect(res.value).toBe("INV-2026-001");
    });

    it("rejects whitespace-only, empty, and non-string inputs", () => {
      expect(validateInvoiceRef("").valid).toBe(false);
      expect(validateInvoiceRef("    ").valid).toBe(false);
      expect(validateInvoiceRef(null).valid).toBe(false);
      expect(validateInvoiceRef(undefined).valid).toBe(false);
      expect(validateInvoiceRef(12345).valid).toBe(false);
    });

    it("rejects references shorter than 3 or longer than 64 chars", () => {
      expect(validateInvoiceRef("AB").valid).toBe(false);
      expect(validateInvoiceRef("A".repeat(65)).valid).toBe(false);
    });

    it("rejects invalid characters, unicode emojis, and script injections", () => {
      const invalidCases = [
        "INV 2026", // space inside
        "INV@2026", // @
        "INV$2026", // $
        "INV/2026", // slash
        "INV-🚀-99", // unicode emoji
        "<script>alert(1)</script>",
        "INV\u0000NULL", // control char
      ];
      for (const ref of invalidCases) {
        expect(validateInvoiceRef(ref).valid, `Expected '${ref}' to be rejected`).toBe(false);
      }
    });

    it("enforces uniqueness when existingRefs set is provided", () => {
      const existing = new Set(["INV-2026-8841", "INV-2026-8842"]);
      expect(validateInvoiceRef("INV-2026-8841", existing).valid).toBe(false);
      expect(validateInvoiceRef("INV-2026-8841", existing).error).toContain("already exists");
      expect(validateInvoiceRef("INV-2026-8843", existing).valid).toBe(true);
    });
  });

  describe("validateUsdcAmount", () => {
    it("parses valid decimal amounts to exact 6-decimal integer minor units without float math", () => {
      const res1 = validateUsdcAmount("1450.00");
      expect(res1.valid).toBe(true);
      expect(res1.value?.amountMinor).toBe(1_450_000_000n);
      expect(res1.value?.decimal).toBe("1450.00");

      const res2 = validateUsdcAmount("0.05");
      expect(res2.valid).toBe(true);
      expect(res2.value?.amountMinor).toBe(50_000n);

      const res3 = validateUsdcAmount("250");
      expect(res3.valid).toBe(true);
      expect(res3.value?.amountMinor).toBe(250_000_000n);
      expect(res3.value?.decimal).toBe("250.00");

      const res4 = validateUsdcAmount("1,450.50");
      expect(res4.valid).toBe(true);
      expect(res4.value?.amountMinor).toBe(1_450_500_000n);
    });

    it("rejects strictly zero, negative zero, and negative amounts", () => {
      expect(validateUsdcAmount("0").valid).toBe(false);
      expect(validateUsdcAmount("0.00").valid).toBe(false);
      expect(validateUsdcAmount("-0").valid).toBe(false);
      expect(validateUsdcAmount("-0.00").valid).toBe(false);
      expect(validateUsdcAmount("-25.00").valid).toBe(false);
      expect(validateUsdcAmount("-0.01").valid).toBe(false);
    });

    it("rejects exponent notation, NaN, Infinity, and non-numeric strings", () => {
      const invalid = ["1e6", "1.5e-3", "2E4", "NaN", "Infinity", "-Infinity", "abc", "$100", "12.34.56"];
      for (const val of invalid) {
        expect(validateUsdcAmount(val).valid, `Expected '${val}' to be rejected`).toBe(false);
      }
    });

    it("rejects inputs with more than 2 decimal places for user-facing inputs", () => {
      expect(validateUsdcAmount("10.555").valid).toBe(false);
      expect(validateUsdcAmount("10.001").valid).toBe(false);
      expect(validateUsdcAmount("10.123456").valid).toBe(false);
      expect(validateUsdcAmount("10.555").error).toContain("decimal places");
    });

    it("enforces upper bound caps", () => {
      expect(validateUsdcAmount("1000000.00").valid).toBe(true);
      expect(validateUsdcAmount("1000000.01").valid).toBe(false);
      expect(validateUsdcAmount("50000000.00").valid).toBe(false);

      // Custom cap
      expect(validateUsdcAmount("50001.00", { maxAmountDecimal: MAX_REMITTANCE_USDC_DECIMAL }).valid).toBe(false);
      expect(validateUsdcAmount("50000.00", { maxAmountDecimal: MAX_REMITTANCE_USDC_DECIMAL }).valid).toBe(true);
    });
  });

  describe("validateCustomerEmail", () => {
    it("accepts valid RFC-style email addresses", () => {
      const valid = [
        "procurement@kyoto-living.jp",
        "finance@atelier-sari.com",
        "user.name+tag@domain.co.uk",
        "accounting@nordic-craft.dk",
      ];
      for (const email of valid) {
        expect(validateCustomerEmail(email).valid).toBe(true);
      }
    });

    it("rejects reasonable invalid email inputs including 'sdsd'", () => {
      const invalid = [
        "sdsd",
        "@example.com",
        "user@",
        "user@domain",
        "user@.com",
        "user name@domain.com",
        "user@domain..com",
      ];
      for (const email of invalid) {
        expect(validateCustomerEmail(email).valid, `Expected '${email}' to be rejected`).toBe(false);
      }
    });

    it("handles optional vs required states", () => {
      expect(validateCustomerEmail("", false).valid).toBe(true);
      expect(validateCustomerEmail(undefined, false).valid).toBe(true);
      expect(validateCustomerEmail("", true).valid).toBe(false);
      expect(validateCustomerEmail("   ", true).valid).toBe(false);
    });
  });

  describe("validateRemittanceInput", () => {
    it("passes with valid remittance inputs", () => {
      const res = validateRemittanceInput({
        amountDecimal: "350.00",
        availableBalanceUsdc: 4390,
        beneficiaryName: "Rosa Santos Artisans Co.",
        beneficiaryAccount: "GCASH:+63-917-555-0192",
        includeTravelRule: false,
      });
      expect(res.valid).toBe(true);
      expect(Object.keys(res.errors).length).toBe(0);
    });

    it("requires beneficiary name and account destination", () => {
      const res = validateRemittanceInput({
        amountDecimal: "350.00",
        beneficiaryName: "",
        beneficiaryAccount: "  ",
      });
      expect(res.valid).toBe(false);
      expect(res.errors.beneficiaryName).toBeDefined();
      expect(res.errors.beneficiaryAccount).toBeDefined();
    });

    it("enforces Travel Rule at and above 1,000 USDC threshold", () => {
      // 999.99 USDC without travel rule -> allowed
      const underRes = validateRemittanceInput({
        amountDecimal: "999.99",
        beneficiaryName: "PT Nusantara Craft",
        beneficiaryAccount: "BCA-123456",
        includeTravelRule: false,
      });
      expect(underRes.valid).toBe(true);

      // 1,000.00 USDC without travel rule -> REJECTED
      const thresholdRes = validateRemittanceInput({
        amountDecimal: "1000.00",
        beneficiaryName: "PT Nusantara Craft",
        beneficiaryAccount: "BCA-123456",
        includeTravelRule: false,
      });
      expect(thresholdRes.valid).toBe(false);
      expect(thresholdRes.errors.travelRule).toContain("mandatory");

      // 1,000.00 USDC with travel rule -> ALLOWED
      const okRes = validateRemittanceInput({
        amountDecimal: "1000.00",
        beneficiaryName: "PT Nusantara Craft",
        beneficiaryAccount: "BCA-123456",
        includeTravelRule: true,
      });
      expect(okRes.valid).toBe(true);
    });

    it("rejects amounts exceeding available settled balance", () => {
      const res = validateRemittanceInput({
        amountDecimal: "5000.00",
        availableBalanceUsdc: 4390.00,
        beneficiaryName: "PT Nusantara",
        beneficiaryAccount: "BCA-123",
        includeTravelRule: true,
      });
      expect(res.valid).toBe(false);
      expect(res.errors.amount).toContain("exceeds available settled balance");
    });
  });
});
