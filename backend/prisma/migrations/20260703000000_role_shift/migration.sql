BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[RoleShift] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [shift] NVARCHAR(1000) NOT NULL,
    [startTime] NVARCHAR(1000) NOT NULL,
    [endTime] NVARCHAR(1000) NOT NULL,
    [toleranceMinutes] INT NOT NULL CONSTRAINT [RoleShift_toleranceMinutes_df] DEFAULT 5,
    [daysOfWeek] NVARCHAR(1000) NOT NULL CONSTRAINT [RoleShift_daysOfWeek_df] DEFAULT '1,2,3,4,5,6,7',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [RoleShift_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoleShift_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RoleShift_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RoleShift_branchId_role_shift_key] UNIQUE NONCLUSTERED ([branchId],[role],[shift])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoleShift_branchId_idx] ON [dbo].[RoleShift]([branchId]);

-- AddForeignKey
ALTER TABLE [dbo].[RoleShift] ADD CONSTRAINT [RoleShift_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
