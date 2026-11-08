/**
 * Ledgerly Design System — "Clean fintech, product-first" (Dark-First)
 *
 * Maps Layer 2 (Semantic) and Layer 3 (Component) CSS custom properties defined
 * in `src/app/globals.css` to Tailwind utility classes.
 *
 * Theme switching:
 * - `:root` defaults to Dark ("Clean fintech, product-first", near-black #0A0A0B + orange #FF6A2B).
 * - `[data-theme="light"]` switches semantic/component tokens to a clean neutral light mode.
 *
 * Typography & Surface Discipline:
 * - Single sans-serif family; monospace strictly for hashes, addresses, and amounts.
 * - Tonal surface elevation + 1px borders; zero bloom, zero outer glow, zero decorative clutter.
 */
const tailwindConfig = {
  darkMode: ["selector", ':root:not([data-theme="light"])'],
  content: ["./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--surface-canvas)",
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          hover: "var(--surface-interactive-hover)",
        },
        scrim: "var(--overlay-scrim)",

        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          "on-accent": "var(--text-on-accent)",
        },

        accent: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-primary-hover)",
          active: "var(--accent-primary-active)",
          subtle: "var(--accent-subtle)",
          border: "var(--accent-border)",
          foreground: "var(--text-on-accent)",
        },

        status: {
          settled: {
            fg: "var(--status-settled-fg)",
            bg: "var(--status-settled-bg)",
            border: "var(--status-settled-border)",
          },
          pending: {
            fg: "var(--status-pending-fg)",
            bg: "var(--status-pending-bg)",
            border: "var(--status-pending-border)",
          },
          failed: {
            fg: "var(--status-failed-fg)",
            bg: "var(--status-failed-bg)",
            border: "var(--status-failed-border)",
          },
          neutral: {
            fg: "var(--status-neutral-fg)",
            bg: "var(--status-neutral-bg)",
            border: "var(--status-neutral-border)",
          },
        },

        border: {
          subtle: "var(--border-subtle)",
          DEFAULT: "var(--border-default)",
          strong: "var(--border-strong)",
          focus: "var(--border-focus)",
        },

        panel: {
          DEFAULT: "var(--panel-bg)",
          raised: "var(--panel-raised-bg)",
          overlay: "var(--panel-overlay-bg)",
          border: "var(--panel-border)",
          divider: "var(--panel-divider)",
        },
        btn: {
          primary: {
            bg: "var(--btn-primary-bg)",
            fg: "var(--btn-primary-fg)",
            border: "var(--btn-primary-border)",
            hover: "var(--btn-primary-hover-bg)",
            active: "var(--btn-primary-active-bg)",
          },
          secondary: {
            bg: "var(--btn-secondary-bg)",
            fg: "var(--btn-secondary-fg)",
            border: "var(--btn-secondary-border)",
            hover: "var(--btn-secondary-hover-bg)",
          },
          ghost: {
            fg: "var(--btn-ghost-fg)",
            hover: "var(--btn-ghost-hover-bg)",
          },
          danger: {
            bg: "var(--btn-danger-bg)",
            fg: "var(--btn-danger-fg)",
            border: "var(--btn-danger-border)",
          },
        },
        input: {
          bg: "var(--input-bg)",
          fg: "var(--input-fg)",
          placeholder: "var(--input-placeholder)",
          border: "var(--input-border)",
          focus: "var(--input-focus-ring)",
          "affix-bg": "var(--input-affix-bg)",
          "affix-fg": "var(--input-affix-fg)",
        },
        table: {
          "header-bg": "var(--table-header-bg)",
          "header-fg": "var(--table-header-fg)",
          "row-bg": "var(--table-row-bg)",
          "row-hover": "var(--table-row-hover-bg)",
          border: "var(--table-border)",
        },
        toast: {
          bg: "var(--toast-bg)",
          fg: "var(--toast-fg)",
          border: "var(--toast-border)",
        },
        dialog: {
          bg: "var(--dialog-bg)",
          border: "var(--dialog-border)",
        },
      },

      fontFamily: {
        sans: ["var(--font-family-sans)"],
        mono: ["var(--font-family-mono)"],
      },

      fontSize: {
        "2xs": ["var(--primitive-text-2xs)", { lineHeight: "1.3" }],
        xs: ["var(--primitive-text-xs)", { lineHeight: "1.4" }],
        sm: ["var(--primitive-text-sm)", { lineHeight: "1.45" }],
        md: ["var(--primitive-text-md)", { lineHeight: "1.5" }],
        base: ["var(--primitive-text-base)", { lineHeight: "var(--primitive-leading-normal)" }],
        lg: ["var(--primitive-text-lg)", { lineHeight: "var(--primitive-leading-relaxed)" }],
        xl: ["var(--primitive-text-xl)", { lineHeight: "var(--primitive-leading-snug)" }],
        "2xl": ["var(--primitive-text-2xl)", { lineHeight: "1.16" }],
        "3xl": ["var(--primitive-text-3xl)", { lineHeight: "var(--primitive-leading-tight)" }],
        display: ["var(--primitive-text-display)", { lineHeight: "var(--primitive-leading-tight)" }],
      },

      borderRadius: {
        none: "var(--primitive-radius-none)",
        xs: "var(--primitive-radius-xs)",
        sm: "var(--primitive-radius-sm)",
        md: "var(--primitive-radius-md)",
        lg: "var(--primitive-radius-lg)",
        xl: "var(--primitive-radius-xl)",
        "2xl": "var(--primitive-radius-2xl)",
      },

      boxShadow: {
        DEFAULT: "var(--elevation-none)",
        sm: "var(--elevation-none)",
        md: "var(--elevation-none)",
        lg: "var(--elevation-none)",
        xl: "var(--elevation-none)",
        "2xl": "var(--elevation-none)",
        none: "none",
      },

      transitionDuration: {
        instant: "var(--primitive-duration-instant)",
        fast: "var(--motion-duration-fast)",
        base: "var(--motion-duration-base)",
        slow: "var(--motion-duration-slow)",
      },
      transitionTimingFunction: {
        standard: "var(--motion-ease-standard)",
        emphasized: "var(--motion-ease-emphasized)",
      },
    },
  },
  plugins: [],
};

export default tailwindConfig;
