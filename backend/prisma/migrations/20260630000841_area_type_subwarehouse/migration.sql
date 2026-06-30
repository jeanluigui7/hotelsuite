BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Area] ADD [managesSubwarehouses] BIT NOT NULL CONSTRAINT [Area_managesSubwarehouses_df] DEFAULT 0,
[type] NVARCHAR(1000) NOT NULL CONSTRAINT [Area_type_df] DEFAULT 'LIMPIEZA';

-- AlterTable
ALTER TABLE [dbo].[Room] ADD [tower] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[SubWarehouse] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [areaId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [coverageType] NVARCHAR(1000) NOT NULL CONSTRAINT [SubWarehouse_coverageType_df] DEFAULT 'MANUAL',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [SubWarehouse_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SubWarehouse_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SubWarehouse_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SubWarehouseRoom] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [subWarehouseId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [SubWarehouseRoom_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [SubWarehouseRoom_subWarehouseId_roomId_key] UNIQUE NONCLUSTERED ([subWarehouseId],[roomId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SubWarehouse_branchId_idx] ON [dbo].[SubWarehouse]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SubWarehouse_areaId_idx] ON [dbo].[SubWarehouse]([areaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SubWarehouseRoom_subWarehouseId_idx] ON [dbo].[SubWarehouseRoom]([subWarehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SubWarehouseRoom_roomId_idx] ON [dbo].[SubWarehouseRoom]([roomId]);

-- AddForeignKey
ALTER TABLE [dbo].[SubWarehouse] ADD CONSTRAINT [SubWarehouse_areaId_fkey] FOREIGN KEY ([areaId]) REFERENCES [dbo].[Area]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SubWarehouseRoom] ADD CONSTRAINT [SubWarehouseRoom_subWarehouseId_fkey] FOREIGN KEY ([subWarehouseId]) REFERENCES [dbo].[SubWarehouse]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SubWarehouseRoom] ADD CONSTRAINT [SubWarehouseRoom_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[Room]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
