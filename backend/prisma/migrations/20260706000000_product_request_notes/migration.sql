BEGIN TRY

BEGIN TRAN;

-- AlterTable: notas de la solicitud de productos
ALTER TABLE [dbo].[ProductRequest] ADD [notes] NVARCHAR(1000) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
