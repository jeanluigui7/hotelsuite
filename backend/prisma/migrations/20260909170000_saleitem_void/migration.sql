BEGIN TRY

BEGIN TRAN;

-- Anulación POR LÍNEA de una venta: se excluye de los totales válidos pero se conserva como ANULADA.
ALTER TABLE [dbo].[SaleItem] ADD
  [voided]         BIT           NOT NULL CONSTRAINT [SaleItem_voided_df] DEFAULT 0,
  [voidedAt]       DATETIME2      NULL,
  [voidedByUserId] NVARCHAR(1000) NULL,
  [voidReason]     NVARCHAR(500)  NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
