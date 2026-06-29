BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[RoomTypeDotacion] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomTypeId] NVARCHAR(1000) NOT NULL,
    [category] NVARCHAR(1000),
    [articleKind] NVARCHAR(1000) NOT NULL CONSTRAINT [RoomTypeDotacion_articleKind_df] DEFAULT 'LINEN_REUSABLE',
    [name] NVARCHAR(1000) NOT NULL,
    [linenItemId] NVARCHAR(1000),
    [productId] NVARCHAR(1000),
    [baseQty] INT NOT NULL CONSTRAINT [RoomTypeDotacion_baseQty_df] DEFAULT 1,
    [required] BIT NOT NULL CONSTRAINT [RoomTypeDotacion_required_df] DEFAULT 0,
    [allowExtra] BIT NOT NULL CONSTRAINT [RoomTypeDotacion_allowExtra_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [RoomTypeDotacion_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoomTypeDotacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RoomTypeDotacion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RoomInventory] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000) NOT NULL,
    [articleKind] NVARCHAR(1000) NOT NULL CONSTRAINT [RoomInventory_articleKind_df] DEFAULT 'LINEN_REUSABLE',
    [name] NVARCHAR(1000) NOT NULL,
    [linenItemId] NVARCHAR(1000),
    [productId] NVARCHAR(1000),
    [quantity] INT NOT NULL CONSTRAINT [RoomInventory_quantity_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoomInventory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RoomInventory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RoomInventory_roomId_articleKind_name_key] UNIQUE NONCLUSTERED ([roomId],[articleKind],[name])
);

-- CreateTable
CREATE TABLE [dbo].[RoomInventoryMovement] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000),
    [type] NVARCHAR(1000) NOT NULL,
    [articleKind] NVARCHAR(1000) NOT NULL CONSTRAINT [RoomInventoryMovement_articleKind_df] DEFAULT 'LINEN_REUSABLE',
    [name] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    [fromLocation] NVARCHAR(1000),
    [toLocation] NVARCHAR(1000),
    [reference] NVARCHAR(1000),
    [note] NVARCHAR(1000),
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoomInventoryMovement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RoomInventoryMovement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomTypeDotacion_branchId_idx] ON [dbo].[RoomTypeDotacion]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomTypeDotacion_roomTypeId_idx] ON [dbo].[RoomTypeDotacion]([roomTypeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomInventory_branchId_idx] ON [dbo].[RoomInventory]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomInventory_roomId_idx] ON [dbo].[RoomInventory]([roomId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomInventoryMovement_branchId_idx] ON [dbo].[RoomInventoryMovement]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomInventoryMovement_roomId_idx] ON [dbo].[RoomInventoryMovement]([roomId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomInventoryMovement_type_idx] ON [dbo].[RoomInventoryMovement]([type]);

-- AddForeignKey
ALTER TABLE [dbo].[RoomTypeDotacion] ADD CONSTRAINT [RoomTypeDotacion_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RoomTypeDotacion] ADD CONSTRAINT [RoomTypeDotacion_roomTypeId_fkey] FOREIGN KEY ([roomTypeId]) REFERENCES [dbo].[RoomType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RoomInventory] ADD CONSTRAINT [RoomInventory_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RoomInventory] ADD CONSTRAINT [RoomInventory_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[Room]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RoomInventoryMovement] ADD CONSTRAINT [RoomInventoryMovement_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RoomInventoryMovement] ADD CONSTRAINT [RoomInventoryMovement_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[Room]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
