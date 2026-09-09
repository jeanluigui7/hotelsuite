BEGIN TRY

BEGIN TRAN;

-- Enlace del movimiento de Kardex SALE con su venta, para restituir el stock al anular la venta
-- (turno actual = se elimina la salida; fuera del turno = ajuste positivo).
ALTER TABLE [dbo].[InventoryMovement] ADD [saleId] NVARCHAR(1000) NULL;

EXEC('CREATE NONCLUSTERED INDEX [InventoryMovement_saleId_idx] ON [dbo].[InventoryMovement]([saleId])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
