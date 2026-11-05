import { BADGE_NUMBER_LIMITS, HEX_COLOR } from "./badge";

// Stored as JSON in an app-data metafield and read by the theme block as
// `app.metafields.badgify.automation.value`, so keys are snake_case to match
// Liquid conventions.

export interface AutomationRule {
  enabled: boolean;
  label: string;
  bg_color: string;
  text_color: string;
}

export interface AutomationSettings {
  style: {
    border_radius: number;
    font_size: number;
    padding_x: number;
    padding_y: number;
  };
  sold_out: AutomationRule;
  sale: AutomationRule;
  low_stock: AutomationRule & { threshold: number };
  new_arrival: AutomationRule & { days: number };
}

export type RuleKey = "sold_out" | "sale" | "low_stock" | "new_arrival";

/** In storefront priority order. */
export const RULE_KEYS: RuleKey[] = ["sold_out", "sale", "low_stock", "new_arrival"];

export const LOW_STOCK_LIMITS = { min: 1, max: 100 } as const;
export const NEW_ARRIVAL_LIMITS = { min: 1, max: 365 } as const;

// Rules start disabled so installing or updating the app never adds badges
// to a store without the merchant opting in.
export const DEFAULT_AUTOMATION: AutomationSettings = {
  style: { border_radius: 4, font_size: 12, padding_x: 8, padding_y: 4 },
  sold_out: {
    enabled: false,
    label: "Sold out",
    bg_color: "#1A1A1A",
    text_color: "#FFFFFF",
  },
  sale: {
    enabled: false,
    label: "-{percent}%",
    bg_color: "#D72C0D",
    text_color: "#FFFFFF",
  },
  low_stock: {
    enabled: false,
    label: "Only {count} left!",
    bg_color: "#B98900",
    text_color: "#FFFFFF",
    threshold: 5,
  },
  new_arrival: {
    enabled: false,
    label: "New",
    bg_color: "#1F5130",
    text_color: "#FFFFFF",
    days: 30,
  },
};

/** Fills in any keys missing from stored settings (e.g. rules added later). */
export function withDefaults(stored: unknown): AutomationSettings {
  const value = (stored ?? {}) as Partial<Record<keyof AutomationSettings, object>>;
  const merge = <K extends keyof AutomationSettings>(key: K) =>
    ({ ...DEFAULT_AUTOMATION[key], ...(value[key] ?? {}) }) as AutomationSettings[K];

  return {
    style: merge("style"),
    sold_out: merge("sold_out"),
    sale: merge("sale"),
    low_stock: merge("low_stock"),
    new_arrival: merge("new_arrival"),
  };
}

const inRange = (value: number, { min, max }: { min: number; max: number }) =>
  Number.isInteger(value) && value >= min && value <= max;

/** Returns an error message, or null when the settings are valid. */
export function validateAutomation(settings: AutomationSettings): string | null {
  const { style } = settings;
  const styleChecks: [number, { min: number; max: number }, string][] = [
    [style.border_radius, BADGE_NUMBER_LIMITS.borderRadius, "Border radius"],
    [style.font_size, BADGE_NUMBER_LIMITS.fontSize, "Font size"],
    [style.padding_x, BADGE_NUMBER_LIMITS.paddingX, "Horizontal padding"],
    [style.padding_y, BADGE_NUMBER_LIMITS.paddingY, "Vertical padding"],
  ];
  for (const [value, limits, name] of styleChecks) {
    if (!inRange(value, limits)) {
      return `${name} must be a whole number between ${limits.min} and ${limits.max}.`;
    }
  }

  for (const key of RULE_KEYS) {
    const rule = settings[key];
    if (typeof rule.enabled !== "boolean") return "Invalid rule toggle.";
    if (!rule.label.trim()) return "Every rule needs a label.";
    if (rule.label.length > 40) return "Labels must be 40 characters or fewer.";
    if (!HEX_COLOR.test(rule.bg_color) || !HEX_COLOR.test(rule.text_color)) {
      return "Colors must be 6-digit hex values, like #D72C0D.";
    }
  }

  if (!inRange(settings.low_stock.threshold, LOW_STOCK_LIMITS)) {
    return `Low stock threshold must be between ${LOW_STOCK_LIMITS.min} and ${LOW_STOCK_LIMITS.max}.`;
  }
  if (!inRange(settings.new_arrival.days, NEW_ARRIVAL_LIMITS)) {
    return `New arrival days must be between ${NEW_ARRIVAL_LIMITS.min} and ${NEW_ARRIVAL_LIMITS.max}.`;
  }

  return null;
}
