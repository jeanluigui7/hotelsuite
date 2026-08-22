BEGIN TRY

BEGIN TRAN;

-- FOLIO DE ESTANCIA (Etapa 1): identidad permanente de la ocupación.
--   folioCode     -> correlativo legible por sucursal (ej. FE-00042). NULL en estancias previas.
--   reservationId -> reserva que originó la estancia (trazabilidad reserva → folio). NULL si walk-in.
-- Ambos aditivos y nullable: no alteran estancias existentes ni los flujos actuales.
ALTER TABLE [dbo].[Stay] ADD [folioCode] NVARCHAR(30) NULL, [reservationId] NVARCHAR(1000) NULL;

-- El índice se crea en un lote hijo (EXEC) para que la columna recién agregada sea visible.
EXEC('CREATE NONCLUSTERED INDEX [Stay_folioCode_idx] ON [dbo].[Stay]([folioCode])');
EXEC('CREATE NONCLUSTERED INDEX [Stay_reservationId_idx] ON [dbo].[Stay]([reservationId])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
