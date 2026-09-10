BEGIN TRY

BEGIN TRAN;

-- Código de barras ÚNICO por sucursal (segunda protección; la validación de negocio en
-- products.service da el mensaje claro). Índice FILTRADO (WHERE barcode IS NOT NULL) porque
-- SQL Server solo admite un NULL en un índice único normal, y muchos productos no tienen código.
-- Defensivo: no se crea si ya existen duplicados heredados (evita romper el deploy); en ese
-- caso la unicidad la garantiza el service hasta que se limpien los duplicados a mano.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Product_branch_barcode' AND object_id = OBJECT_ID('[dbo].[Product]')
)
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[Product]
    WHERE [barcode] IS NOT NULL
    GROUP BY [branchId], [barcode]
    HAVING COUNT(*) > 1
)
BEGIN
    EXEC('CREATE UNIQUE INDEX [UX_Product_branch_barcode] ON [dbo].[Product]([branchId],[barcode]) WHERE [barcode] IS NOT NULL');
END

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
