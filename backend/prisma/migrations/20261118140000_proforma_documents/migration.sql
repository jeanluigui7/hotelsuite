-- Reservas ETAPA 2 · Tanda 2D: documentos versionados + proformas. Solo DDL.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF OBJECT_ID('dbo.ReservationDocument','U') IS NULL
CREATE TABLE [dbo].[ReservationDocument] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [ReservationDocument_pkey] PRIMARY KEY,
  [reservationId] NVARCHAR(1000) NOT NULL,
  [type] NVARCHAR(1000) NOT NULL,
  [version] INT NOT NULL CONSTRAINT [DF_ReservationDocument_version] DEFAULT 1,
  [current] BIT NOT NULL CONSTRAINT [DF_ReservationDocument_current] DEFAULT 1,
  [issuedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ReservationDocument_issuedAt] DEFAULT CURRENT_TIMESTAMP
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ReservationDocument_reservationId_idx' AND object_id=OBJECT_ID('dbo.ReservationDocument'))
CREATE INDEX [ReservationDocument_reservationId_idx] ON [dbo].[ReservationDocument]([reservationId]);
IF OBJECT_ID('dbo.ReservationDocument_reservationId_fkey','F') IS NULL
ALTER TABLE [dbo].[ReservationDocument] ADD CONSTRAINT [ReservationDocument_reservationId_fkey] FOREIGN KEY ([reservationId]) REFERENCES [dbo].[Reservation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF OBJECT_ID('dbo.Proforma','U') IS NULL
CREATE TABLE [dbo].[Proforma] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [Proforma_pkey] PRIMARY KEY,
  [branchId] NVARCHAR(1000) NOT NULL,
  [code] NVARCHAR(1000) NULL,
  [clientName] NVARCHAR(1000) NOT NULL,
  [phone] NVARCHAR(1000) NULL,
  [rooms] INT NOT NULL CONSTRAINT [DF_Proforma_rooms] DEFAULT 1,
  [total] DECIMAL(10,2) NULL,
  [validUntil] DATETIME2 NULL,
  [status] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Proforma_status] DEFAULT 'VIGENTE',
  [convertedReservationId] NVARCHAR(1000) NULL,
  [createdByUserId] NVARCHAR(1000) NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Proforma_createdAt] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Proforma_updatedAt] DEFAULT CURRENT_TIMESTAMP
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='Proforma_branchId_idx' AND object_id=OBJECT_ID('dbo.Proforma'))
CREATE INDEX [Proforma_branchId_idx] ON [dbo].[Proforma]([branchId]);
