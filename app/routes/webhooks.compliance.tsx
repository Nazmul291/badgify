import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Mandatory privacy compliance webhooks.
 *
 * Badgify stores no customer data: badges live in the merchant's metaobjects
 * and the only database table is Session. So customer requests need no action,
 * and shop/redact only has to remove the shop's sessions.
 *
 * `authenticate.webhook` verifies the HMAC and responds 401 to invalid requests.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // No customer data is stored.
      break;
    case "SHOP_REDACT":
      await db.session.deleteMany({ where: { shop } });
      break;
  }

  return new Response();
};
