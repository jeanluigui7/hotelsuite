BEGIN TRY

BEGIN TRAN;

-- Kardex de productos: campos para ajustes trazables (Fase 1) y regularizaciones (Fase 2).
-- Todos NULL / aditivos: no altera ni recalcula movimientos existentes.
ALTER TABLE [dbo].[InventoryMovement] ADD
  [roomId]           NVARCHAR(1000) NULL,   -- habitación (reposición frigobar / ajuste por habitación)
  [cashSessionId]    NVARCHAR(1000) NULL,   -- turno de caja relacionado
  [approvedByUserId] NVARCHAR(1000) NULL,   -- usuario que aprueba (regularizaciones)
  [adjustType]       NVARCHAR(40)   NULL,   -- TRANSFER | SOBRANTE | VENCIDO | MERMA | FALTANTE | VENTA_NO_REGISTRADA | PERDIDA_COLABORADOR
  [refMovementId]    NVARCHAR(1000) NULL;   -- movimiento original al que regulariza

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
