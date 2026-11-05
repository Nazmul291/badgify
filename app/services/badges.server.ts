import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  BADGE_KEY,
  BADGE_NAMESPACE,
  BADGE_TYPE,
  ShopifyUserErrors,
} from "./metafield-setup.server";
import { DEFAULT_BADGE } from "../models/badge";
import type { Badge, BadgeInput, BadgeProduct } from "../models/badge";

// metafieldsSet and metafieldsDelete accept at most 25 metafields per call.
const METAFIELD_BATCH_SIZE = 25;

const LIST_BADGES = `#graphql
  query BadgifyListBadges($type: String!) {
    metaobjects(type: $type, first: 100, sortKey: "updated_at", reverse: true) {
      nodes {
        id
        handle
        fields {
          key
          value
        }
      }
    }
  }`;

const CREATE_BADGE = `#graphql
  mutation BadgifyCreateBadge($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

const UPDATE_BADGE = `#graphql
  mutation BadgifyUpdateBadge($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

const DELETE_BADGE = `#graphql
  mutation BadgifyDeleteBadge($id: ID!) {
    metaobjectDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
        code
      }
    }
  }`;

const ASSIGN_BADGE = `#graphql
  mutation BadgifyAssignBadge($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;

const UNASSIGN_BADGE = `#graphql
  mutation BadgifyUnassignBadge($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields {
        ownerId
      }
      userErrors {
        field
        message
      }
    }
  }`;

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

function toBadge(node: {
  id: string;
  fields: { key: string; value: string | null }[];
}): Badge {
  const fields = Object.fromEntries(
    node.fields.map(({ key, value }) => [key, value ?? undefined]),
  );

  return {
    id: node.id,
    title: fields.title ?? "",
    label: fields.label ?? "",
    bgColor: fields.bg_color ?? DEFAULT_BADGE.bgColor,
    textColor: fields.text_color ?? DEFAULT_BADGE.textColor,
    borderRadius: toInt(fields.border_radius, DEFAULT_BADGE.borderRadius),
    fontSize: toInt(fields.font_size, DEFAULT_BADGE.fontSize),
    paddingX: toInt(fields.padding_x, DEFAULT_BADGE.paddingX),
    paddingY: toInt(fields.padding_y, DEFAULT_BADGE.paddingY),
    cssCustom: fields.css_custom ?? "",
  };
}

function toFields(badge: BadgeInput) {
  return [
    { key: "title", value: badge.title },
    { key: "label", value: badge.label },
    { key: "bg_color", value: badge.bgColor },
    { key: "text_color", value: badge.textColor },
    { key: "border_radius", value: String(badge.borderRadius) },
    { key: "font_size", value: String(badge.fontSize) },
    { key: "padding_x", value: String(badge.paddingX) },
    { key: "padding_y", value: String(badge.paddingY) },
    { key: "css_custom", value: badge.cssCustom },
  ];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function assertNoUserErrors(userErrors: { message: string }[] | undefined) {
  if (userErrors?.length) throw new ShopifyUserErrors(userErrors);
}

export async function listBadges(admin: AdminApiContext): Promise<Badge[]> {
  const response = await admin.graphql(LIST_BADGES, {
    variables: { type: BADGE_TYPE },
  });
  const { data } = await response.json();

  return (data?.metaobjects?.nodes ?? []).map(toBadge);
}

export async function saveBadge(
  admin: AdminApiContext,
  id: string | null,
  badge: BadgeInput,
): Promise<string> {
  const fields = toFields(badge);

  if (id) {
    const response = await admin.graphql(UPDATE_BADGE, {
      variables: { id, metaobject: { fields } },
    });
    const { data } = await response.json();
    assertNoUserErrors(data?.metaobjectUpdate?.userErrors);
    return data!.metaobjectUpdate!.metaobject!.id;
  }

  const response = await admin.graphql(CREATE_BADGE, {
    variables: { metaobject: { type: BADGE_TYPE, fields } },
  });
  const { data } = await response.json();
  assertNoUserErrors(data?.metaobjectCreate?.userErrors);
  return data!.metaobjectCreate!.metaobject!.id;
}

export async function deleteBadge(admin: AdminApiContext, id: string) {
  const response = await admin.graphql(DELETE_BADGE, { variables: { id } });
  const { data } = await response.json();
  assertNoUserErrors(data?.metaobjectDelete?.userErrors);
}

export async function assignBadge(
  admin: AdminApiContext,
  badgeId: string,
  productIds: string[],
) {
  for (const batch of chunk(productIds, METAFIELD_BATCH_SIZE)) {
    const response = await admin.graphql(ASSIGN_BADGE, {
      variables: {
        metafields: batch.map((ownerId) => ({
          ownerId,
          namespace: BADGE_NAMESPACE,
          key: BADGE_KEY,
          type: "metaobject_reference",
          value: badgeId,
        })),
      },
    });
    const { data } = await response.json();
    assertNoUserErrors(data?.metafieldsSet?.userErrors);
  }
}

export async function unassignBadge(admin: AdminApiContext, productIds: string[]) {
  for (const batch of chunk(productIds, METAFIELD_BATCH_SIZE)) {
    const response = await admin.graphql(UNASSIGN_BADGE, {
      variables: {
        metafields: batch.map((ownerId) => ({
          ownerId,
          namespace: BADGE_NAMESPACE,
          key: BADGE_KEY,
        })),
      },
    });
    const { data } = await response.json();
    assertNoUserErrors(data?.metafieldsDelete?.userErrors);
  }
}

const BADGE_PRODUCTS = `#graphql
  query BadgifyBadgeProducts($id: ID!) {
    metaobject(id: $id) {
      referencedBy(first: 250) {
        pageInfo {
          hasNextPage
        }
        nodes {
          namespace
          key
          referencer {
            ... on Product {
              id
              title
            }
          }
        }
      }
    }
  }`;

// The API returns the `$app:badgify` namespace resolved to `app--{appId}--badgify`.
const RESOLVED_BADGE_NAMESPACE = new RegExp(
  `^app--\\d+--${BADGE_NAMESPACE.replace("$app:", "")}$`,
);

/** Products whose `$app:badgify.active_badge` metafield points at this badge. */
export async function listBadgeProducts(
  admin: AdminApiContext,
  badgeId: string,
): Promise<{ products: BadgeProduct[]; hasMore: boolean }> {
  const response = await admin.graphql(BADGE_PRODUCTS, {
    variables: { id: badgeId },
  });
  const { data } = await response.json();
  const referencedBy = data?.metaobject?.referencedBy;

  const products = (referencedBy?.nodes ?? [])
    .filter(
      (node: { namespace: string; key: string; referencer: { id?: string } }) =>
        RESOLVED_BADGE_NAMESPACE.test(node.namespace) &&
        node.key === BADGE_KEY &&
        node.referencer?.id,
    )
    .map((node: { referencer: BadgeProduct }) => ({
      id: node.referencer.id,
      title: node.referencer.title,
    }));

  return { products, hasMore: referencedBy?.pageInfo.hasNextPage ?? false };
}
