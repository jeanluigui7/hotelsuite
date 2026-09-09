BEGIN TRY

BEGIN TRAN;

-- Estado de AUDITORÍA administrativa de la caja (independiente del estado operativo).
ALTER TABLE [dbo].[CashSession] ADD
  [auditStatus]      NVARCHAR(20)  NOT NULL CONSTRAINT [CashSession_auditStatus_df] DEFAULT 'PENDIENTE',
  [auditedByUserId]  NVARCHAR(1000) NULL,
  [auditedAt]        DATETIME2      NULL,
  [auditObservation] NVARCHAR(MAX)  NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
