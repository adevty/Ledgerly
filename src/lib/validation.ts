/**
 * Pure TypeScript validation guards for Ledgerly inputs (server & client).
 * Implements strict security, edge-case rejection (no float math, exponent notation,
 * negative zero, unicode/whitespace injection), and structured field errors.
 */

export const MAX_INVOICE_USDC_DECIMAL = "1000000.00";
export const MAX_REMITTANCE_USDC_DECIMAL = "50000.00";
export const TRAVEL_RULE_THRESHOLD_USDC = 1000;

export interface ValidationResult<T = void> {
  readonly valid: boolean;
  readonly value?: T;
  readonly error?: string;
}

export interface StructuredValidationErrors {
  readonly valid: boolean;
  readonly errors: Record<string, string>;
}

/**
 * Validate merchant invoice / order reference:
 * - Trimmed, 3 to 64 chars
 * - Allowed charset: alphanumeric, dot, underscore, hash, dash
 * - Optionally checks uniqueness against existing merchant references
 */
export function validateInvoiceRef(
  orderRef: unknown,
  existingRefs?: Set<string> | string[],
): ValidationResult<string> {
  if (typeof orderRef !== "string") {
    return { valid: false, error: "Invoice reference must be a string" };
  }

  const trimmed = orderRef.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: "Invoice reference is required" };
  }

  if (trimmed.length < 3 || trimmed.length > 64) {
    return {
      valid: false,
      error: `Invoice reference must be between 3 and 64 characters (got ${trimmed.length})`,
    };
  }

  const allowedRegex = /^[A-Za-z0-9._#-]+$/;
  if (!allowedRegex.test(trimmed)) {
    return {
      valid: false,
      error: "Invoice reference can only contain letters, numbers, '.', '_', '#', and '-'",
    };
  }

  if (existingRefs) {
    const set = existingRefs instanceof Set ? existingRefs : new Set(existingRefs);
    if (set.has(trimmed)) {
      return {
        valid: false,
        error: `Invoice reference '${trimmed}' already exists for this merchant`,
      };
    }
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate USDC amount string without float math:
 * - Rejects exponent notation (e/E), NaN, Infinity
 * - Rejects negative numbers and negative zero (-0, -0.00)
 * - Must be strictly positive (> 0)
 * - Maximum 2 decimal places for user-facing amounts
 * - Enforces configurable upper bound (default 1,000,000 USDC)
 * - Returns exact 6-decimal integer minor units (BigInt)
 */
export function validateUsdcAmount(
  amountDecimal: unknown,
  options?: {
    maxAmountDecimal?: string;
    maxDecimals?: number;
    fieldName?: string;
  },
): ValidationResult<{ decimal: string; amountMinor: bigint }> {
  const fieldName = options?.fieldName ?? "Amount";
  const maxDecimals = options?.maxDecimals ?? 2;
  const maxCapStr = options?.maxAmountDecimal ?? MAX_INVOICE_USDC_DECIMAL;

  if (typeof amountDecimal !== "string" && typeof amountDecimal !== "number") {
    return { valid: false, error: `${fieldName} must be a valid number string` };
  }

  const rawStr = String(amountDecimal).trim();
  if (rawStr.length === 0) {
    return { valid: false, error: `${fieldName} is required` };
  }

  // Reject exponent notation (1e6, 1E-4), NaN, Infinity
  if (/[eE]/.test(rawStr) || rawStr.toLowerCase().includes("nan") || rawStr.toLowerCase().includes("infinity")) {
    return { valid: false, error: `${fieldName} must be a standard decimal number (no exponent notation)` };
  }

  // Reject leading minus or negative zero (-0, -0.00)
  if (rawStr.startsWith("-")) {
    return { valid: false, error: `${fieldName} must be a positive number greater than 0` };
  }

  // Clean commas
  const sanitized = rawStr.replace(/,/g, "");

  // Must strictly match digits with optional maxDecimals decimal digits
  const decimalRegex = new RegExp(`^(\\d+)(?:\\.(\\d{1,${maxDecimals}}))?$`);
  const match = decimalRegex.exec(sanitized);
  if (!match) {
    // Check if failure is due to excessive decimal precision
    if (/^\d+\.\d+$/.test(sanitized)) {
      return { valid: false, error: `${fieldName} exceeds maximum ${maxDecimals} decimal places` };
    }
    return { valid: false, error: `${fieldName} must be a valid positive decimal number` };
  }

  const wholeStr = match[1]!;
  const fracStr = match[2] ?? "";

  // Convert to 6-decimal minor units without floating-point math
  const minorWhole = BigInt(wholeStr) * 1_000_000n;
  const minorFrac = BigInt(fracStr.padEnd(6, "0"));
  const amountMinor = minorWhole + minorFrac;

  if (amountMinor <= 0n) {
    return { valid: false, error: `${fieldName} must be greater than 0` };
  }

  // Parse max cap
  const maxCapMatch = /^(\d+)(?:\.(\d+))?$/.exec(maxCapStr.replace(/,/g, ""));
  if (maxCapMatch) {
    const capWhole = BigInt(maxCapMatch[1]!) * 1_000_000n;
    const capFrac = BigInt((maxCapMatch[2] ?? "").slice(0, 6).padEnd(6, "0"));
    const capMinor = capWhole + capFrac;
    if (amountMinor > capMinor) {
      return {
        valid: false,
        error: `${fieldName} cannot exceed ${maxCapStr} USDC`,
      };
    }
  }

  const canonicalDecimal = `${wholeStr}${fracStr ? `.${fracStr}` : ".00"}`;
  return {
    valid: true,
    value: {
      decimal: canonicalDecimal,
      amountMinor,
    },
  };
}

/**
 * Validate customer email:
 * - Reasonably strict RFC-compliant email check
 * - Rejects single words ("sdsd"), missing domain, spaces
 * - Optional when required=false and input is empty
 */
export function validateCustomerEmail(
  email: unknown,
  required = false,
): ValidationResult<string> {
  if (email === undefined || email === null || email === "") {
    if (required) {
      return { valid: false, error: "Customer email is required" };
    }
    return { valid: true, value: "" };
  }

  if (typeof email !== "string") {
    return { valid: false, error: "Customer email must be a string" };
  }

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    if (required) {
      return { valid: false, error: "Customer email is required" };
    }
    return { valid: true, value: "" };
  }

  if (trimmed.includes("..")) {
    return { valid: false, error: "Please enter a valid customer email address (no consecutive dots)" };
  }

  // Standard reasonable email check: requires user, @, valid domain labels, and 2+ char TLD
  const emailRegex = /^[^\s@]+@([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Please enter a valid customer email address (e.g. name@domain.com)" };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: "Customer email is too long (max 254 characters)" };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validate remittance form input:
 * - Amount positive, <= available balance, <= per-tx cap (50,000 USDC)
 * - Beneficiary name and account/wallet required
 * - Travel Rule checkbox forced ON and required when amount >= 1,000 USDC
 */
export function validateRemittanceInput(input: {
  amountDecimal: unknown;
  availableBalanceUsdc?: number;
  beneficiaryName: unknown;
  beneficiaryAccount: unknown;
  includeTravelRule?: boolean;
}): StructuredValidationErrors {
  const errors: Record<string, string> = {};

  const amountRes = validateUsdcAmount(input.amountDecimal, {
    maxAmountDecimal: MAX_REMITTANCE_USDC_DECIMAL,
    fieldName: "Remittance amount",
  });

  if (!amountRes.valid) {
    errors.amount = amountRes.error ?? "Invalid amount";
  } else if (input.availableBalanceUsdc !== undefined) {
    const numAmount = Number(amountRes.value?.decimal ?? 0);
    if (numAmount > input.availableBalanceUsdc) {
      errors.amount = `Amount (${numAmount.toFixed(2)} USDC) exceeds available settled balance (${input.availableBalanceUsdc.toFixed(2)} USDC)`;
    }
  }

  // Beneficiary Name check
  if (typeof input.beneficiaryName !== "string" || input.beneficiaryName.trim().length < 2) {
    errors.beneficiaryName = "Beneficiary name is required (minimum 2 characters)";
  }

  // Beneficiary Account check
  if (typeof input.beneficiaryAccount !== "string" || input.beneficiaryAccount.trim().length < 3) {
    errors.beneficiaryAccount = "Beneficiary account, IBAN, or wallet address is required";
  }

  // Travel Rule check
  const numAmount = amountRes.valid ? Number(amountRes.value?.decimal ?? 0) : 0;
  if (numAmount >= TRAVEL_RULE_THRESHOLD_USDC && !input.includeTravelRule) {
    errors.travelRule = "FATF Travel Rule payload is mandatory for cross-border remittances >= 1,000 USDC";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate merchant payment request creation form input:
 * - Order reference: trimmed, 3-64 chars, unique per merchant
 * - Amount: positive, <= 1,000,000 USDC
 * - Email: reasonable format if provided
 */
export function validatePaymentRequestInput(input: {
  orderRef: unknown;
  amountDecimal: unknown;
  customerEmail?: unknown;
  existingRefs?: Set<string> | string[];
}): StructuredValidationErrors {
  const errors: Record<string, string> = {};

  const refRes = validateInvoiceRef(input.orderRef, input.existingRefs);
  if (!refRes.valid) {
    errors.orderRef = refRes.error ?? "Invalid invoice reference";
  }

  const amtRes = validateUsdcAmount(input.amountDecimal, {
    maxAmountDecimal: MAX_INVOICE_USDC_DECIMAL,
    fieldName: "Invoice amount",
  });
  if (!amtRes.valid) {
    errors.amount = amtRes.error ?? "Invalid amount";
  }

  if (input.customerEmail !== undefined && input.customerEmail !== "") {
    const emailRes = validateCustomerEmail(input.customerEmail, false);
    if (!emailRes.valid) {
      errors.customerEmail = emailRes.error ?? "Invalid customer email";
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
