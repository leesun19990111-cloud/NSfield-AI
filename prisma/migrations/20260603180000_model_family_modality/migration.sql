-- AlterTable
ALTER TABLE "models"
  ADD COLUMN "family" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "modality" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "atlas_model" TEXT NOT NULL DEFAULT '';
