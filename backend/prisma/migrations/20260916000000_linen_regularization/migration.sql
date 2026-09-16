BEGIN TRY

BEGIN TRAN;

-- Solicitud de regularización de stock REM de ropa por piso (housekeeping → aprobación admin).
IF OBJECT_ID('[dbo].[LinenRegularization]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[LinenRegularization] (
        [id]                NVARCHAR(1000) NOT NULL,
        [branchId]          NVARCHAR(1000) NOT NULL,
        [floor]             NVARCHAR(1000) NOT NULL,
        [shift]             NVARCHAR(20)   NOT NULL,
        [shiftWindowStart]  DATETIME2      NOT NULL,
        [status]            NVARCHAR(20)   NOT NULL CONSTRAINT [LinenRegularization_status_df] DEFAULT 'PENDING',
        [requestedByUserId] NVARCHAR(1000) NOT NULL,
        [reviewedByUserId]  NVARCHAR(1000) NULL,
        [reviewedAt]        DATETIME2      NULL,
        [reviewNote]        NVARCHAR(MAX)  NULL,
        [createdAt]         DATETIME2      NOT NULL CONSTRAINT [LinenRegularization_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [LinenRegularization_pkey] PRIMARY KEY CLUSTERED ([id])
    );
    ALTER TABLE [dbo].[LinenRegularization] ADD CONSTRAINT [LinenRegularization_branchId_fkey]
        FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
END

IF OBJECT_ID('[dbo].[LinenRegularizationLine]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[LinenRegularizationLine] (
        [id]               NVARCHAR(1000) NOT NULL,
        [regularizationId] NVARCHAR(1000) NOT NULL,
        [linenItemId]      NVARCHAR(1000) NOT NULL,
        [systemQty]        INT            NOT NULL,
        [requestedQty]     INT            NOT NULL,
        [diff]             INT            NOT NULL,
        CONSTRAINT [LinenRegularizationLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
    ALTER TABLE [dbo].[LinenRegularizationLine] ADD CONSTRAINT [LinenRegularizationLine_regularizationId_fkey]
        FOREIGN KEY ([regularizationId]) REFERENCES [dbo].[LinenRegularization]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE [dbo].[LinenRegularizationLine] ADD CONSTRAINT [LinenRegularizationLine_linenItemId_fkey]
        FOREIGN KEY ([linenItemId]) REFERENCES [dbo].[LinenItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
END

COMMIT TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'LinenRegularization_branchId_idx' AND object_id = OBJECT_ID('[dbo].[LinenRegularization]'))
    EXEC('CREATE NONCLUSTERED INDEX [LinenRegularization_branchId_idx] ON [dbo].[LinenRegularization]([branchId])');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'LinenRegularization_status_idx' AND object_id = OBJECT_ID('[dbo].[LinenRegularization]'))
    EXEC('CREATE NONCLUSTERED INDEX [LinenRegularization_status_idx] ON [dbo].[LinenRegularization]([status])');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'LinenRegularizationLine_regularizationId_idx' AND object_id = OBJECT_ID('[dbo].[LinenRegularizationLine]'))
    EXEC('CREATE NONCLUSTERED INDEX [LinenRegularizationLine_regularizationId_idx] ON [dbo].[LinenRegularizationLine]([regularizationId])');

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
