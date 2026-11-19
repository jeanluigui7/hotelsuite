-- ETAPA 4C · documento definitivo: flag `final` + `snapshot` (JSON congelado) en ReservationDocument.
-- Solo DDL, con guardas idempotentes.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('ReservationDocument', 'final') IS NULL
  ALTER TABLE [ReservationDocument] ADD [final] BIT NOT NULL CONSTRAINT [DF_ReservationDocument_final] DEFAULT 0;

IF COL_LENGTH('ReservationDocument', 'snapshot') IS NULL
  ALTER TABLE [ReservationDocument] ADD [snapshot] NVARCHAR(MAX) NULL;
