-- Redefine Affiliate for multi-tenant support
ALTER TABLE "Affiliate" ADD COLUMN "shop" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "Affiliate_code_key";
CREATE INDEX "Affiliate_shop_idx" ON "Affiliate"("shop");
CREATE UNIQUE INDEX "Affiliate_shop_code_key" ON "Affiliate"("shop", "code");

-- Redefine Referral for multi-tenant support
ALTER TABLE "Referral" ADD COLUMN "shop" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "Referral_orderId_key";
CREATE INDEX "Referral_shop_idx" ON "Referral"("shop");
CREATE UNIQUE INDEX "Referral_shop_orderId_key" ON "Referral"("shop", "orderId");
