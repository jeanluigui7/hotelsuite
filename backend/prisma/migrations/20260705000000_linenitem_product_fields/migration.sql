BEGIN TRY

BEGIN TRAN;

-- AlterTable: campos tipo producto para el almacén de ropa
ALTER TABLE [dbo].[LinenItem] ADD
  [code] NVARCHAR(1000) NULL,
  [barcode] NVARCHAR(1000) NULL,
  [imageUrl] NVARCHAR(max) NULL,
  [brand] NVARCHAR(1000) NULL,
  [categoryId] NVARCHAR(1000) NULL,
  [unit] NVARCHAR(1000) NOT NULL CONSTRAINT [LinenItem_unit_df] DEFAULT 'NIU',
  [igvType] NVARCHAR(1000) NOT NULL CONSTRAINT [LinenItem_igvType_df] DEFAULT 'GRAVADO',
  [igvPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [LinenItem_igvPercent_df] DEFAULT 18,
  [taxable] BIT NOT NULL CONSTRAINT [LinenItem_taxable_df] DEFAULT 1,
  [salePrice] DECIMAL(10,2) NOT NULL CONSTRAINT [LinenItem_salePrice_df] DEFAULT 0,
  [cost] DECIMAL(10,2) NOT NULL CONSTRAINT [LinenItem_cost_df] DEFAULT 0,
  [reorderPoint] INT NOT NULL CONSTRAINT [LinenItem_reorderPoint_df] DEFAULT 0,
  [receptionReorderPoint] INT NOT NULL CONSTRAINT [LinenItem_receptionReorderPoint_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
