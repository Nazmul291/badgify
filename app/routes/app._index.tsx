import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticateWithBilling } from "../shopify.server";
import {
  ensureBadgeDefinitions,
  ShopifyUserErrors,
} from "../services/metafield-setup.server";
import {
  assignBadge,
  deleteBadge,
  listBadges,
  saveBadge,
  unassignBadge,
} from "../services/badges.server";
import { DEFAULT_BADGE } from "../models/badge";
import type { Badge, BadgeInput } from "../models/badge";

type Intent = "save" | "delete" | "assign" | "unassign";

type ActionResult =
  | { ok: true; intent: Intent; message: string }
  | { ok: false; intent: Intent; error: string };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const DELETE_MODAL_ID = "delete-badge-modal";

const NUMBER_LIMITS = {
  borderRadius: { min: 0, max: 999 },
  fontSize: { min: 8, max: 72 },
  paddingX: { min: 0, max: 64 },
  paddingY: { min: 0, max: 64 },
} as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticateWithBilling(request);

  // Self-heals if the install hook failed or the merchant deleted a definition.
  await ensureBadgeDefinitions(admin);
  const badges = await listBadges(admin);

  return {
    badges,
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

function parseBadgeInput(formData: FormData): BadgeInput | string {
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const badge: BadgeInput = {
    title: text("title"),
    label: text("label"),
    bgColor: text("bgColor"),
    textColor: text("textColor"),
    borderRadius: Number(text("borderRadius")),
    fontSize: Number(text("fontSize")),
    paddingX: Number(text("paddingX")),
    paddingY: Number(text("paddingY")),
    cssCustom: text("cssCustom"),
  };

  if (!badge.title) return "Title is required.";
  if (!badge.label) return "Label is required.";
  if (badge.label.length > 40) return "Label must be 40 characters or fewer.";
  if (!HEX_COLOR.test(badge.bgColor) || !HEX_COLOR.test(badge.textColor)) {
    return "Colors must be 6-digit hex values, like #D72C0D.";
  }
  for (const [key, { min, max }] of Object.entries(NUMBER_LIMITS)) {
    const value = badge[key as keyof typeof NUMBER_LIMITS];
    if (!Number.isInteger(value) || value < min || value > max) {
      return `${key} must be a whole number between ${min} and ${max}.`;
    }
  }

  return badge;
}

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticateWithBilling(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent")) as Intent;
  const badgeId = String(formData.get("badgeId") ?? "") || null;
  const productIds: string[] = JSON.parse(
    String(formData.get("productIds") ?? "[]"),
  );

  try {
    switch (intent) {
      case "save": {
        const input = parseBadgeInput(formData);
        if (typeof input === "string") {
          return { ok: false, intent, error: input };
        }
        await saveBadge(admin, badgeId, input);
        return { ok: true, intent, message: badgeId ? "Badge updated" : "Badge created" };
      }
      case "delete": {
        if (!badgeId) return { ok: false, intent, error: "Missing badge." };
        await deleteBadge(admin, badgeId);
        return { ok: true, intent, message: "Badge deleted" };
      }
      case "assign": {
        if (!badgeId) return { ok: false, intent, error: "Missing badge." };
        await assignBadge(admin, badgeId, productIds);
        return {
          ok: true,
          intent,
          message: `Badge assigned to ${productIds.length} product(s)`,
        };
      }
      case "unassign": {
        await unassignBadge(admin, productIds);
        return {
          ok: true,
          intent,
          message: `Badge removed from ${productIds.length} product(s)`,
        };
      }
      default:
        return { ok: false, intent, error: "Unknown action." };
    }
  } catch (error) {
    if (error instanceof ShopifyUserErrors) {
      return { ok: false, intent, error: error.message };
    }
    throw error;
  }
};

function badgeStyle(badge: BadgeInput): CSSProperties {
  return {
    display: "inline-block",
    backgroundColor: badge.bgColor,
    color: badge.textColor,
    borderRadius: `${badge.borderRadius}px`,
    fontSize: `${badge.fontSize}px`,
    padding: `${badge.paddingY}px ${badge.paddingX}px`,
    fontWeight: 600,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
}

function BadgePreview({ badge }: { badge: BadgeInput }) {
  return <span style={badgeStyle(badge)}>{badge.label || "Badge"}</span>;
}

const FIELD_NAMES: (keyof BadgeInput)[] = [
  "title",
  "label",
  "bgColor",
  "textColor",
  "borderRadius",
  "fontSize",
  "paddingX",
  "paddingY",
  "cssCustom",
];

// Polaris web components don't fire React synthetic change events, so read
// values straight off the elements.
function readForm(form: HTMLFormElement, fallback: BadgeInput): BadgeInput {
  const value = (name: keyof BadgeInput) =>
    (form.querySelector(`[name="${name}"]`) as { value?: string } | null)
      ?.value ?? String(fallback[name]);
  const int = (name: keyof BadgeInput) => {
    const parsed = Number.parseInt(value(name), 10);
    return Number.isNaN(parsed) ? (fallback[name] as number) : parsed;
  };

  return {
    title: value("title"),
    label: value("label"),
    bgColor: value("bgColor") || fallback.bgColor,
    textColor: value("textColor") || fallback.textColor,
    borderRadius: int("borderRadius"),
    fontSize: int("fontSize"),
    paddingX: int("paddingX"),
    paddingY: int("paddingY"),
    cssCustom: value("cssCustom"),
  };
}

function BadgeEditor({
  badge,
  saving,
  onSave,
  onCancel,
}: {
  badge: Badge | null;
  saving: boolean;
  onSave: (input: BadgeInput) => void;
  onCancel: () => void;
}) {
  const initial = badge ?? DEFAULT_BADGE;
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<BadgeInput>(initial);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const update = () => setPreview(readForm(form, initial));
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
    };
  }, [initial]);

  return (
    <s-section heading={badge ? `Edit “${badge.title}”` : "New badge"}>
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(readForm(event.currentTarget, initial));
        }}
      >
        <s-grid gridTemplateColumns="@container (inline-size > 640px) 2fr 1fr, 1fr" gap="large">
          <s-stack gap="base">
            <s-text-field
              name="title"
              label="Title"
              details="Internal name, not shown to shoppers"
              value={initial.title}
              required
            />
            <s-text-field
              name="label"
              label="Label"
              details="Text shown on the storefront"
              value={initial.label}
              maxLength={40}
              required
            />
            <s-stack direction="inline" gap="base">
              <s-color-field
                name="bgColor"
                label="Background color"
                value={initial.bgColor}
              />
              <s-color-field
                name="textColor"
                label="Text color"
                value={initial.textColor}
              />
            </s-stack>
            <s-stack direction="inline" gap="base">
              {(
                [
                  ["borderRadius", "Border radius"],
                  ["fontSize", "Font size"],
                  ["paddingX", "Horizontal padding"],
                  ["paddingY", "Vertical padding"],
                ] as const
              ).map(([name, label]) => (
                <s-number-field
                  key={name}
                  name={name}
                  label={label}
                  value={String(initial[name])}
                  min={NUMBER_LIMITS[name].min}
                  max={NUMBER_LIMITS[name].max}
                  step={1}
                  suffix="px"
                />
              ))}
            </s-stack>
            <s-text-area
              name="cssCustom"
              label="Custom CSS"
              details="CSS declarations applied to the badge on the storefront, e.g. text-transform: uppercase; letter-spacing: 0.05em;"
              value={initial.cssCustom}
              rows={3}
            />
          </s-stack>

          <s-box padding="large" background="subdued" borderRadius="base">
            <s-stack gap="base" alignItems="center">
              <s-text color="subdued">Live preview</s-text>
              <BadgePreview badge={preview} />
            </s-stack>
          </s-box>
        </s-grid>

        <s-box paddingBlockStart="base">
          <s-stack direction="inline" gap="base" justifyContent="end">
            <s-button onClick={onCancel}>Cancel</s-button>
            <s-button
              type="submit"
              variant="primary"
              {...(saving ? { loading: true } : {})}
            >
              Save badge
            </s-button>
          </s-stack>
        </s-box>
      </form>
    </s-section>
  );
}

export default function BadgesPage() {
  const { badges, shop, apiKey } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  // `undefined` = editor closed, `null` = creating a new badge.
  const [editing, setEditing] = useState<Badge | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Badge | null>(null);

  const busy = fetcher.state !== "idle";
  const submittingIntent = busy ? fetcher.formData?.get("intent") : null;

  useEffect(() => {
    const result = fetcher.data;
    if (!result || fetcher.state !== "idle") return;

    if (result.ok) {
      shopify.toast.show(result.message);
      if (result.intent === "save") setEditing(undefined);
    } else {
      shopify.toast.show(result.error, { isError: true });
    }
  }, [fetcher.data, fetcher.state, shopify]);

  const submit = (data: Record<string, string>) =>
    fetcher.submit(data, { method: "post" });

  const pickProducts = async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      action: "select",
    });
    return selection?.map((product) => product.id) ?? [];
  };

  const assign = async (badge: Badge) => {
    const productIds = await pickProducts();
    if (productIds.length === 0) return;
    submit({ intent: "assign", badgeId: badge.id, productIds: JSON.stringify(productIds) });
  };

  const unassign = async () => {
    const productIds = await pickProducts();
    if (productIds.length === 0) return;
    submit({ intent: "unassign", productIds: JSON.stringify(productIds) });
  };

  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?template=product&addAppBlockId=${apiKey}/badge&target=mainSection`;

  return (
    <s-page heading="Badges">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => setEditing(null)}
      >
        Create badge
      </s-button>
      <s-button slot="secondary-actions" onClick={unassign}>
        Remove badges from products
      </s-button>

      {editing !== undefined && (
        <BadgeEditor
          key={editing?.id ?? "new"}
          badge={editing}
          saving={submittingIntent === "save"}
          onCancel={() => setEditing(undefined)}
          onSave={(input) =>
            submit({
              intent: "save",
              badgeId: editing?.id ?? "",
              ...Object.fromEntries(
                FIELD_NAMES.map((name) => [name, String(input[name])]),
              ),
            })
          }
        />
      )}

      {badges.length === 0 ? (
        <s-section>
          <s-stack gap="base" alignItems="center">
            <s-heading>Create your first badge</s-heading>
            <s-paragraph>
              Design a badge like “New”, “Sale” or “Best seller”, then assign
              it to products.
            </s-paragraph>
            <s-button variant="primary" onClick={() => setEditing(null)}>
              Create badge
            </s-button>
          </s-stack>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header>Badge</s-table-header>
              <s-table-header>Title</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {badges.map((badge) => (
                <s-table-row key={badge.id}>
                  <s-table-cell>
                    <BadgePreview badge={badge} />
                  </s-table-cell>
                  <s-table-cell>{badge.title}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button variant="tertiary" onClick={() => setEditing(badge)}>
                        Edit
                      </s-button>
                      <s-button
                        variant="tertiary"
                        onClick={() => assign(badge)}
                        {...(busy ? { disabled: true } : {})}
                      >
                        Assign to products
                      </s-button>
                      <s-button
                        variant="tertiary"
                        tone="critical"
                        commandFor={DELETE_MODAL_ID}
                        command="--show"
                        onClick={() => setPendingDelete(badge)}
                      >
                        Delete
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section slot="aside" heading="Show badges on your store">
        <s-paragraph>
          Add the Badgify block to your product page in the theme editor.
          Badges render with Liquid only, so they don&apos;t slow down your
          store.
        </s-paragraph>
        <s-button href={themeEditorUrl} target="_blank">
          Open theme editor
        </s-button>
      </s-section>

      <s-modal id={DELETE_MODAL_ID} heading="Delete badge?">
        <s-paragraph>
          {pendingDelete
            ? `“${pendingDelete.title}” will be deleted and will stop showing on any products it's assigned to.`
            : ""}
        </s-paragraph>
        <s-button
          slot="primary-action"
          tone="critical"
          variant="primary"
          commandFor={DELETE_MODAL_ID}
          command="--hide"
          onClick={() => {
            if (pendingDelete) submit({ intent: "delete", badgeId: pendingDelete.id });
            setPendingDelete(null);
          }}
        >
          Delete
        </s-button>
        <s-button
          slot="secondary-actions"
          commandFor={DELETE_MODAL_ID}
          command="--hide"
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
