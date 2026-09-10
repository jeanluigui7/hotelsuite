BEGIN TRY

BEGIN TRAN;

-- 1 producto → N códigos de barras. Tabla ProductBarcode con code ÚNICO GLOBAL
-- (un mismo EAN no puede pertenecer a dos productos).
IF OBJECT_ID('[dbo].[ProductBarcode]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ProductBarcode] (
        [id]        NVARCHAR(1000) NOT NULL,
        [productId] NVARCHAR(1000) NOT NULL,
        [code]      NVARCHAR(1000) NOT NULL,
        [createdAt] DATETIME2      NOT NULL CONSTRAINT [ProductBarcode_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ProductBarcode_pkey]     PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [ProductBarcode_code_key] UNIQUE NONCLUSTERED ([code])
    );
    CREATE NONCLUSTERED INDEX [ProductBarcode_productId_idx] ON [dbo].[ProductBarcode]([productId]);
    ALTER TABLE [dbo].[ProductBarcode] ADD CONSTRAINT [ProductBarcode_productId_fkey]
        FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
END

-- Migrar los códigos ya existentes (Product.barcode) a la nueva tabla. Si un mismo código
-- estuviera repetido en varios productos (índice anterior era por sucursal), se conserva solo
-- el del producto con id menor para respetar la unicidad global; el resto se descarta.
INSERT INTO [dbo].[ProductBarcode] ([id], [productId], [code], [createdAt])
SELECT NEWID(), p.[id], p.[barcode], SYSUTCDATETIME()
FROM [dbo].[Product] p
WHERE p.[barcode] IS NOT NULL
  AND LTRIM(RTRIM(p.[barcode])) <> ''
  AND NOT EXISTS (SELECT 1 FROM [dbo].[ProductBarcode] b WHERE b.[code] = p.[barcode])
  AND NOT EXISTS (SELECT 1 FROM [dbo].[Product] p2 WHERE p2.[barcode] = p.[barcode] AND p2.[id] < p.[id]);

-- Ya no se usa el índice único por sucursal sobre Product.barcode (los códigos viven en ProductBarcode).
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Product_branch_barcode' AND object_id = OBJECT_ID('[dbo].[Product]'))
    DROP INDEX [UX_Product_branch_barcode] ON [dbo].[Product];

-- La columna Product.barcode queda como legacy: se vacía para que ProductBarcode sea la única fuente.
UPDATE [dbo].[Product] SET [barcode] = NULL WHERE [barcode] IS NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
