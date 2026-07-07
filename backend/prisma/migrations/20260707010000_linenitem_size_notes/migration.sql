BEGIN TRY

BEGIN TRAN;

-- AlterTable: tamaño y observaciones del ítem de ropa.
ALTER TABLE [dbo].[LinenItem] ADD [size] NVARCHAR(60) NULL;
ALTER TABLE [dbo].[LinenItem] ADD [notes] NVARCHAR(MAX) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
