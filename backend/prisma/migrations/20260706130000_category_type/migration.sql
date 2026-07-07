BEGIN TRY

BEGIN TRAN;

-- AlterTable: tipo/área de la categoría de inventario (Productos/Ropa/Limpieza/Amenities)
ALTER TABLE [dbo].[InventoryCategory] ADD [type] NVARCHAR(20) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
