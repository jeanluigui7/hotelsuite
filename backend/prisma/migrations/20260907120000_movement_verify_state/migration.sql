BEGIN TRY

BEGIN TRAN;

-- Auditoría de medios virtuales sobre INGRESOS de caja (un ingreso por Yape/Plin/etc. se concilia
-- por código igual que un pago de venta).
ALTER TABLE [dbo].[CashMovement] ADD
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
