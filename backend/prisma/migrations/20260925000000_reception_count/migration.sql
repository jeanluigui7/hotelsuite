BEGIN TRY

BEGIN TRAN;

IF OBJECT_ID(N'[dbo].[ReceptionCount]', N'U') IS NULL
CREATE TABLE [dbo].[ReceptionCount] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [businessDate] NVARCHAR(1000) NOT NULL,
    [shift] NVARCHAR(1000) NOT NULL,
    [countedByUserId] NVARCHAR(1000),
    [startedAt] DATETIME2,
    [finishedAt] DATETIME2 NOT NULL CONSTRAINT [ReceptionCount_finishedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [auditObservation] NVARCHAR(MAX),
    [auditStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [ReceptionCount_auditStatus_df] DEFAULT 'PENDIENTE',
    [auditReviewedByUserId] NVARCHAR(1000),
    [auditReviewedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ReceptionCount_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ReceptionCount_pkey] PRIMARY KEY CLUSTERED ([id])
);

IF OBJECT_ID(N'[dbo].[ReceptionCountLine]', N'U') IS NULL
CREATE TABLE [dbo].[ReceptionCountLine] (
    [id] NVARCHAR(1000) NOT NULL,
    [countId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [counted] INT NOT NULL,
    CONSTRAINT [ReceptionCountLine_pkey] PRIMARY KEY CLUSTERED ([id])
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ReceptionCount_branchId_businessDate_shift_idx')
CREATE NONCLUSTERED INDEX [ReceptionCount_branchId_businessDate_shift_idx] ON [dbo].[ReceptionCount]([branchId], [businessDate], [shift]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ReceptionCountLine_countId_idx')
CREATE NONCLUSTERED INDEX [ReceptionCountLine_countId_idx] ON [dbo].[ReceptionCountLine]([countId]);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'ReceptionCountLine_countId_fkey')
ALTER TABLE [dbo].[ReceptionCountLine] ADD CONSTRAINT [ReceptionCountLine_countId_fkey] FOREIGN KEY ([countId]) REFERENCES [dbo].[ReceptionCount]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
