BEGIN TRY

BEGIN TRAN;

-- Configuraciones → Hotel: identidad y contacto por sucursal (fuente única).
ALTER TABLE [dbo].[Branch] ADD
  [landline]             NVARCHAR(1000) NULL,
  [mobile]               NVARCHAR(1000) NULL,
  [whatsapp]             NVARCHAR(1000) NULL,
  [whatsappSameAsMobile] BIT           NOT NULL CONSTRAINT [Branch_whatsappSameAsMobile_df] DEFAULT 0,
  [website]              NVARCHAR(1000) NULL,
  [facebook]             NVARCHAR(1000) NULL,
  [instagram]            NVARCHAR(1000) NULL,
  [tiktok]               NVARCHAR(1000) NULL,
  [mapsUrl]              NVARCHAR(MAX)  NULL;

-- El logo pasa a NVARCHAR(MAX) para alojar el data URL de la imagen subida.
ALTER TABLE [dbo].[Branch] ALTER COLUMN [logoUrl] NVARCHAR(MAX) NULL;

-- Migrar el teléfono legado (phone) a "Teléfono fijo" (landline) sin perder el dato.
EXEC('UPDATE [dbo].[Branch] SET [landline] = [phone] WHERE [phone] IS NOT NULL AND [landline] IS NULL');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
