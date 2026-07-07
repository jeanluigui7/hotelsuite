BEGIN TRY

BEGIN TRAN;

-- Remapear los valores de tipo de categoría al nuevo estándar "Tipo de ítem".
UPDATE [dbo].[InventoryCategory] SET [type] = 'PRODUCT' WHERE [type] = 'PRODUCTS';
UPDATE [dbo].[InventoryCategory] SET [type] = 'AMENITY' WHERE [type] = 'AMENITIES';
UPDATE [dbo].[InventoryCategory] SET [type] = 'CLEANING_SUPPLY' WHERE [type] = 'CLEANING';
-- 'CLOTHING' se mantiene igual.

-- CreateTable: tamaños por categoría (solo Ropa).
CREATE TABLE [dbo].[CategorySize] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [categoryId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CategorySize_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CategorySize_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE INDEX [CategorySize_categoryId_name_key] ON [dbo].[CategorySize]([categoryId], [name]);
CREATE INDEX [CategorySize_categoryId_idx] ON [dbo].[CategorySize]([categoryId]);

ALTER TABLE [dbo].[CategorySize] ADD CONSTRAINT [CategorySize_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[InventoryCategory]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
