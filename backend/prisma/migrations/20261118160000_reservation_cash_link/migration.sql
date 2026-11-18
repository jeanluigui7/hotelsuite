-- ETAPA 3 · enlace de pagos de reserva/anticipos con la caja real.
-- Solo DDL (sin backfill), con guardas idempotentes para no fallar si ya existen.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('ReservationPayment', 'cashMovementId') IS NULL
  ALTER TABLE [ReservationPayment] ADD [cashMovementId] NVARCHAR(1000) NULL;

IF COL_LENGTH('ReservationPayment', 'cashSessionId') IS NULL
  ALTER TABLE [ReservationPayment] ADD [cashSessionId] NVARCHAR(1000) NULL;

IF COL_LENGTH('ReservationPayment', 'conciliated') IS NULL
  ALTER TABLE [ReservationPayment] ADD [conciliated] BIT NOT NULL CONSTRAINT [DF_ReservationPayment_conciliated] DEFAULT 0;

IF COL_LENGTH('Advance', 'cashMovementId') IS NULL
  ALTER TABLE [Advance] ADD [cashMovementId] NVARCHAR(1000) NULL;

IF COL_LENGTH('Advance', 'cashSessionId') IS NULL
  ALTER TABLE [Advance] ADD [cashSessionId] NVARCHAR(1000) NULL;

IF COL_LENGTH('Advance', 'conciliated') IS NULL
  ALTER TABLE [Advance] ADD [conciliated] BIT NOT NULL CONSTRAINT [DF_Advance_conciliated] DEFAULT 0;
