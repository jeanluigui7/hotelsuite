BEGIN TRY

BEGIN TRAN;

-- Snapshot histórico de comisión POS congelado AL COBRAR. Se guarda por pago para que la auditoría/
-- conciliación no dependa de la tasa vigente de Configuración Operativa (que solo aplica a pagos nuevos).
-- Columnas NULL en pagos existentes: no se reconstruyen con la tasa actual (dato desconocido).
ALTER TABLE [dbo].[Payment] ADD
  [commissionPct]    DECIMAL(6, 3)  NULL,
  [commissionAmount] DECIMAL(10, 2) NULL,
  [grossCharged]     DECIMAL(10, 2) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
