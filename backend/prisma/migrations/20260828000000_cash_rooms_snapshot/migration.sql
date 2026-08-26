BEGIN TRY

BEGIN TRAN;

-- Fotografía histórica del turno: habitaciones disponibles (FREE) en el momento en que se abre la caja.
-- Aditivo y nullable: cajas ya abiertas quedan en NULL (el Dashboard muestra "—"); a partir de ahora se graba.
ALTER TABLE [dbo].[CashSession] ADD [roomsAvailableAtOpen] INT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
