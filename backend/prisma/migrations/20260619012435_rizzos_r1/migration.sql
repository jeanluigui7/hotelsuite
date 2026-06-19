BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Item] ADD [subcategory] NVARCHAR(1000);

-- AlterTable
ALTER TABLE [dbo].[Room] ADD [blocked] BIT NOT NULL CONSTRAINT [Room_blocked_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[Stay] ADD [balanceDue] DECIMAL(10,2),
[vehiclePlate] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[LinenItem] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [color] NVARCHAR(1000),
    [reusable] BIT NOT NULL CONSTRAINT [LinenItem_reusable_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [LinenItem_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LinenItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [LinenItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LinenStock] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [linenItemId] NVARCHAR(1000) NOT NULL,
    [floor] NVARCHAR(1000) NOT NULL,
    [rem] INT NOT NULL CONSTRAINT [LinenStock_rem_df] DEFAULT 0,
    [sum] INT NOT NULL CONSTRAINT [LinenStock_sum_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [LinenStock_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LinenStock_linenItemId_floor_key] UNIQUE NONCLUSTERED ([linenItemId],[floor])
);

-- CreateTable
CREATE TABLE [dbo].[LinenMovement] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [linenItemId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    [floor] NVARCHAR(1000),
    [roomId] NVARCHAR(1000),
    [areaFrom] NVARCHAR(1000),
    [areaTo] NVARCHAR(1000),
    [reference] NVARCHAR(1000),
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LinenMovement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LinenMovement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CleaningShift] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [shiftType] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [CleaningShift_status_df] DEFAULT 'OPEN',
    [laundrySent] BIT NOT NULL CONSTRAINT [CleaningShift_laundrySent_df] DEFAULT 0,
    [openedAt] DATETIME2 NOT NULL CONSTRAINT [CleaningShift_openedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [closedAt] DATETIME2,
    CONSTRAINT [CleaningShift_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LinenInspection] (
    [id] NVARCHAR(1000) NOT NULL,
    [taskId] NVARCHAR(1000) NOT NULL,
    [linenItemId] NVARCHAR(1000),
    [description] NVARCHAR(1000) NOT NULL,
    [state] NVARCHAR(1000) NOT NULL CONSTRAINT [LinenInspection_state_df] DEFAULT 'OK',
    [pickup] BIT NOT NULL CONSTRAINT [LinenInspection_pickup_df] DEFAULT 0,
    [note] NVARCHAR(1000),
    CONSTRAINT [LinenInspection_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RoomSupply] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000) NOT NULL,
    [stayId] NVARCHAR(1000),
    [description] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL CONSTRAINT [RoomSupply_quantity_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [RoomSupply_status_df] DEFAULT 'PENDING',
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoomSupply_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [deliveredAt] DATETIME2,
    CONSTRAINT [RoomSupply_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProductRequest] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ProductRequest_status_df] DEFAULT 'REQUESTED',
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ProductRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProductRequestItem] (
    [id] NVARCHAR(1000) NOT NULL,
    [requestId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    CONSTRAINT [ProductRequestItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StockWriteOff] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    [reason] NVARCHAR(1000) NOT NULL,
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockWriteOff_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StockWriteOff_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PrintJob] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [payload] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [PrintJob_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PrintJob_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PrintJob_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenItem_branchId_idx] ON [dbo].[LinenItem]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenItem_type_idx] ON [dbo].[LinenItem]([type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenStock_branchId_idx] ON [dbo].[LinenStock]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenMovement_branchId_idx] ON [dbo].[LinenMovement]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenMovement_linenItemId_idx] ON [dbo].[LinenMovement]([linenItemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CleaningShift_branchId_idx] ON [dbo].[CleaningShift]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CleaningShift_userId_idx] ON [dbo].[CleaningShift]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenInspection_taskId_idx] ON [dbo].[LinenInspection]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomSupply_branchId_idx] ON [dbo].[RoomSupply]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomSupply_roomId_idx] ON [dbo].[RoomSupply]([roomId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomSupply_status_idx] ON [dbo].[RoomSupply]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductRequest_branchId_idx] ON [dbo].[ProductRequest]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductRequest_status_idx] ON [dbo].[ProductRequest]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductRequestItem_requestId_idx] ON [dbo].[ProductRequestItem]([requestId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockWriteOff_branchId_idx] ON [dbo].[StockWriteOff]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PrintJob_branchId_idx] ON [dbo].[PrintJob]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PrintJob_status_idx] ON [dbo].[PrintJob]([status]);

-- AddForeignKey
ALTER TABLE [dbo].[LinenItem] ADD CONSTRAINT [LinenItem_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LinenStock] ADD CONSTRAINT [LinenStock_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LinenStock] ADD CONSTRAINT [LinenStock_linenItemId_fkey] FOREIGN KEY ([linenItemId]) REFERENCES [dbo].[LinenItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LinenMovement] ADD CONSTRAINT [LinenMovement_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LinenMovement] ADD CONSTRAINT [LinenMovement_linenItemId_fkey] FOREIGN KEY ([linenItemId]) REFERENCES [dbo].[LinenItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CleaningShift] ADD CONSTRAINT [CleaningShift_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LinenInspection] ADD CONSTRAINT [LinenInspection_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[HousekeepingTask]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LinenInspection] ADD CONSTRAINT [LinenInspection_linenItemId_fkey] FOREIGN KEY ([linenItemId]) REFERENCES [dbo].[LinenItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RoomSupply] ADD CONSTRAINT [RoomSupply_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ProductRequest] ADD CONSTRAINT [ProductRequest_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ProductRequestItem] ADD CONSTRAINT [ProductRequestItem_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ProductRequest]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[StockWriteOff] ADD CONSTRAINT [StockWriteOff_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PrintJob] ADD CONSTRAINT [PrintJob_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
