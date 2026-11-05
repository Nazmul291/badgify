import type { LoaderFunctionArgs } from "react-router";

import { authenticateWithBilling } from "../shopify.server";
import { listBadgeProducts } from "../services/badges.server";

// Resource route: products currently assigned to a badge, for the badge editor.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticateWithBilling(request);
  const badgeId = new URL(request.url).searchParams.get("id");

  if (!badgeId) return { products: [], hasMore: false };

  return listBadgeProducts(admin, badgeId);
};
