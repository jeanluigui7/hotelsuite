BEGIN TRY

BEGIN TRAN;

-- Regularizaciones posteriores a un cierre de caja CONFIRMADO (no lo editan ni lo reabren).
-- Conservan la diferencia original del turno y registran cómo se concilia:
--   VENTA_NO_REGISTRADA  → explica un SOBRANTE (afecta la diferencia de caja pendiente).
--   PERDIDA_COLABORADOR  → producto entregado sin cobrar (NO mueve caja; affectsCash = 0).
CREATE TABLE [dbo].[CashReconciliation] (
  [id]               NVARCHAR(1000) NOT NULL,
  [branchId]         NVARCHAR(1000) NOT NULL,
  [cashSessionId]    NVARCHAR(1000) NOT NULL,
  [type]             NVARCHAR(40)   NOT NULL,
  [amount]           DECIMAL(10,2)  NOT NULL,
  [affectsCash]      BIT            NOT NULL CONSTRAINT [CashReconciliation_affectsCash_df] DEFAULT 0,
  [productId]        NVARCHAR(1000) NULL,
  [quantity]         INT            NULL,
  [movementId]       NVARCHAR(1000) NULL,
  [note]             NVARCHAR(500)  NULL,
  [createdByUserId]  NVARCHAR(1000) NULL,
  [approvedByUserId] NVARCHAR(1000) NULL,
  [createdAt]        DATETIME2      NOT NULL CONSTRAINT [CashReconciliation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [CashReconciliation_pkey] PRIMARY KEY CLUSTERED ([id])
);

ALTER TABLE [dbo].[CashReconciliation]
  ADD CONSTRAINT [CashReconciliation_branchId_fkey] FOREIGN KEY ([branchId])
  REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE NONCLUSTERED INDEX [CashReconciliation_branchId_idx] ON [dbo].[CashReconciliation]([branchId]);
CREATE NONCLUSTERED INDEX [CashReconciliation_cashSessionId_idx] ON [dbo].[CashReconciliation]([cashSessionId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
