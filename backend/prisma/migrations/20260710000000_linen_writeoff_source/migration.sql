BEGIN TRY

BEGIN TRAN;

-- AlterTable: origen de la baja (REM = remanente / SUM = suministrado en el turno).
ALTER TABLE [dbo].[LinenWriteoff] ADD [source] NVARCHAR(1000) NOT NULL CONSTRAINT [LinenWriteoff_source_df] DEFAULT 'REM';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
