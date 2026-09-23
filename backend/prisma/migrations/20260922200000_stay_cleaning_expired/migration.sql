BEGIN TRY

BEGIN TRAN;

-- Limpiezas de renovación vencidas (no solicitadas), marcadas automáticamente al pasar su día.
IF COL_LENGTH('dbo.Stay', 'renewalCleaningExpired') IS NULL
    ALTER TABLE [dbo].[Stay] ADD [renewalCleaningExpired] INT NOT NULL CONSTRAINT [Stay_renewalCleaningExpired_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
