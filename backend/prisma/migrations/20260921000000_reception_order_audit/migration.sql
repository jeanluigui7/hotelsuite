BEGIN TRY

BEGIN TRAN;

-- Auditoría del flujo de solicitud de productos de recepción (solicitar → despachar → aceptar/rechazar).
-- Columnas nullable añadidas de forma idempotente (no rompen filas existentes).
IF COL_LENGTH('dbo.ProductRequest', 'requestedByUserId') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [requestedByUserId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.ProductRequest', 'requestedAt') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [requestedAt] DATETIME2 NULL;
IF COL_LENGTH('dbo.ProductRequest', 'dispatchedByUserId') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [dispatchedByUserId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.ProductRequest', 'sentAt') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [sentAt] DATETIME2 NULL;
IF COL_LENGTH('dbo.ProductRequest', 'receivedByUserId') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [receivedByUserId] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.ProductRequest', 'receivedAt') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [receivedAt] DATETIME2 NULL;
IF COL_LENGTH('dbo.ProductRequest', 'rejectReason') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [rejectReason] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.ProductRequest', 'rejectNote') IS NULL
    ALTER TABLE [dbo].[ProductRequest] ADD [rejectNote] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.ProductRequestItem', 'requestedQty') IS NULL
    ALTER TABLE [dbo].[ProductRequestItem] ADD [requestedQty] INT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
