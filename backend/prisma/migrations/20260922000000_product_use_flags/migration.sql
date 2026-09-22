BEGIN TRY

BEGIN TRAN;

-- Flag de uso RECEPCIÓN (independiente de "status"). Al CREARLO por primera vez, backfill:
-- todos los productos ACTIVOS quedan en Recepción = 1 (para no romper ventas/stock actuales).
-- El backfill corre solo aquí (una vez), no en re-ejecuciones, para no revertir cambios manuales.
IF COL_LENGTH('dbo.Product', 'receptionEnabled') IS NULL
BEGIN
    ALTER TABLE [dbo].[Product] ADD [receptionEnabled] BIT NOT NULL CONSTRAINT [Product_receptionEnabled_df] DEFAULT 0;
    EXEC('UPDATE [dbo].[Product] SET [receptionEnabled] = 1 WHERE [status] = ''active''');
END

-- Flag de uso FRIGOBAR: queda en 0 hasta que el usuario lo marque manualmente.
IF COL_LENGTH('dbo.Product', 'frigobarEnabled') IS NULL
    ALTER TABLE [dbo].[Product] ADD [frigobarEnabled] BIT NOT NULL CONSTRAINT [Product_frigobarEnabled_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
