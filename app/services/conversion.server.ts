import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

/** Fixed 5% infrastructure / service fee (Shopify usage billing) */
const APP_SERVICE_FEE_RATE = 0.05;

type AdminApiClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type UsageRecordResult = {
  success: boolean;
  error?: string;
};

const BILLING_MAX_RETRIES = 3;
const BILLING_INITIAL_BACKOFF_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAdminClient(shop: string): Promise<AdminApiClient | null> {
  if (!shop) {
    return null;
  }

  const { admin } = await unauthenticated.admin(shop);
  return admin as AdminApiClient;
}

async function getShopCurrencyCode(admin: AdminApiClient): Promise<string> {
  const response = await admin.graphql(
    `#graphql
      query ShopCurrencyCode {
        shop {
          currencyCode
        }
      }`,
  );
  const data = await response.json();
  return data?.data?.shop?.currencyCode ?? "USD";
}

async function getSubscriptionLineItemId(
  admin: AdminApiClient,
): Promise<string | null> {
  const response = await admin.graphql(
    `#graphql
      query getActiveSubscriptionLineItem {
        currentAppInstallation {
          activeSubscriptions {
            lineItems {
              id
            }
          }
        }
      }`,
  );

  const data = await response.json();
  return (
    data?.data?.currentAppInstallation?.activeSubscriptions?.[0]?.lineItems?.[0]
      ?.id ?? null
  );
}

async function graphqlWithRetry(
  admin: AdminApiClient,
  query: string,
  options: { variables?: Record<string, unknown> },
  context: { shop: string; orderId: string; operation: string },
) {
  let attempt = 0;
  let backoffMs = BILLING_INITIAL_BACKOFF_MS;
  let lastError: unknown;

  while (attempt < BILLING_MAX_RETRIES) {
    attempt += 1;
    try {
      const response = await admin.graphql(query, options);
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} while calling ${context.operation}`,
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      console.error("Billing GraphQL attempt failed", {
        operation: context.operation,
        shop: context.shop,
        orderId: context.orderId,
        attempt,
        maxRetries: BILLING_MAX_RETRIES,
        error,
      });

      if (attempt >= BILLING_MAX_RETRIES) {
        break;
      }

      await sleep(backoffMs);
      backoffMs *= 2;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Unknown ${context.operation} failure`);
}

export async function createUsageRecord({
  shop,
  orderId,
  appServiceFeeAmount,
}: {
  shop: string;
  orderId: string;
  appServiceFeeAmount: number;
}): Promise<UsageRecordResult> {
  try {
    const admin = await getAdminClient(shop);
    if (!admin) {
      return { success: false, error: "No offline session found" };
    }

    const subscriptionLineItemId = await getSubscriptionLineItemId(admin);
    if (!subscriptionLineItemId) {
      return {
        success: false,
        error: "No active subscription line item found",
      };
    }

    const currencyCode = await getShopCurrencyCode(admin);

    const response = await graphqlWithRetry(
      admin,
      `#graphql
        mutation createAppUsageRecord(
          $subscriptionLineItemId: ID!
          $description: String!
          $price: MoneyInput!
        ) {
          appUsageRecordCreate(
            subscriptionLineItemId: $subscriptionLineItemId
            description: $description
            price: $price
          ) {
            appUsageRecord {
              id
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          subscriptionLineItemId,
          description: `Commission for order ${orderId}`,
          price: {
            amount: appServiceFeeAmount.toFixed(2),
            currencyCode,
          },
        },
      },
      { shop, orderId, operation: "appUsageRecordCreate" },
    );

    const responseJson = await response.json();
    const userErrors =
      responseJson?.data?.appUsageRecordCreate?.userErrors ?? [];
    if (userErrors.length > 0) {
      console.error("Shopify appUsageRecordCreate userErrors", {
        orderId,
        shop,
        userErrors,
      });
      return {
        success: false,
        error: userErrors[0]?.message ?? "Unknown billing error",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Shopify appUsageRecordCreate failed", {
      orderId,
      shop,
      error,
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown usage record error",
    };
  }
}

const MAX_CONVERSION_REPORT_CHARS = 12_000;

export async function createReferralFromConversion({
  shop,
  orderId,
  amount,
  affiliateCode,
  campaignSlug,
  conversionReportJson,
}: {
  shop: string;
  orderId: string;
  amount: number;
  affiliateCode: string | null;
  campaignSlug: string | null;
  conversionReportJson: string | null;
}) {
  if (!affiliateCode) {
    return { saved: false, reason: "missing_affiliate_code" as const };
  }

  const existingReferral = await prisma.referral.findFirst({
    where: { shop, orderId },
    select: { id: true },
  });
  if (existingReferral) {
    console.info(`Duplicate conversion ignored for orderId: ${orderId}`);
    return {
      saved: false,
      reason: "already_processed" as const,
      message: "Already processed",
    };
  }

  const affiliate = await prisma.affiliate.findFirst({
    where: { shop, code: affiliateCode },
    select: { id: true, commissionRate: true },
  });

  if (!affiliate) {
    return { saved: false, reason: "affiliate_not_found" as const };
  }

  let campaignId: string | null = null;
  if (campaignSlug && campaignSlug.trim()) {
    const campaign = await prisma.campaign.findFirst({
      where: {
        shop,
        slug: campaignSlug.trim().toLowerCase(),
        active: true,
      },
      select: { id: true, affiliateId: true },
    });
    if (!campaign) {
      return { saved: false, reason: "campaign_not_found" as const };
    }
    if (campaign.affiliateId !== affiliate.id) {
      return { saved: false, reason: "campaign_affiliate_mismatch" as const };
    }
    campaignId = campaign.id;
  }

  const conversionReport =
    conversionReportJson && conversionReportJson.length > MAX_CONVERSION_REPORT_CHARS
      ? conversionReportJson.slice(0, MAX_CONVERSION_REPORT_CHARS)
      : conversionReportJson;

  const appServiceFeeAmount = amount * APP_SERVICE_FEE_RATE;
  const affiliatePayoutAmount = amount * (affiliate.commissionRate / 100);

  try {
    const referral = await prisma.referral.create({
      data: {
        affiliateId: affiliate.id,
        campaignId,
        shop,
        orderId,
        orderAmount: amount,
        commissionAmount: appServiceFeeAmount,
        appServiceFeeAmount,
        affiliatePayoutAmount,
        billingStatus: "FAILED",
        conversionReport,
      },
    });

    const usageRecord = await createUsageRecord({
      shop,
      orderId,
      appServiceFeeAmount,
    });
    if (usageRecord.success) {
      await prisma.referral.updateMany({
        where: { id: referral.id, shop },
        data: { billingStatus: "SUCCESS" },
      });
    }

    return {
      saved: true,
      referralId: referral.id,
      appServiceFeeAmount,
      affiliatePayoutAmount,
      billingStatus: usageRecord.success ? "SUCCESS" : "FAILED",
      usageRecord,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      console.info(`Duplicate conversion ignored for orderId: ${orderId}`);
      return {
        saved: false,
        reason: "already_processed" as const,
        message: "Already processed",
      };
    }
    throw error;
  }
}
