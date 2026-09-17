/*
  Warnings:

  - The primary key for the `FeedbackTheme` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[id,workspaceId]` on the table `Feedback` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,workspaceId]` on the table `Theme` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id,workspaceId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `workspaceId` to the `FeedbackTheme` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "FeedbackTheme" DROP CONSTRAINT "FeedbackTheme_feedbackId_fkey";

-- DropForeignKey
ALTER TABLE "FeedbackTheme" DROP CONSTRAINT "FeedbackTheme_themeId_fkey";

-- DropForeignKey
ALTER TABLE "Report" DROP CONSTRAINT "Report_generatedBy_fkey";

-- AlterTable
ALTER TABLE "FeedbackTheme" DROP CONSTRAINT "FeedbackTheme_pkey",
ADD COLUMN     "workspaceId" TEXT;

-- Backfill relation ownership before enforcing the required tenant key.
UPDATE "FeedbackTheme" AS "feedbackTheme"
SET "workspaceId" = "feedback"."workspaceId"
FROM "Feedback" AS "feedback"
WHERE "feedback"."id" = "feedbackTheme"."feedbackId";

ALTER TABLE "FeedbackTheme"
ALTER COLUMN "workspaceId" SET NOT NULL,
ADD CONSTRAINT "FeedbackTheme_pkey" PRIMARY KEY ("workspaceId", "feedbackId", "themeId");

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_id_workspaceId_key" ON "Feedback"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_id_workspaceId_key" ON "Theme"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_workspaceId_key" ON "User"("id", "workspaceId");

-- AddForeignKey
ALTER TABLE "FeedbackTheme" ADD CONSTRAINT "FeedbackTheme_feedbackId_workspaceId_fkey" FOREIGN KEY ("feedbackId", "workspaceId") REFERENCES "Feedback"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTheme" ADD CONSTRAINT "FeedbackTheme_themeId_workspaceId_fkey" FOREIGN KEY ("themeId", "workspaceId") REFERENCES "Theme"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generatedBy_workspaceId_fkey" FOREIGN KEY ("generatedBy", "workspaceId") REFERENCES "User"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;
