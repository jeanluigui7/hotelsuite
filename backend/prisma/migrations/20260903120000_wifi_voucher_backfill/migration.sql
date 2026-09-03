BEGIN TRY

BEGIN TRAN;

-- Consolidación al modelo Omada: el único valor entregado al huésped es el VOUCHER (columna Code).
-- Los cupones existentes tenían un `code` aleatorio y el valor real en `password`; se copia el valor
-- real a `code` y `voucher` para que el ticket imprima el voucher correcto. `password` se conserva
-- por compatibilidad de esquema (columna NOT NULL), pero ya no se usa en la app.
UPDATE [dbo].[WifiCredential]
SET [code] = [password], [voucher] = [password]
WHERE [password] IS NOT NULL AND ([code] IS NULL OR [code] <> [password]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
