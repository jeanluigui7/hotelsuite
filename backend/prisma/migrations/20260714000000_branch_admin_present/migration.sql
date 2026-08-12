BEGIN TRY

BEGIN TRAN;

-- Administrador presente por sucursal: ON = cierre de caja con cuadre detallado;
-- OFF = cierre de caja ciego (recepción entrega el efectivo sin ver el cuadre).
ALTER TABLE [dbo].[Branch] ADD [adminPresent] BIT NOT NULL CONSTRAINT [Branch_adminPresent_df] DEFAULT 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
