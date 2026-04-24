-- Multi-tenant safe uniqueness for referrals by shop
DROP INDEX IF EXISTS "Referral_orderId_key";
CREATE UNIQUE INDEX "Referral_shop_orderId_key" ON "Referral"("shop", "orderId");
