BEGIN TRY

BEGIN TRAN;

-- Nacionalidad y foto del documento físico (extranjeros: lineamiento de turismo).
ALTER TABLE [dbo].[Guest] ADD [nationality] NVARCHAR(120) NULL;
ALTER TABLE [dbo].[Guest] ADD [documentPhotoUrl] NVARCHAR(max) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
