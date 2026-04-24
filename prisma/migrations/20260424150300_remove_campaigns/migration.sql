-- DropIndex
DROP INDEX "Campaign_affiliateId_idx";

-- DropIndex
DROP INDEX "Campaign_shop_idx";

-- DropIndex
DROP INDEX "Campaign_shop_slug_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Campaign";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Affiliate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "commissionRate" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Affiliate" ("code", "commissionRate", "createdAt", "id", "shop") SELECT "code", "commissionRate", "createdAt", "id", "shop" FROM "Affiliate";
DROP TABLE "Affiliate";
ALTER TABLE "new_Affiliate" RENAME TO "Affiliate";
CREATE INDEX "Affiliate_shop_idx" ON "Affiliate"("shop");
CREATE UNIQUE INDEX "Affiliate_shop_code_key" ON "Affiliate"("shop", "code");
CREATE TABLE "new_Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderAmount" REAL NOT NULL,
    "commissionAmount" REAL NOT NULL,
    "appServiceFeeAmount" REAL NOT NULL DEFAULT 0,
    "affiliatePayoutAmount" REAL NOT NULL DEFAULT 0,
    "billingStatus" TEXT NOT NULL DEFAULT 'FAILED',
    "conversionReport" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Referral" ("affiliateId", "affiliatePayoutAmount", "appServiceFeeAmount", "billingStatus", "commissionAmount", "conversionReport", "createdAt", "id", "orderAmount", "orderId", "shop") SELECT "affiliateId", "affiliatePayoutAmount", "appServiceFeeAmount", "billingStatus", "commissionAmount", "conversionReport", "createdAt", "id", "orderAmount", "orderId", "shop" FROM "Referral";
DROP TABLE "Referral";
ALTER TABLE "new_Referral" RENAME TO "Referral";
CREATE INDEX "Referral_affiliateId_idx" ON "Referral"("affiliateId");
CREATE INDEX "Referral_shop_idx" ON "Referral"("shop");
CREATE UNIQUE INDEX "Referral_shop_orderId_key" ON "Referral"("shop", "orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
