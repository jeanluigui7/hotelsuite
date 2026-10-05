BEGIN TRY

BEGIN TRAN;

-- RoomSupply: reserva de ropa adicional (FASE 2)
IF COL_LENGTH('dbo.RoomSupply', 'conceptId') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [conceptId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'inventoryCategoryId') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [inventoryCategoryId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'linenItemId') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [linenItemId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'reservedQty') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [reservedQty] INT NOT NULL CONSTRAINT [RoomSupply_reservedQty_df] DEFAULT 0;
IF COL_LENGTH('dbo.RoomSupply', 'saleId') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [saleId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'courtesy') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [courtesy] BIT NOT NULL CONSTRAINT [RoomSupply_courtesy_df] DEFAULT 0;
IF COL_LENGTH('dbo.RoomSupply', 'courtesyReason') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [courtesyReason] NVARCHAR(1000) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'RoomSupply_inventoryCategoryId_idx')
CREATE NONCLUSTERED INDEX [RoomSupply_inventoryCategoryId_idx] ON [dbo].[RoomSupply]([inventoryCategoryId]);

-- Sale: token idempotente de operación
IF COL_LENGTH('dbo.Sale', 'opToken') IS NULL ALTER TABLE [dbo].[Sale] ADD [opToken] NVARCHAR(1000) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Sale_opToken_idx')
CREATE NONCLUSTERED INDEX [Sale_opToken_idx] ON [dbo].[Sale]([opToken]);

-- Único filtrado: un opToken por sucursal (ignora los nulos legados).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Sale_branchId_opToken_uq')
CREATE UNIQUE NONCLUSTERED INDEX [Sale_branchId_opToken_uq] ON [dbo].[Sale]([branchId], [opToken]) WHERE [opToken] IS NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
