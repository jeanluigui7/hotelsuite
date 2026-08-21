BEGIN TRY

BEGIN TRAN;

-- Campos adicionales del registro de movimiento de caja:
--   method    -> método de pago del ingreso (CASH | CARD | TRANSFER | YAPE | PLIN | WALLET). NULL = efectivo (legado).
--   reference -> N° de comprobante / referencia (opcional).
--   note      -> observación (opcional).
--   category  -> MOVEMENT (movimiento de caja) | EXTRAORDINARY (ingreso extraordinario). NULL = MOVEMENT (legado).
ALTER TABLE [dbo].[CashMovement] ADD
  [method]    NVARCHAR(20)  NULL,
  [reference] NVARCHAR(200) NULL,
  [note]      NVARCHAR(500) NULL,
  [category]  NVARCHAR(30)  NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
