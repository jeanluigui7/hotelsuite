BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ShiftLog] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [shift] NVARCHAR(1000) NOT NULL,
    [businessDate] NVARCHAR(1000) NOT NULL,
    [closedAt] DATETIME2 NOT NULL CONSTRAINT [ShiftLog_closedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [closedByUserId] NVARCHAR(1000),
    [auto] BIT NOT NULL CONSTRAINT [ShiftLog_auto_df] DEFAULT 0,
    [snapshot] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ShiftLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ShiftLog_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ShiftLog_branchId_role_shift_businessDate_key] UNIQUE NONCLUSTERED ([branchId],[role],[shift],[businessDate])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ShiftLog_branchId_idx] ON [dbo].[ShiftLog]([branchId]);

-- AddForeignKey
ALTER TABLE [dbo].[ShiftLog] ADD CONSTRAINT [ShiftLog_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
