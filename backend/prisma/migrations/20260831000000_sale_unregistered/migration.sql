BEGIN TRY

BEGIN TRAN;

-- Etapa 3: venta no registrada (regularización desde Kardex) marcada sobre la propia venta.
ALTER TABLE [dbo].[Sale] ADD
  [unregistered] BIT          NOT NULL CONSTRAINT [Sale_unregistered_df] DEFAULT 0,
  [verifyStatus] NVARCHAR(20) NULL;

-- Índice para filtrar rápido las ventas no registradas (regularizaciones).
EXEC('CREATE NONCLUSTERED INDEX [Sale_unregistered_idx] ON [dbo].[Sale]([branchId], [unregistered])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
