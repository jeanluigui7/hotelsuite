BEGIN TRY

BEGIN TRAN;

-- Etapa 1 auditoría: soft-anular de movimientos de caja (se conserva el registro; excluido de totales).
ALTER TABLE [dbo].[CashMovement] ADD
  [voided]         BIT           NOT NULL CONSTRAINT [CashMovement_voided_df] DEFAULT 0,
  [voidedAt]       DATETIME2     NULL,
  [voidedByUserId] NVARCHAR(1000) NULL,
  [voidReason]     NVARCHAR(300) NULL;

-- Huella de auditoría de intervenciones posteriores sobre una caja.
CREATE TABLE [dbo].[CashIntervention] (
  [id]              NVARCHAR(1000) NOT NULL,
  [branchId]        NVARCHAR(1000) NOT NULL,
  [cashSessionId]   NVARCHAR(1000) NOT NULL,
  [type]            NVARCHAR(30)   NOT NULL,
  [targetKind]      NVARCHAR(20)   NOT NULL,
  [targetId]        NVARCHAR(1000) NULL,
  [beforeJson]      NVARCHAR(MAX)  NULL,
  [afterJson]       NVARCHAR(MAX)  NULL,
  [reason]          NVARCHAR(500)  NULL,
  [createdByUserId] NVARCHAR(1000) NULL,
  [createdAt]       DATETIME2      NOT NULL CONSTRAINT [CashIntervention_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [CashIntervention_pkey] PRIMARY KEY CLUSTERED ([id])
);

ALTER TABLE [dbo].[CashIntervention]
  ADD CONSTRAINT [CashIntervention_branchId_fkey] FOREIGN KEY ([branchId])
  REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE NONCLUSTERED INDEX [CashIntervention_branchId_idx] ON [dbo].[CashIntervention]([branchId]);
CREATE NONCLUSTERED INDEX [CashIntervention_cashSessionId_idx] ON [dbo].[CashIntervention]([cashSessionId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
