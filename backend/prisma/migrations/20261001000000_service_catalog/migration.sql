BEGIN TRY

BEGIN TRAN;

IF OBJECT_ID(N'[dbo].[ServiceCategory]', N'U') IS NULL
CREATE TABLE [dbo].[ServiceCategory] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [sortOrder] INT NOT NULL CONSTRAINT [ServiceCategory_sortOrder_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ServiceCategory_status_df] DEFAULT 'active',
    [createdByUserId] NVARCHAR(1000),
    [updatedByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ServiceCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ServiceCategory_pkey] PRIMARY KEY CLUSTERED ([id])
);

IF OBJECT_ID(N'[dbo].[ServiceGroup]', N'U') IS NULL
CREATE TABLE [dbo].[ServiceGroup] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [categoryId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [sortOrder] INT NOT NULL CONSTRAINT [ServiceGroup_sortOrder_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ServiceGroup_status_df] DEFAULT 'active',
    [createdByUserId] NVARCHAR(1000),
    [updatedByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ServiceGroup_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ServiceGroup_pkey] PRIMARY KEY CLUSTERED ([id])
);

IF OBJECT_ID(N'[dbo].[ServiceConcept]', N'U') IS NULL
CREATE TABLE [dbo].[ServiceConcept] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [groupId] NVARCHAR(1000) NOT NULL,
    [code] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [price] DECIMAL(10,2) NOT NULL CONSTRAINT [ServiceConcept_price_df] DEFAULT 0,
    [unit] NVARCHAR(1000) NOT NULL CONSTRAINT [ServiceConcept_unit_df] DEFAULT 'UNIDAD',
    [sortOrder] INT NOT NULL CONSTRAINT [ServiceConcept_sortOrder_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ServiceConcept_status_df] DEFAULT 'active',
    [allowCourtesy] BIT NOT NULL CONSTRAINT [ServiceConcept_allowCourtesy_df] DEFAULT 0,
    [allowFreeAmount] BIT NOT NULL CONSTRAINT [ServiceConcept_allowFreeAmount_df] DEFAULT 0,
    [attentionMode] NVARCHAR(1000) NOT NULL CONSTRAINT [ServiceConcept_attentionMode_df] DEFAULT 'NONE',
    [productId] NVARCHAR(1000),
    [requiresDelivery] BIT NOT NULL CONSTRAINT [ServiceConcept_requiresDelivery_df] DEFAULT 0,
    [requiresReturn] BIT NOT NULL CONSTRAINT [ServiceConcept_requiresReturn_df] DEFAULT 0,
    [createdByUserId] NVARCHAR(1000),
    [updatedByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ServiceConcept_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ServiceConcept_pkey] PRIMARY KEY CLUSTERED ([id])
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceCategory_branchId_tipo_idx')
CREATE NONCLUSTERED INDEX [ServiceCategory_branchId_tipo_idx] ON [dbo].[ServiceCategory]([branchId], [tipo]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceGroup_branchId_idx')
CREATE NONCLUSTERED INDEX [ServiceGroup_branchId_idx] ON [dbo].[ServiceGroup]([branchId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceGroup_categoryId_idx')
CREATE NONCLUSTERED INDEX [ServiceGroup_categoryId_idx] ON [dbo].[ServiceGroup]([categoryId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConcept_branchId_idx')
CREATE NONCLUSTERED INDEX [ServiceConcept_branchId_idx] ON [dbo].[ServiceConcept]([branchId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConcept_groupId_idx')
CREATE NONCLUSTERED INDEX [ServiceConcept_groupId_idx] ON [dbo].[ServiceConcept]([groupId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConcept_productId_idx')
CREATE NONCLUSTERED INDEX [ServiceConcept_productId_idx] ON [dbo].[ServiceConcept]([productId]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ServiceConcept_branchId_code_key')
CREATE UNIQUE NONCLUSTERED INDEX [ServiceConcept_branchId_code_key] ON [dbo].[ServiceConcept]([branchId], [code]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceCategory_branchId_fkey')
ALTER TABLE [dbo].[ServiceCategory] ADD CONSTRAINT [ServiceCategory_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceGroup_branchId_fkey')
ALTER TABLE [dbo].[ServiceGroup] ADD CONSTRAINT [ServiceGroup_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceGroup_categoryId_fkey')
ALTER TABLE [dbo].[ServiceGroup] ADD CONSTRAINT [ServiceGroup_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[ServiceCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceConcept_branchId_fkey')
ALTER TABLE [dbo].[ServiceConcept] ADD CONSTRAINT [ServiceConcept_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceConcept_groupId_fkey')
ALTER TABLE [dbo].[ServiceConcept] ADD CONSTRAINT [ServiceConcept_groupId_fkey] FOREIGN KEY ([groupId]) REFERENCES [dbo].[ServiceGroup]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ServiceConcept_productId_fkey')
ALTER TABLE [dbo].[ServiceConcept] ADD CONSTRAINT [ServiceConcept_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
