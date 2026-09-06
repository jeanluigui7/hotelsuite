BEGIN TRY

BEGIN TRAN;

-- Auditoría de medios de pago virtuales: estado de verificación del código de operación.
ALTER TABLE [dbo].[Payment] ADD
  [verifyState]      NVARCHAR(20)   NULL,
  [verifiedByUserId] NVARCHAR(1000) NULL,
  [verifiedAt]       DATETIME2      NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
