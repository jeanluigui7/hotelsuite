BEGIN TRY

BEGIN TRAN;

-- Persiste el conteo por denominaciones del cierre (JSON) para poder reobtener/reimprimir el
-- ticket de caja ciega después (aunque no haya papel o el admin no esté al cierre del turno).
ALTER TABLE [dbo].[CashSession] ADD [closingDenominations] NVARCHAR(MAX) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
