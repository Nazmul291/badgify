import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticateWithBilling } from "../shopify.server";
import { ShopifyUserErrors } from "../services/metafield-setup.server";
import {
  getAutomationSettings,
  saveAutomationSettings,
} from "../services/automation.server";
import {
  LOW_STOCK_LIMITS,
  NEW_ARRIVAL_LIMITS,
  RULE_KEYS,
  validateAutomation,
  withDefaults,
} from "../models/automation";
import type { AutomationSettings, RuleKey } from "../models/automation";
import { BADGE_NUMBER_LIMITS } from "../models/badge";
import { BadgePreview } from "../components/BadgePreview";

type ActionResult = { ok: true } | { ok: false; error: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticateWithBilling(request);
  return { settings: await getAutomationSettings(admin) };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticateWithBilling(request);
  const formData = await request.formData();

  let settings: AutomationSettings;
  try {
    settings = withDefaults(JSON.parse(String(formData.get("settings"))));
  } catch {
    return { ok: false, error: "Invalid settings." };
  }

  const error = validateAutomation(settings);
  if (error) return { ok: false, error };

  try {
    await saveAutomationSettings(admin, settings);
    return { ok: true };
  } catch (err) {
    if (err instanceof ShopifyUserErrors) return { ok: false, error: err.message };
    throw err;
  }
};

const RULE_INFO: Record<RuleKey, { title: string; description: string; tokens?: string }> = {
  sold_out: {
    title: "Sold out",
    description: "Shown when every variant of the product is unavailable.",
  },
  sale: {
    title: "Sale",
    description:
      "Shown when the selected variant's compare-at price is higher than its price.",
    tokens: "Use {percent} for the percentage saved and {amount} for the amount saved.",
  },
  low_stock: {
    title: "Low stock",
    description:
      "Shown when the selected variant tracks inventory and has this many units or fewer left.",
    tokens: "Use {count} for the units left.",
  },
  new_arrival: {
    title: "New arrival",
    description: "Shown for products published within this many days.",
  },
};

// Example values so previews show what shoppers will see.
function previewLabel(key: RuleKey, settings: AutomationSettings) {
  const { label } = settings[key];
  return label
    .replaceAll("{percent}", "20")
    .replaceAll("{amount}", "$10.00")
    .replaceAll("{count}", String(Math.min(3, settings.low_stock.threshold)));
}

const NUMERIC_FIELDS = new Set([
  "style.border_radius",
  "style.font_size",
  "style.padding_x",
  "style.padding_y",
  "low_stock.threshold",
  "new_arrival.days",
]);

// Polaris web components don't fire React change events and have no
// controlled-input story, so read the current values off the elements.
// Field names are dotted paths into the settings object.
function readSettings(form: HTMLFormElement, base: AutomationSettings) {
  const settings = structuredClone(base) as unknown as Record<string, Record<string, unknown>>;

  form.querySelectorAll<HTMLElement & { value?: string; checked?: boolean }>("[name]").forEach(
    (field) => {
      const name = field.getAttribute("name")!;
      const [group, key] = name.split(".");
      if (!settings[group] || !key) return;

      if (field.tagName === "S-SWITCH") {
        settings[group][key] = Boolean(field.checked);
      } else if (NUMERIC_FIELDS.has(name)) {
        const parsed = Number.parseInt(field.value ?? "", 10);
        if (!Number.isNaN(parsed)) settings[group][key] = parsed;
      } else {
        settings[group][key] = field.value ?? "";
      }
    },
  );

  return settings as unknown as AutomationSettings;
}

function RuleSection({
  ruleKey,
  initial,
  preview,
}: {
  ruleKey: RuleKey;
  initial: AutomationSettings;
  preview: AutomationSettings;
}) {
  const info = RULE_INFO[ruleKey];
  const rule = initial[ruleKey];
  const { style } = preview;

  return (
    <s-section heading={info.title}>
      <s-stack gap="base">
        <s-paragraph>{info.description}</s-paragraph>
        <s-switch
          name={`${ruleKey}.enabled`}
          label={`Show ${info.title.toLowerCase()} badges`}
          {...(rule.enabled ? { checked: true } : {})}
        />
        <s-grid gridTemplateColumns="@container (inline-size > 560px) 2fr 1fr, 1fr" gap="base">
          <s-stack gap="base">
            <s-text-field
              name={`${ruleKey}.label`}
              label="Label"
              value={rule.label}
              maxLength={40}
              details={info.tokens}
            />
            <s-stack direction="inline" gap="base">
              <s-color-field
                name={`${ruleKey}.bg_color`}
                label="Background color"
                value={rule.bg_color}
              />
              <s-color-field
                name={`${ruleKey}.text_color`}
                label="Text color"
                value={rule.text_color}
              />
            </s-stack>
            {ruleKey === "low_stock" && (
              <s-number-field
                name="low_stock.threshold"
                label="Low stock threshold"
                value={String(initial.low_stock.threshold)}
                min={LOW_STOCK_LIMITS.min}
                max={LOW_STOCK_LIMITS.max}
                step={1}
                suffix="units"
              />
            )}
            {ruleKey === "new_arrival" && (
              <s-number-field
                name="new_arrival.days"
                label="Show for"
                value={String(initial.new_arrival.days)}
                min={NEW_ARRIVAL_LIMITS.min}
                max={NEW_ARRIVAL_LIMITS.max}
                step={1}
                suffix="days"
              />
            )}
          </s-stack>
          <s-box padding="large" background="subdued" borderRadius="base">
            <s-stack gap="base" alignItems="center">
              <s-text color="subdued">Preview</s-text>
              <BadgePreview
                label={previewLabel(ruleKey, preview)}
                style={{
                  bgColor: preview[ruleKey].bg_color,
                  textColor: preview[ruleKey].text_color,
                  borderRadius: style.border_radius,
                  fontSize: style.font_size,
                  paddingX: style.padding_x,
                  paddingY: style.padding_y,
                  cssCustom: "",
                }}
              />
            </s-stack>
          </s-box>
        </s-grid>
      </s-stack>
    </s-section>
  );
}

export default function AutomationsPage() {
  const { settings: initial } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<AutomationSettings>(initial);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const update = () => setPreview(readSettings(form, initial));
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [initial]);

  useEffect(() => {
    const result = fetcher.data;
    if (!result || fetcher.state !== "idle") return;
    if (result.ok) shopify.toast.show("Automated badges saved");
    else shopify.toast.show(result.error, { isError: true });
  }, [fetcher.data, fetcher.state, shopify]);

  const saving = fetcher.state !== "idle";

  return (
    <s-page heading="Automated badges">
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          const settings = readSettings(event.currentTarget, initial);
          fetcher.submit({ settings: JSON.stringify(settings) }, { method: "post" });
        }}
      >
        <s-stack gap="base">
          <s-banner tone="info">
            Automated badges show on products without a manually assigned
            badge. When several rules match, the first one wins: Sold out,
            then Sale, then Low stock, then New arrival.
          </s-banner>

          {RULE_KEYS.map((key) => (
            <RuleSection key={key} ruleKey={key} initial={initial} preview={preview} />
          ))}

          <s-section heading="Shared style">
            <s-paragraph>Applies to all automated badges.</s-paragraph>
            <s-stack direction="inline" gap="base">
              {(
                [
                  ["border_radius", "Border radius", BADGE_NUMBER_LIMITS.borderRadius],
                  ["font_size", "Font size", BADGE_NUMBER_LIMITS.fontSize],
                  ["padding_x", "Horizontal padding", BADGE_NUMBER_LIMITS.paddingX],
                  ["padding_y", "Vertical padding", BADGE_NUMBER_LIMITS.paddingY],
                ] as const
              ).map(([key, label, limits]) => (
                <s-number-field
                  key={key}
                  name={`style.${key}`}
                  label={label}
                  value={String(initial.style[key])}
                  min={limits.min}
                  max={limits.max}
                  step={1}
                  suffix="px"
                />
              ))}
            </s-stack>
          </s-section>

          <s-stack direction="inline" justifyContent="end">
            <s-button type="submit" variant="primary" {...(saving ? { loading: true } : {})}>
              Save
            </s-button>
          </s-stack>
        </s-stack>
      </form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
