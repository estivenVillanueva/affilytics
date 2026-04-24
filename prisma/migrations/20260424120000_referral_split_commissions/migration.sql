-- Split referral commission into app fee vs affiliate payout
ALTER TABLE "Referral" ADD COLUMN "appServiceFeeAmount" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Referral" ADD COLUMN "affiliatePayoutAmount" REAL NOT NULL DEFAULT 0;

UPDATE "Referral"
SET
  "appServiceFeeAmount" = COALESCE("commissionAmount", 0),
  "affiliatePayoutAmount" = 0
WHERE "appServiceFeeAmount" = 0 AND "affiliatePayoutAmount" = 0;
