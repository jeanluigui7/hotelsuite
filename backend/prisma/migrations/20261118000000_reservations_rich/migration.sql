-- Reservas ETAPA 2 · Tanda 2A: cabecera enriquecida + tablas hijas.
-- Idempotente y con QUOTED_IDENTIFIER ON (requerido por SQL Server para índices/constraints).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- ── Reservation: columnas nuevas (con guardas por si ya existen) ──
IF COL_LENGTH('dbo.Reservation','code') IS NULL ALTER TABLE [dbo].[Reservation] ADD [code] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','modalidad') IS NULL ALTER TABLE [dbo].[Reservation] ADD [modalidad] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Reservation_modalidad] DEFAULT 'PERNOCTE';
IF COL_LENGTH('dbo.Reservation','expectedCheckOutAt') IS NULL ALTER TABLE [dbo].[Reservation] ADD [expectedCheckOutAt] DATETIME2 NULL;
IF COL_LENGTH('dbo.Reservation','paymentStatus') IS NULL ALTER TABLE [dbo].[Reservation] ADD [paymentStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Reservation_paymentStatus] DEFAULT 'SIN_PAGO';
IF COL_LENGTH('dbo.Reservation','origin') IS NULL ALTER TABLE [dbo].[Reservation] ADD [origin] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Reservation_origin] DEFAULT 'RECEPCION';
IF COL_LENGTH('dbo.Reservation','contactType') IS NULL ALTER TABLE [dbo].[Reservation] ADD [contactType] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Reservation_contactType] DEFAULT 'PERSONA';
IF COL_LENGTH('dbo.Reservation','contactDocType') IS NULL ALTER TABLE [dbo].[Reservation] ADD [contactDocType] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','contactDocNumber') IS NULL ALTER TABLE [dbo].[Reservation] ADD [contactDocNumber] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','contactName') IS NULL ALTER TABLE [dbo].[Reservation] ADD [contactName] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','contactPhone') IS NULL ALTER TABLE [dbo].[Reservation] ADD [contactPhone] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','contactPhoneAlt') IS NULL ALTER TABLE [dbo].[Reservation] ADD [contactPhoneAlt] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','contactEmail') IS NULL ALTER TABLE [dbo].[Reservation] ADD [contactEmail] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','total') IS NULL ALTER TABLE [dbo].[Reservation] ADD [total] DECIMAL(10,2) NULL;
IF COL_LENGTH('dbo.Reservation','paid') IS NULL ALTER TABLE [dbo].[Reservation] ADD [paid] DECIMAL(10,2) NULL;
IF COL_LENGTH('dbo.Reservation','balance') IS NULL ALTER TABLE [dbo].[Reservation] ADD [balance] DECIMAL(10,2) NULL;
IF COL_LENGTH('dbo.Reservation','policyName') IS NULL ALTER TABLE [dbo].[Reservation] ADD [policyName] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','policyVersion') IS NULL ALTER TABLE [dbo].[Reservation] ADD [policyVersion] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','advanceRequired') IS NULL ALTER TABLE [dbo].[Reservation] ADD [advanceRequired] DECIMAL(10,2) NULL;
IF COL_LENGTH('dbo.Reservation','tentativeDueAt') IS NULL ALTER TABLE [dbo].[Reservation] ADD [tentativeDueAt] DATETIME2 NULL;
IF COL_LENGTH('dbo.Reservation','cancellationTerms') IS NULL ALTER TABLE [dbo].[Reservation] ADD [cancellationTerms] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','noShowTerms') IS NULL ALTER TABLE [dbo].[Reservation] ADD [noShowTerms] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','acceptance') IS NULL ALTER TABLE [dbo].[Reservation] ADD [acceptance] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Reservation_acceptance] DEFAULT 'PENDIENTE';
IF COL_LENGTH('dbo.Reservation','acceptanceAt') IS NULL ALTER TABLE [dbo].[Reservation] ADD [acceptanceAt] DATETIME2 NULL;
IF COL_LENGTH('dbo.Reservation','parkingRequired') IS NULL ALTER TABLE [dbo].[Reservation] ADD [parkingRequired] BIT NOT NULL CONSTRAINT [DF_Reservation_parkingRequired] DEFAULT 0;
IF COL_LENGTH('dbo.Reservation','parkingVehicles') IS NULL ALTER TABLE [dbo].[Reservation] ADD [parkingVehicles] INT NOT NULL CONSTRAINT [DF_Reservation_parkingVehicles] DEFAULT 0;
IF COL_LENGTH('dbo.Reservation','parkingStatus') IS NULL ALTER TABLE [dbo].[Reservation] ADD [parkingStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Reservation_parkingStatus] DEFAULT 'SOLICITADA';
IF COL_LENGTH('dbo.Reservation','parkingPrice') IS NULL ALTER TABLE [dbo].[Reservation] ADD [parkingPrice] DECIMAL(10,2) NULL;
IF COL_LENGTH('dbo.Reservation','parkingPlates') IS NULL ALTER TABLE [dbo].[Reservation] ADD [parkingPlates] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','internalNote') IS NULL ALTER TABLE [dbo].[Reservation] ADD [internalNote] NVARCHAR(1000) NULL;
IF COL_LENGTH('dbo.Reservation','clientNote') IS NULL ALTER TABLE [dbo].[Reservation] ADD [clientNote] NVARCHAR(1000) NULL;

-- ── Tablas hijas ──
IF OBJECT_ID('dbo.ReservationRoom','U') IS NULL
CREATE TABLE [dbo].[ReservationRoom] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [ReservationRoom_pkey] PRIMARY KEY,
  [reservationId] NVARCHAR(1000) NOT NULL,
  [roomTypeId] NVARCHAR(1000) NULL,
  [roomTypeName] NVARCHAR(1000) NULL,
  [roomId] NVARCHAR(1000) NULL,
  [roomNumber] NVARCHAR(1000) NULL,
  [rateId] NVARCHAR(1000) NULL,
  [price] DECIMAL(10,2) NULL,
  [adults] INT NOT NULL CONSTRAINT [DF_ReservationRoom_adults] DEFAULT 1,
  [children] INT NOT NULL CONSTRAINT [DF_ReservationRoom_children] DEFAULT 0,
  [unitStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_ReservationRoom_unitStatus] DEFAULT 'RESERVADA',
  [sortOrder] INT NOT NULL CONSTRAINT [DF_ReservationRoom_sortOrder] DEFAULT 0,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_ReservationRoom_createdAt] DEFAULT CURRENT_TIMESTAMP
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ReservationRoom_reservationId_idx' AND object_id=OBJECT_ID('dbo.ReservationRoom'))
CREATE INDEX [ReservationRoom_reservationId_idx] ON [dbo].[ReservationRoom]([reservationId]);
IF OBJECT_ID('dbo.ReservationRoom_reservationId_fkey','F') IS NULL
ALTER TABLE [dbo].[ReservationRoom] ADD CONSTRAINT [ReservationRoom_reservationId_fkey] FOREIGN KEY ([reservationId]) REFERENCES [dbo].[Reservation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF OBJECT_ID('dbo.ReservationRoomAttribute','U') IS NULL
CREATE TABLE [dbo].[ReservationRoomAttribute] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [ReservationRoomAttribute_pkey] PRIMARY KEY,
  [reservationRoomId] NVARCHAR(1000) NOT NULL,
  [attributeId] NVARCHAR(1000) NULL,
  [attributeName] NVARCHAR(1000) NOT NULL,
  [kind] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_ReservationRoomAttribute_kind] DEFAULT 'REQUISITO'
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ReservationRoomAttribute_reservationRoomId_idx' AND object_id=OBJECT_ID('dbo.ReservationRoomAttribute'))
CREATE INDEX [ReservationRoomAttribute_reservationRoomId_idx] ON [dbo].[ReservationRoomAttribute]([reservationRoomId]);
IF OBJECT_ID('dbo.ReservationRoomAttribute_reservationRoomId_fkey','F') IS NULL
ALTER TABLE [dbo].[ReservationRoomAttribute] ADD CONSTRAINT [ReservationRoomAttribute_reservationRoomId_fkey] FOREIGN KEY ([reservationRoomId]) REFERENCES [dbo].[ReservationRoom]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF OBJECT_ID('dbo.ReservationGuest','U') IS NULL
CREATE TABLE [dbo].[ReservationGuest] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [ReservationGuest_pkey] PRIMARY KEY,
  [reservationRoomId] NVARCHAR(1000) NOT NULL,
  [guestId] NVARCHAR(1000) NULL,
  [firstName] NVARCHAR(1000) NOT NULL,
  [lastName] NVARCHAR(1000) NULL,
  [documentType] NVARCHAR(1000) NULL,
  [documentNumber] NVARCHAR(1000) NULL,
  [nationality] NVARCHAR(1000) NULL,
  [phone] NVARCHAR(1000) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ReservationGuest_reservationRoomId_idx' AND object_id=OBJECT_ID('dbo.ReservationGuest'))
CREATE INDEX [ReservationGuest_reservationRoomId_idx] ON [dbo].[ReservationGuest]([reservationRoomId]);
IF OBJECT_ID('dbo.ReservationGuest_reservationRoomId_fkey','F') IS NULL
ALTER TABLE [dbo].[ReservationGuest] ADD CONSTRAINT [ReservationGuest_reservationRoomId_fkey] FOREIGN KEY ([reservationRoomId]) REFERENCES [dbo].[ReservationRoom]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF OBJECT_ID('dbo.ReservationPayment','U') IS NULL
CREATE TABLE [dbo].[ReservationPayment] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [ReservationPayment_pkey] PRIMARY KEY,
  [reservationId] NVARCHAR(1000) NOT NULL,
  [amount] DECIMAL(10,2) NOT NULL,
  [method] NVARCHAR(1000) NOT NULL,
  [destination] NVARCHAR(1000) NULL,
  [reference] NVARCHAR(1000) NULL,
  [note] NVARCHAR(1000) NULL,
  [kind] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_ReservationPayment_kind] DEFAULT 'RECIBIDO',
  [advanceId] NVARCHAR(1000) NULL,
  [paidAt] DATETIME2 NOT NULL CONSTRAINT [DF_ReservationPayment_paidAt] DEFAULT CURRENT_TIMESTAMP,
  [createdByUserId] NVARCHAR(1000) NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ReservationPayment_reservationId_idx' AND object_id=OBJECT_ID('dbo.ReservationPayment'))
CREATE INDEX [ReservationPayment_reservationId_idx] ON [dbo].[ReservationPayment]([reservationId]);
IF OBJECT_ID('dbo.ReservationPayment_reservationId_fkey','F') IS NULL
ALTER TABLE [dbo].[ReservationPayment] ADD CONSTRAINT [ReservationPayment_reservationId_fkey] FOREIGN KEY ([reservationId]) REFERENCES [dbo].[Reservation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

IF OBJECT_ID('dbo.ReservationScheduledPayment','U') IS NULL
CREATE TABLE [dbo].[ReservationScheduledPayment] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [ReservationScheduledPayment_pkey] PRIMARY KEY,
  [reservationId] NVARCHAR(1000) NOT NULL,
  [dueAt] DATETIME2 NULL,
  [mode] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_ReservationScheduledPayment_mode] DEFAULT 'PORCENTAJE',
  [value] DECIMAL(10,2) NOT NULL,
  [base] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_ReservationScheduledPayment_base] DEFAULT 'TOTAL',
  [amount] DECIMAL(10,2) NOT NULL
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ReservationScheduledPayment_reservationId_idx' AND object_id=OBJECT_ID('dbo.ReservationScheduledPayment'))
CREATE INDEX [ReservationScheduledPayment_reservationId_idx] ON [dbo].[ReservationScheduledPayment]([reservationId]);
IF OBJECT_ID('dbo.ReservationScheduledPayment_reservationId_fkey','F') IS NULL
ALTER TABLE [dbo].[ReservationScheduledPayment] ADD CONSTRAINT [ReservationScheduledPayment_reservationId_fkey] FOREIGN KEY ([reservationId]) REFERENCES [dbo].[Reservation]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
