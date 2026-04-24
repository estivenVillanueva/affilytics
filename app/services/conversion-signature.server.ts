import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

/** Normalized affiliate code for HMAC (must match pixel). */
export function normalizeAffiliateCodeForSignature(code: string | null | undefined) {
  return (code ?? "").trim();
}

/** Normalized campaign slug for HMAC (must match pixel). */
export function normalizeCampaignSlugForSignature(slug: string | null | undefined) {
  return (slug ?? "").trim().toLowerCase();
}

/**
 * Canonical signed string. Includes affiliate + campaign so the body cannot be
 * tampered after signing (v1 only signed shop|order|amount|time).
 */
export function buildSignedPayload(
  shop: string,
  orderId: string,
  amount: number,
  timestamp: string,
  affiliateCode: string,
  campaignSlug: string,
) {
  const amountKey = Number(amount).toFixed(2);
  const aff = normalizeAffiliateCodeForSignature(affiliateCode);
  const camp = normalizeCampaignSlugForSignature(campaignSlug);
  return `${shop}|${orderId}|${amountKey}|${timestamp}|${aff}|${camp}`;
}

export function signConversionPayload(
  secret: string,
  shop: string,
  orderId: string,
  amount: number,
  timestamp: string,
  affiliateCode: string,
  campaignSlug: string,
) {
  const payload = buildSignedPayload(
    shop,
    orderId,
    amount,
    timestamp,
    affiliateCode,
    campaignSlug,
  );
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualHex(expectedHex: string, signatureHex: string) {
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(signatureHex, "hex");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyConversionSignature(
  secret: string,
  shop: string,
  orderId: string,
  amount: number,
  timestamp: string,
  affiliateCode: string | null,
  campaignSlug: string | null,
  signatureHex: string,
) {
  if (!secret || !signatureHex) {
    return false;
  }
  const aff = normalizeAffiliateCodeForSignature(affiliateCode);
  const camp = normalizeCampaignSlugForSignature(campaignSlug);
  const expected = signConversionPayload(
    secret,
    shop,
    orderId,
    amount,
    timestamp,
    aff,
    camp,
  );
  return timingSafeEqualHex(expected, signatureHex);
}

export function isConversionTimestampFresh(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return Math.abs(Date.now() - parsed) <= MAX_CLOCK_SKEW_MS;
}
