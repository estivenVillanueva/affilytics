-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Campaign_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_shop_slug_key" ON "Campaign"("shop", "slug");

-- CreateIndex
CREATE INDEX "Campaign_shop_idx" ON "Campaign"("shop");

-- CreateIndex
CREATE INDEX "Campaign_affiliateId_idx" ON "Campaign"("affiliateId");

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "campaignId" TEXT,
    "orderId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderAmount" REAL NOT NULL,
    "commissionAmount" REAL NOT NULL,
    "appServiceFeeAmount" REAL NOT NULL DEFAULT 0,
    "affiliatePayoutAmount" REAL NOT NULL DEFAULT 0,
    "billingStatus" TEXT NOT NULL DEFAULT 'FAILED',
    "conversionReport" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Referral_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Referral" ("id", "affiliateId", "campaignId", "orderId", "shop", "orderAmount", "commissionAmount", "appServiceFeeAmount", "affiliatePayoutAmount", "billingStatus", "conversionReport", "createdAt") SELECT "id", "affiliateId", NULL, "orderId", "shop", "orderAmount", "commissionAmount", "appServiceFeeAmount", "affiliatePayoutAmount", "billingStatus", NULL, "createdAt" FROM "Referral";
DROP TABLE "Referral";
ALTER TABLE "new_Referral" RENAME TO "Referral";
CREATE INDEX "Referral_affiliateId_idx" ON "Referral"("affiliateId");
CREATE INDEX "Referral_shop_idx" ON "Referral"("shop");
CREATE INDEX "Referral_campaignId_idx" ON "Referral"("campaignId");
CREATE UNIQUE INDEX "Referral_shop_orderId_key" ON "Referral"("shop", "orderId");
PRAGMA foreign_keys=ON;
