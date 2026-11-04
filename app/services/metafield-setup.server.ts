import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

export const BADGE_TYPE = "badge_definition";
export const BADGE_NAMESPACE = "custom_badges";
export const BADGE_KEY = "active_badge";

interface UserError {
  field?: string[] | null;
  message: string;
  code?: string | null;
}

export class ShopifyUserErrors extends Error {
  constructor(public userErrors: UserError[]) {
    super(userErrors.map((error) => error.message).join("; "));
    this.name = "ShopifyUserErrors";
  }
}

const integerField = (key: string, name: string, min: number, max: number) => ({
  key,
  name,
  type: "number_integer",
  validations: [
    { name: "min", value: String(min) },
    { name: "max", value: String(max) },
  ],
});

const BADGE_FIELD_DEFINITIONS = [
  { key: "title", name: "Title", type: "single_line_text_field", required: true },
  { key: "label", name: "Label", type: "single_line_text_field", required: true },
  { key: "bg_color", name: "Background color", type: "color" },
  { key: "text_color", name: "Text color", type: "color" },
  integerField("border_radius", "Border radius (px)", 0, 999),
  integerField("font_size", "Font size (px)", 8, 72),
  integerField("padding_x", "Horizontal padding (px)", 0, 64),
  integerField("padding_y", "Vertical padding (px)", 0, 64),
  { key: "css_custom", name: "Custom CSS", type: "multi_line_text_field" },
];

const DEFINITIONS_QUERY = `#graphql
  query BadgifyDefinitions($type: String!, $namespace: String!, $key: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
    }
    metafieldDefinitions(first: 1, ownerType: PRODUCT, namespace: $namespace, key: $key) {
      nodes {
        id
      }
    }
  }`;

const CREATE_METAOBJECT_DEFINITION = `#graphql
  mutation BadgifyCreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

const CREATE_METAFIELD_DEFINITION = `#graphql
  mutation BadgifyCreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

interface DefinitionsState {
  metaobjectDefinitionId: string | null;
  metafieldDefinitionId: string | null;
}

async function readDefinitions(admin: AdminApiContext): Promise<DefinitionsState> {
  const response = await admin.graphql(DEFINITIONS_QUERY, {
    variables: { type: BADGE_TYPE, namespace: BADGE_NAMESPACE, key: BADGE_KEY },
  });
  const { data } = await response.json();

  return {
    metaobjectDefinitionId: data?.metaobjectDefinitionByType?.id ?? null,
    metafieldDefinitionId: data?.metafieldDefinitions?.nodes[0]?.id ?? null,
  };
}

async function createMetaobjectDefinition(admin: AdminApiContext) {
  const response = await admin.graphql(CREATE_METAOBJECT_DEFINITION, {
    variables: {
      definition: {
        name: "Badge",
        type: BADGE_TYPE,
        displayNameKey: "title",
        access: { storefront: "PUBLIC_READ" },
        fieldDefinitions: BADGE_FIELD_DEFINITIONS,
      },
    },
  });
  const { data } = await response.json();
  const result = data?.metaobjectDefinitionCreate;

  if (result?.metaobjectDefinition) return result.metaobjectDefinition.id;

  // A concurrent request may have created it first.
  const { metaobjectDefinitionId } = await readDefinitions(admin);
  if (metaobjectDefinitionId) return metaobjectDefinitionId;

  throw new ShopifyUserErrors(result?.userErrors ?? []);
}

async function createMetafieldDefinition(
  admin: AdminApiContext,
  metaobjectDefinitionId: string,
) {
  const response = await admin.graphql(CREATE_METAFIELD_DEFINITION, {
    variables: {
      definition: {
        name: "Active badge",
        description: "Badge shown on this product by Badgify",
        namespace: BADGE_NAMESPACE,
        key: BADGE_KEY,
        ownerType: "PRODUCT",
        type: "metaobject_reference",
        access: { storefront: "PUBLIC_READ" },
        validations: [
          { name: "metaobject_definition_id", value: metaobjectDefinitionId },
        ],
      },
    },
  });
  const { data } = await response.json();
  const result = data?.metafieldDefinitionCreate;

  if (result?.createdDefinition) return result.createdDefinition.id;

  const { metafieldDefinitionId } = await readDefinitions(admin);
  if (metafieldDefinitionId) return metafieldDefinitionId;

  throw new ShopifyUserErrors(result?.userErrors ?? []);
}

/**
 * Idempotently creates the `badge_definition` metaobject definition and the
 * `custom_badges.active_badge` product metafield definition. Existing
 * definitions are left untouched, so this is safe to call on every load.
 */
export async function ensureBadgeDefinitions(
  admin: AdminApiContext,
): Promise<{ metaobjectDefinitionId: string; metafieldDefinitionId: string }> {
  const existing = await readDefinitions(admin);

  const metaobjectDefinitionId =
    existing.metaobjectDefinitionId ?? (await createMetaobjectDefinition(admin));

  const metafieldDefinitionId =
    existing.metafieldDefinitionId ??
    (await createMetafieldDefinition(admin, metaobjectDefinitionId));

  return { metaobjectDefinitionId, metafieldDefinitionId };
}
