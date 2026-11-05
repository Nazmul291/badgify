import { useId } from "react";
import type { BadgeInput } from "../models/badge";

type PreviewStyle = Omit<BadgeInput, "title" | "label">;

// Matches the storefront block: only declarations, no way to break out of the rule.
const sanitize = (css: string) => css.replace(/[{}<>]/g, "").trim();

/**
 * Renders a badge the way the storefront block does, including custom CSS.
 * Styles go in a scoped <style> rather than inline so custom CSS can override
 * the base declarations, as it does on the storefront.
 */
export function BadgePreview({
  label,
  style,
}: {
  label: string;
  style: PreviewStyle;
}) {
  const className = `badgify-preview-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const custom = sanitize(style.cssCustom);

  const base = [
    "display: inline-block",
    `background-color: ${sanitize(style.bgColor)}`,
    `color: ${sanitize(style.textColor)}`,
    `border-radius: ${style.borderRadius}px`,
    `font-size: ${style.fontSize}px`,
    `padding: ${style.paddingY}px ${style.paddingX}px`,
    "font-weight: 600",
    "line-height: 1.2",
    "white-space: nowrap",
  ].join("; ");

  return (
    <>
      <style>
        {`.${className} { ${base}; }`}
        {custom && `.${className}.${className} { ${custom} }`}
      </style>
      <span className={className}>{label || "Badge"}</span>
    </>
  );
}
