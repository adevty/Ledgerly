import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LedgerlyBrandMark } from "@/app/components/LedgerlyBrandMark";

describe("LedgerlyBrandMark Component", () => {
  it("renders with default size 26 and aria-hidden attribute", () => {
    const html = renderToStaticMarkup(React.createElement(LedgerlyBrandMark));
    expect(html).toContain('width="26"');
    expect(html).toContain('height="26"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("ledgerly-mark-gradient");
  });

  it("renders with custom size and custom className", () => {
    const html = renderToStaticMarkup(
      React.createElement(LedgerlyBrandMark, { size: 32, className: "custom-brand-class" })
    );
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain('class="custom-brand-class"');
  });
});
