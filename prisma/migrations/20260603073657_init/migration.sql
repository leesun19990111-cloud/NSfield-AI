-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ModelKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('TOPUP', 'CHARGE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TopupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GenStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "topup_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance_krw" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount_krw" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topup_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_krw" INTEGER NOT NULL,
    "depositor_name" TEXT NOT NULL,
    "transferred_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "TopupStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "kind" "ModelKind" NOT NULL,
    "display_name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "margin_pct" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "pricing_json" JSONB NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "kind" "ModelKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "input_image_url" TEXT,
    "params_json" JSONB NOT NULL,
    "status" "GenStatus" NOT NULL DEFAULT 'PENDING',
    "external_job_id" TEXT,
    "last_polled_at" TIMESTAMP(3),
    "result_urls" TEXT[],
    "result_meta_json" JSONB,
    "cost_usd_raw" DECIMAL(65,30),
    "cost_usd_billed" DECIMAL(65,30),
    "margin_pct" DECIMAL(65,30),
    "fx_rate" DECIMAL(65,30),
    "charged_krw" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "failed_reason" TEXT,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "source" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_topup_code_key" ON "users"("topup_code");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "topup_requests_status_created_at_idx" ON "topup_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "generations_user_id_created_at_idx" ON "generations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "generations_status_kind_last_polled_at_idx" ON "generations"("status", "kind", "last_polled_at");

-- CreateIndex
CREATE INDEX "generations_expires_at_idx" ON "generations"("expires_at");

-- CreateIndex
CREATE INDEX "fx_rates_pair_fetched_at_idx" ON "fx_rates"("pair", "fetched_at" DESC);

-- CreateIndex
CREATE INDEX "admin_actions_admin_id_created_at_idx" ON "admin_actions"("admin_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_requests" ADD CONSTRAINT "topup_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
