BEGIN TRY

BEGIN TRAN;

-- Tipo de intervención de la tarea de limpieza: CHECKOUT (salida) o RENOVACION (durante estadía).
ALTER TABLE [dbo].[HousekeepingTask] ADD [type] NVARCHAR(1000) NOT NULL CONSTRAINT [HousekeepingTask_type_df] DEFAULT 'CHECKOUT';

-- Contador de limpiezas de renovación completadas en la estancia (progreso done/allowed).
ALTER TABLE [dbo].[Stay] ADD [renewalCleaningDone] INT NOT NULL CONSTRAINT [Stay_renewalCleaningDone_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
