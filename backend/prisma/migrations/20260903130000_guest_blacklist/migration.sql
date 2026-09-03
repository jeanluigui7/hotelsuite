BEGIN TRY

BEGIN TRAN;

-- Lista Negra de clientes: bloqueo con motivo obligatorio, fecha y usuario que lo realizó.
-- Agregar a Lista Negra: recepción + administración. Quitar: solo administración.
ALTER TABLE [dbo].[Guest] ADD
  [blacklisted]          BIT            NOT NULL CONSTRAINT [Guest_blacklisted_df] DEFAULT 0,
  [blacklistReason]      NVARCHAR(500)  NULL,
  [blacklistedAt]        DATETIME2      NULL,
  [blacklistedByUserId]  NVARCHAR(1000) NULL;

EXEC('CREATE NONCLUSTERED INDEX [Guest_blacklisted_idx] ON [dbo].[Guest]([blacklisted])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
