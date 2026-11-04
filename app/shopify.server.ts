import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { ensureBadgeDefinitions } from "./services/metafield-setup.server";

export const MONTHLY_PLAN = "Standard Monthly";

// Development stores can only accept test charges.
export const BILLING_IS_TEST = process.env.NODE_ENV !== "production";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [MONTHLY_PLAN]: {
      trialDays: 7,
      lineItems: [
        {
          amount: 1,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  hooks: {
    afterAuth: async ({ admin, session }) => {
      // Don't block installation if setup fails — the badges page retries it.
      try {
        await ensureBadgeDefinitions(admin);
      } catch (error) {
        console.error(`Badge definition setup failed for ${session.shop}`, error);
      }
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

/**
 * Authenticates an admin request and requires an active subscription,
 * redirecting the merchant to the plan approval page when there is none.
 */
export async function authenticateWithBilling(request: Request) {
  const context = await shopify.authenticate.admin(request);

  await context.billing.require({
    plans: [MONTHLY_PLAN],
    isTest: BILLING_IS_TEST,
    onFailure: async () =>
      context.billing.request({ plan: MONTHLY_PLAN, isTest: BILLING_IS_TEST }),
  });

  return context;
}

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
