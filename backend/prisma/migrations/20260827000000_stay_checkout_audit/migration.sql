BEGIN TRY

BEGIN TRAN;

-- Auditoría de check-out: quién realizó la salida y el cargo por demora aplicado (día hotelero).
-- Aditivos y nullable: estancias previas quedan en NULL y el historial las muestra como "—".
ALTER TABLE [dbo].[Stay] ADD [closedByUserId] NVARCHAR(1000) NULL, [lateCharge] DECIMAL(10,2) NULL;

EXEC('CREATE NONCLUSTERED INDEX [Stay_closedByUserId_idx] ON [dbo].[Stay]([closedByUserId])');
EXEC('CREATE NONCLUSTERED INDEX [Stay_checkOutAt_idx] ON [dbo].[Stay]([checkOutAt])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
