BEGIN TRY

BEGIN TRAN;

-- Etapa 5 (Folio Maestro): agrupa varios Folios de Estancia (stayId) para facturación corporativa.
-- El pagador (empresa/RUC) vive aquí, separado del huésped que ocupó la habitación.
CREATE TABLE [dbo].[MasterFolio] (
  [id]              NVARCHAR(1000) NOT NULL,
  [branchId]        NVARCHAR(1000) NOT NULL,
  [code]            NVARCHAR(30)   NOT NULL,
  [payerName]       NVARCHAR(160)  NOT NULL,
  [payerDoc]        NVARCHAR(20)   NULL,
  [payerRuc]        NVARCHAR(20)   NULL,
  [payerAddress]    NVARCHAR(300)  NULL,
  [status]          NVARCHAR(20)   NOT NULL CONSTRAINT [MasterFolio_status_df] DEFAULT 'OPEN',
  [notes]           NVARCHAR(500)  NULL,
  [createdByUserId] NVARCHAR(1000) NULL,
  [createdAt]       DATETIME2      NOT NULL CONSTRAINT [MasterFolio_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt]       DATETIME2      NOT NULL,
  CONSTRAINT [MasterFolio_pkey] PRIMARY KEY CLUSTERED ([id])
);

ALTER TABLE [dbo].[MasterFolio]
  ADD CONSTRAINT [MasterFolio_branchId_fkey] FOREIGN KEY ([branchId])
  REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE NONCLUSTERED INDEX [MasterFolio_branchId_idx] ON [dbo].[MasterFolio]([branchId]);
CREATE NONCLUSTERED INDEX [MasterFolio_code_idx] ON [dbo].[MasterFolio]([code]);

-- Vínculo N:M folio maestro ↔ estancia (stayId plano, sin FK, para evitar cascadas múltiples).
CREATE TABLE [dbo].[MasterFolioStay] (
  [id]            NVARCHAR(1000) NOT NULL,
  [masterFolioId] NVARCHAR(1000) NOT NULL,
  [stayId]        NVARCHAR(1000) NOT NULL,
  [addedAt]       DATETIME2      NOT NULL CONSTRAINT [MasterFolioStay_addedAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [MasterFolioStay_pkey] PRIMARY KEY CLUSTERED ([id])
);

ALTER TABLE [dbo].[MasterFolioStay]
  ADD CONSTRAINT [MasterFolioStay_masterFolioId_fkey] FOREIGN KEY ([masterFolioId])
  REFERENCES [dbo].[MasterFolio]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE NONCLUSTERED INDEX [MasterFolioStay_masterFolioId_stayId_key] ON [dbo].[MasterFolioStay]([masterFolioId], [stayId]);
CREATE NONCLUSTERED INDEX [MasterFolioStay_stayId_idx] ON [dbo].[MasterFolioStay]([stayId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
