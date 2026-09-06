BEGIN TRY

BEGIN TRAN;

-- Modo de lista negra por cliente: AVISO (solo alerta en check-in) | BLOQUEO (impide el check-in).
ALTER TABLE [dbo].[Guest] ADD
  [blacklistMode] NVARCHAR(20) NOT NULL CONSTRAINT [Guest_blacklistMode_df] DEFAULT 'AVISO';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
