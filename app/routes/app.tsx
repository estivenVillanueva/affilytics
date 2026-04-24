import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";

import "@shopify/polaris/build/esm/styles.css";
import "../styles/affilytics-admin.css";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";

import { AFFILIATE_USAGE_PLAN, authenticate } from "../shopify.server";

function logBillingFailure(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "errorData" in error &&
    (error as { errorData: unknown }).errorData != null
  ) {
    console.error(
      "Shopify billing errorData:",
      JSON.stringify((error as { errorData: unknown }).errorData, null, 2),
    );
  } else {
    console.error("Billing failure:", error);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const billingTest = process.env.SHOPIFY_BILLING_TEST !== "false";
  const appBase = (
    process.env.SHOPIFY_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/$/, "");

  /**
   * Billing needs Partner-approved `read_own_subscription_contracts` +
   * `write_own_subscription_contracts` on the app (see README).
   * Skip when: SHOPIFY_SKIP_BILLING=true, or dev unless SHOPIFY_REQUIRE_BILLING=true.
   */
  const isProduction = process.env.NODE_ENV === "production";
  const skipBilling =
    process.env.SHOPIFY_SKIP_BILLING === "true" ||
    (!isProduction && process.env.SHOPIFY_REQUIRE_BILLING !== "true");

  if (skipBilling) {
    console.warn(
      "[billing] Skipping require/request (no usage subscription). " +
        "Set SHOPIFY_REQUIRE_BILLING=true after Partner approves subscription scopes, " +
        "or keep SHOPIFY_SKIP_BILLING=true explicitly.",
    );
  } else {
    await billing.require({
      plans: [AFFILIATE_USAGE_PLAN],
      isTest: billingTest,
      onFailure: async (_billingError) =>
        billing
          .request({
            plan: AFFILIATE_USAGE_PLAN,
            isTest: billingTest,
            returnUrl: `${appBase}/app`,
          })
          .catch((error: unknown) => {
            if (error instanceof Response) {
              throw error;
            }
            logBillingFailure(error);
            throw error;
          }) as Promise<Response>,
    });
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={{}}>
        <s-app-nav>
          <s-link href="/app">Inicio</s-link>
          <s-link href="/app/affiliates">Afiliados</s-link>
          <s-link href="/app/campaigns">Campañas</s-link>
        </s-app-nav>
        <div className="affilytics-shell">
          <Outlet />
        </div>
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
