BEGIN TRY

BEGIN TRAN;

-- Dirección del cliente en el comprobante electrónico (opcional).
ALTER TABLE [dbo].[Invoice] ADD [customerAddress] NVARCHAR(300) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
