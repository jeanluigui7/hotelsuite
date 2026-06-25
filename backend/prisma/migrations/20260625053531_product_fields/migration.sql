BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Product] ADD [barcode] NVARCHAR(1000),
[brand] NVARCHAR(1000),
[igvPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [Product_igvPercent_df] DEFAULT 18,
[igvType] NVARCHAR(1000) NOT NULL CONSTRAINT [Product_igvType_df] DEFAULT 'GRAVADO',
[imageUrl] NVARCHAR(max),
[productType] NVARCHAR(1000) NOT NULL CONSTRAINT [Product_productType_df] DEFAULT 'PRODUCTO',
[receptionReorderPoint] INT NOT NULL CONSTRAINT [Product_receptionReorderPoint_df] DEFAULT 0,
[reusable] BIT NOT NULL CONSTRAINT [Product_reusable_df] DEFAULT 0,
[taxable] BIT NOT NULL CONSTRAINT [Product_taxable_df] DEFAULT 1,
[unit] NVARCHAR(1000) NOT NULL CONSTRAINT [Product_unit_df] DEFAULT 'NIU';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
