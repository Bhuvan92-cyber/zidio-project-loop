-- Remove the non-specification NEEDS_RETRY value while preserving failed records as NEW.
ALTER TYPE "FeedbackStatus" RENAME TO "FeedbackStatus_old";
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'ACTIONED');
ALTER TABLE "Feedback" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Feedback" ALTER COLUMN "status" TYPE "FeedbackStatus" USING (CASE WHEN "status"::text = 'NEEDS_RETRY' THEN 'NEW' ELSE "status"::text END::"FeedbackStatus");
DROP TYPE "FeedbackStatus_old";
ALTER TABLE "Feedback" ALTER COLUMN "status" SET DEFAULT 'NEW';
