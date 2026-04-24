-- Add billing status to referral records
ALTER TABLE "Referral" ADD COLUMN "billingStatus" TEXT NOT NULL DEFAULT 'FAILED';
