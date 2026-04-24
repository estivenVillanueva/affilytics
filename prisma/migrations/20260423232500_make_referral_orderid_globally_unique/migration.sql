-- Replace tenant-scoped order uniqueness with global order uniqueness
DROP INDEX IF EXISTS "Referral_shop_orderId_key";
CREATE UNIQUE INDEX "Referral_orderId_key" ON "Referral"("orderId");
