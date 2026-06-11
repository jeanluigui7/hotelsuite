BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[WifiCredential] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [ssid] NVARCHAR(1000) NOT NULL,
    [password] NVARCHAR(1000) NOT NULL,
    [voucher] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [WifiCredential_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WifiCredential_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WifiCredential_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WifiCredential_branchId_idx] ON [dbo].[WifiCredential]([branchId]);

-- AddForeignKey
ALTER TABLE [dbo].[WifiCredential] ADD CONSTRAINT [WifiCredential_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
