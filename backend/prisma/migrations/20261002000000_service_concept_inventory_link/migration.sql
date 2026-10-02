BEGIN TRY

BEGIN TRAN;

IF COL_LENGTH('dbo.ServiceConcept', 'inventoryOrigin') IS NULL
ALTER TABLE [dbo].[ServiceConcept] ADD [inventoryOrigin] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.ServiceConcept', 'inventoryCategoryId') IS NULL
ALTER TABLE [dbo].[ServiceConcept] ADD [inventoryCategoryId] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.ServiceConcept', 'articleScope') IS NULL
ALTER TABLE [dbo].[ServiceConcept] ADD [articleScope] NVARCHAR(1000) NOT NULL CONSTRAINT [ServiceConcept_articleScope_df] DEFAULT 'ALL';

IF COL_LENGTH('dbo.ServiceConcept', 'linkNeedsReview') IS NULL
ALTER TABLE [dbo].[ServiceConcept] ADD [linkNeedsReview] BIT NOT NULL CONSTRAINT [ServiceConcept_linkNeedsReview_df] DEFAULT 0;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConcept_inventoryCategoryId_idx')
CREATE NONCLUSTERED INDEX [ServiceConcept_inventoryCategoryId_idx] ON [dbo].[ServiceConcept]([inventoryCategoryId]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceConcept_inventoryCategoryId_fkey')
ALTER TABLE [dbo].[ServiceConcept] ADD CONSTRAINT [ServiceConcept_inventoryCategoryId_fkey] FOREIGN KEY ([inventoryCategoryId]) REFERENCES [dbo].[InventoryCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF OBJECT_ID(N'[dbo].[ServiceConceptArticle]', N'U') IS NULL
CREATE TABLE [dbo].[ServiceConceptArticle] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [conceptId] NVARCHAR(1000) NOT NULL,
    [articleId] NVARCHAR(1000) NOT NULL,
    [price] DECIMAL(10,2),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ServiceConceptArticle_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ServiceConceptArticle_pkey] PRIMARY KEY CLUSTERED ([id])
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConceptArticle_conceptId_articleId_key')
CREATE UNIQUE NONCLUSTERED INDEX [ServiceConceptArticle_conceptId_articleId_key] ON [dbo].[ServiceConceptArticle]([conceptId], [articleId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConceptArticle_conceptId_idx')
CREATE NONCLUSTERED INDEX [ServiceConceptArticle_conceptId_idx] ON [dbo].[ServiceConceptArticle]([conceptId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConceptArticle_branchId_idx')
CREATE NONCLUSTERED INDEX [ServiceConceptArticle_branchId_idx] ON [dbo].[ServiceConceptArticle]([branchId]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceConceptArticle_conceptId_fkey')
ALTER TABLE [dbo].[ServiceConceptArticle] ADD CONSTRAINT [ServiceConceptArticle_conceptId_fkey] FOREIGN KEY ([conceptId]) REFERENCES [dbo].[ServiceConcept]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
