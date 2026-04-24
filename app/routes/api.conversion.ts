import type { ActionFunctionArgs } from "react-router";
import { createReferralFromConversion } from "../services/conversion.server";
import {
  isConversionTimestampFresh,
  normalizeCampaignSlugForSignature,
  verifyConversionSignature,
} from "../services/conversion-signature.server";

type ConversionPayload = {
  shop?: unknown;
  orderId?: unknown;
  amount?: unknown;
  affiliateCode?: unknown;
  campaignSlug?: unknown;
  report?: unknown;
  timestamp?: unknown;
  signature?: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400, headers: corsHeaders });
}

function unauthorized(message = "Unauthorized") {
  return Response.json({ error: message }, { status: 401, headers: corsHeaders });
}

function normalizeShopDomain(shop: string) {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed.endsWith(".myshopify.com")) {
    return null;
  }
  return trimmed;
}

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key",
      },
    });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method.toUpperCase() !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  const signingSecret = process.env.CONVERSION_WEBHOOK_SECRET;
  if (!signingSecret) {
    console.error("CONVERSION_WEBHOOK_SECRET is not configured");
    return Response.json(
      { error: "Server misconfiguration" },
      { status: 500, headers: corsHeaders },
    );
  }

  const optionalApiKey = process.env.CONVERSION_API_KEY;
  const headerKey = request.headers.get("x-api-key");
  if (optionalApiKey) {
    if (!headerKey || headerKey !== optionalApiKey) {
      return unauthorized();
    }
  }

  try {
    const payload = (await request.json()) as ConversionPayload;

    if (typeof payload.shop !== "string") {
      return badRequest("shop must be a string");
    }
    const shop = normalizeShopDomain(payload.shop);
    if (!shop) {
      return badRequest("shop must be a valid myshopify.com domain");
    }

    if (typeof payload.orderId !== "string") {
      return badRequest("orderId must be a string");
    }
    const orderId = payload.orderId.trim();
    if (!orderId) {
      return badRequest("orderId is required");
    }

    const amount =
      typeof payload.amount === "number"
        ? payload.amount
        : Number(payload.amount);
    if (!Number.isFinite(amount)) {
      return badRequest("amount must be a valid number");
    }
    if (amount <= 0) {
      return badRequest("amount must be greater than 0");
    }

    if (typeof payload.timestamp !== "string" || !payload.timestamp.trim()) {
      return badRequest("timestamp is required");
    }
    const timestamp = payload.timestamp.trim();
    if (!isConversionTimestampFresh(timestamp)) {
      return unauthorized("Stale or invalid timestamp");
    }

    if (typeof payload.signature !== "string" || !payload.signature.trim()) {
      return badRequest("signature is required");
    }
    const signature = payload.signature.trim();

    const affiliateCode =
      typeof payload.affiliateCode === "string" && payload.affiliateCode.trim()
        ? payload.affiliateCode.trim()
        : null;

    const campaignSlugRaw =
      typeof payload.campaignSlug === "string" && payload.campaignSlug.trim()
        ? normalizeCampaignSlugForSignature(payload.campaignSlug)
        : null;

    const ok = verifyConversionSignature(
      signingSecret,
      shop,
      orderId,
      amount,
      timestamp,
      affiliateCode,
      campaignSlugRaw,
      signature,
    );
    if (!ok) {
      return unauthorized("Invalid signature");
    }

    let conversionReportJson: string | null = null;
    if (payload.report !== undefined && payload.report !== null) {
      if (typeof payload.report !== "object" || Array.isArray(payload.report)) {
        return badRequest("report must be a JSON object when provided");
      }
      try {
        conversionReportJson = JSON.stringify(payload.report);
      } catch {
        return badRequest("report must be serializable JSON");
      }
    }

    const result = await createReferralFromConversion({
      shop,
      orderId,
      amount,
      affiliateCode,
      campaignSlug: campaignSlugRaw,
      conversionReportJson,
    });

    if (result.reason === "already_processed") {
      return Response.json(
        { ok: true, message: "Already processed", result },
        { headers: corsHeaders },
      );
    }

    return Response.json({ ok: true, result }, { headers: corsHeaders });
  } catch (error) {
    console.error("Failed to process conversion", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
};
