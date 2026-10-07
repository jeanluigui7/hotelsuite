BEGIN TRY

BEGIN TRAN;

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('dbo.RoomSupply', 'saleItemId') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [saleItemId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'deliveredByUserId') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [deliveredByUserId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'deliveredJson') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [deliveredJson] NVARCHAR(MAX) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'rejectedByUserId') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [rejectedByUserId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'rejectedReason') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [rejectedReason] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.RoomSupply', 'rejectedAt') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [rejectedAt] DATETIME2 NULL;
IF COL_LENGTH('dbo.RoomSupply', 'refundAmount') IS NULL ALTER TABLE [dbo].[RoomSupply] ADD [refundAmount] DECIMAL(10,2) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
