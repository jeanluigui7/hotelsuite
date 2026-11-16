BEGIN TRY

BEGIN TRAN;

IF OBJECT_ID(N'[dbo].[FaultType]', N'U') IS NULL
CREATE TABLE [dbo].[FaultType] (
    [id] NVARCHAR(1000) NOT NULL,
    [category] NVARCHAR(1000) NOT NULL,
    [categoryLabel] NVARCHAR(1000) NOT NULL,
    [label] NVARCHAR(1000) NOT NULL,
    [severity] NVARCHAR(1000) NOT NULL CONSTRAINT [FaultType_severity_df] DEFAULT 'LEVE',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [FaultType_status_df] DEFAULT 'active',
    [sortOrder] INT NOT NULL CONSTRAINT [FaultType_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FaultType_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [FaultType_pkey] PRIMARY KEY CLUSTERED ([id])
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'FaultType_category_idx' AND object_id = OBJECT_ID(N'[dbo].[FaultType]'))
CREATE NONCLUSTERED INDEX [FaultType_category_idx] ON [dbo].[FaultType]([category]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
