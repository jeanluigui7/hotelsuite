BEGIN TRY

BEGIN TRAN;

-- Etapa 4 (facturación por concepto): trazabilidad directa del comprobante a la estancia y al
-- folio maestro (ambos aditivos y nullable; masterFolioId se llenará cuando exista Folio Maestro).
ALTER TABLE [dbo].[Invoice] ADD [stayId] NVARCHAR(1000) NULL, [masterFolioId] NVARCHAR(1000) NULL;

EXEC('CREATE NONCLUSTERED INDEX [Invoice_stayId_idx] ON [dbo].[Invoice]([stayId])');
EXEC('CREATE NONCLUSTERED INDEX [Invoice_masterFolioId_idx] ON [dbo].[Invoice]([masterFolioId])');

-- InvoiceLine: puente comprobante ↔ línea de origen. Habilita facturación parcial / selectiva /
-- multi-estancia sin romper el vínculo actual Invoice.saleId (1:1). saleItemId/stayId son
-- referencias planas (sin FK) para evitar rutas de cascada múltiples en SQL Server.
CREATE TABLE [dbo].[InvoiceLine] (
  [id]          NVARCHAR(1000) NOT NULL,
  [branchId]    NVARCHAR(1000) NOT NULL,
  [invoiceId]   NVARCHAR(1000) NOT NULL,
  [saleItemId]  NVARCHAR(1000) NULL,
  [stayId]      NVARCHAR(1000) NULL,
  [concept]     NVARCHAR(30)   NULL,
  [description] NVARCHAR(300)  NOT NULL,
  [quantity]    INT            NOT NULL CONSTRAINT [InvoiceLine_quantity_df] DEFAULT 1,
  [amount]      DECIMAL(10,2)  NOT NULL,
  [createdAt]   DATETIME2      NOT NULL CONSTRAINT [InvoiceLine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [InvoiceLine_pkey] PRIMARY KEY CLUSTERED ([id])
);

ALTER TABLE [dbo].[InvoiceLine]
  ADD CONSTRAINT [InvoiceLine_invoiceId_fkey] FOREIGN KEY ([invoiceId])
  REFERENCES [dbo].[Invoice]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE NONCLUSTERED INDEX [InvoiceLine_invoiceId_idx] ON [dbo].[InvoiceLine]([invoiceId]);
CREATE NONCLUSTERED INDEX [InvoiceLine_stayId_idx] ON [dbo].[InvoiceLine]([stayId]);
CREATE NONCLUSTERED INDEX [InvoiceLine_saleItemId_idx] ON [dbo].[InvoiceLine]([saleItemId]);
CREATE NONCLUSTERED INDEX [InvoiceLine_branchId_idx] ON [dbo].[InvoiceLine]([branchId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
