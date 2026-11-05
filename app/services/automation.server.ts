import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { withDefaults } from "../models/automation";
import type { AutomationSettings } from "../models/automation";
import { ShopifyUserErrors } from "./metafield-setup.server";

// App-data metafield on the app installation: hidden from the Shopify admin,
// writable only by this app, and readable by the theme block via `app.metafields`.
export const AUTOMATION_NAMESPACE = "badgify";
export const AUTOMATION_KEY = "automation";

const AUTOMATION_SETTINGS = `#graphql
  query BadgifyAutomationSettings($namespace: String!, $key: String!) {
    currentAppInstallation {
      id
      metafield(namespace: $namespace, key: $key) {
        jsonValue
      }
    }
  }`;

const SAVE_AUTOMATION_SETTINGS = `#graphql
  mutation BadgifySaveAutomationSettings($metafields: [MetafieldsSetInput!]!) {
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

async function readInstallation(admin: AdminApiContext) {
  const response = await admin.graphql(AUTOMATION_SETTINGS, {
    variables: { namespace: AUTOMATION_NAMESPACE, key: AUTOMATION_KEY },
  });
  const { data } = await response.json();
  return data!.currentAppInstallation;
}

export async function getAutomationSettings(
  admin: AdminApiContext,
): Promise<AutomationSettings> {
  const installation = await readInstallation(admin);
  return withDefaults(installation.metafield?.jsonValue);
}

export async function saveAutomationSettings(
  admin: AdminApiContext,
  settings: AutomationSettings,
) {
  const { id: ownerId } = await readInstallation(admin);
  const response = await admin.graphql(SAVE_AUTOMATION_SETTINGS, {
    variables: {
      metafields: [
        {
          ownerId,
          namespace: AUTOMATION_NAMESPACE,
          key: AUTOMATION_KEY,
          type: "json",
          value: JSON.stringify(settings),
        },
      ],
    },
  });
  const { data } = await response.json();
  const userErrors = data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) throw new ShopifyUserErrors(userErrors);
}
