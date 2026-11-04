// Shared between the server services and the admin UI — keep this free of
// server-only imports.

export interface Badge {
  id: string;
  title: string;
  label: string;
  bgColor: string;
  textColor: string;
  borderRadius: number;
  fontSize: number;
  paddingX: number;
  paddingY: number;
  cssCustom: string;
}

export type BadgeInput = Omit<Badge, "id">;

export const DEFAULT_BADGE: BadgeInput = {
  title: "",
  label: "",
  bgColor: "#D72C0D",
  textColor: "#FFFFFF",
  borderRadius: 4,
  fontSize: 12,
  paddingX: 8,
  paddingY: 4,
  cssCustom: "",
};
