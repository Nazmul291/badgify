import type { BadgeInput } from "./badge";

export interface BadgePreset {
  id: string;
  name: string;
  values: Omit<BadgeInput, "title">;
}

// Effects the base fields can't express (transparent backgrounds, borders,
// gradients) go in cssCustom, which the storefront block applies too.
export const BADGE_PRESETS: BadgePreset[] = [
  {
    id: "sale-pill",
    name: "Sale pill",
    values: {
      label: "Sale",
      bgColor: "#D72C0D",
      textColor: "#FFFFFF",
      borderRadius: 999,
      fontSize: 12,
      paddingX: 12,
      paddingY: 4,
      cssCustom: "text-transform: uppercase; letter-spacing: 0.06em;",
    },
  },
  {
    id: "minimal-outline",
    name: "Minimal outline",
    values: {
      label: "New",
      bgColor: "#FFFFFF",
      textColor: "#1A1A1A",
      borderRadius: 4,
      fontSize: 12,
      paddingX: 10,
      paddingY: 4,
      cssCustom: "background-color: transparent; border: 1px solid currentColor;",
    },
  },
  {
    id: "dark-gradient",
    name: "Dark gradient",
    values: {
      label: "Best seller",
      bgColor: "#111827",
      textColor: "#F9FAFB",
      borderRadius: 6,
      fontSize: 12,
      paddingX: 12,
      paddingY: 5,
      cssCustom:
        "background-image: linear-gradient(135deg, #111827 0%, #4B5563 100%); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);",
    },
  },
  {
    id: "eco-green",
    name: "Eco green",
    values: {
      label: "Eco friendly",
      bgColor: "#E3F1DF",
      textColor: "#1F5130",
      borderRadius: 999,
      fontSize: 12,
      paddingX: 12,
      paddingY: 4,
      cssCustom: "",
    },
  },
  {
    id: "bold-block",
    name: "Bold block",
    values: {
      label: "Limited",
      bgColor: "#FFD60A",
      textColor: "#111111",
      borderRadius: 0,
      fontSize: 13,
      paddingX: 10,
      paddingY: 6,
      cssCustom: "font-weight: 800; text-transform: uppercase;",
    },
  },
];
