BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[SubWarehouseStock] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [subWarehouseId] NVARCHAR(1000) NOT NULL,
    [articleKind] NVARCHAR(1000) NOT NULL CONSTRAINT [SubWarehouseStock_articleKind_df] DEFAULT 'LINEN_REUSABLE',
    [name] NVARCHAR(1000) NOT NULL,
    [linenItemId] NVARCHAR(1000),
    [quantity] INT NOT NULL CONSTRAINT [SubWarehouseStock_quantity_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SubWarehouseStock_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SubWarehouseStock_subWarehouseId_articleKind_name_key] UNIQUE NONCLUSTERED ([subWarehouseId],[articleKind],[name])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SubWarehouseStock_branchId_idx] ON [dbo].[SubWarehouseStock]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SubWarehouseStock_subWarehouseId_idx] ON [dbo].[SubWarehouseStock]([subWarehouseId]);

-- AddForeignKey
ALTER TABLE [dbo].[SubWarehouseStock] ADD CONSTRAINT [SubWarehouseStock_subWarehouseId_fkey] FOREIGN KEY ([subWarehouseId]) REFERENCES [dbo].[SubWarehouse]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
