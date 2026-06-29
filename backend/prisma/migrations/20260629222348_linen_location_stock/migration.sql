BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[LinenLocationStock] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [location] NVARCHAR(1000) NOT NULL,
    [articleKind] NVARCHAR(1000) NOT NULL CONSTRAINT [LinenLocationStock_articleKind_df] DEFAULT 'LINEN_REUSABLE',
    [name] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL CONSTRAINT [LinenLocationStock_quantity_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [LinenLocationStock_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LinenLocationStock_branchId_location_articleKind_name_key] UNIQUE NONCLUSTERED ([branchId],[location],[articleKind],[name])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenLocationStock_branchId_idx] ON [dbo].[LinenLocationStock]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenLocationStock_location_idx] ON [dbo].[LinenLocationStock]([location]);

-- AddForeignKey
ALTER TABLE [dbo].[LinenLocationStock] ADD CONSTRAINT [LinenLocationStock_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
