-- Vencimiento de beneficios: unidades disponibles no utilizadas (NO UTILIZADAS) + marca de vencimiento.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('dbo.StayBenefit', 'unusedQty') IS NULL
    ALTER TABLE [dbo].[StayBenefit] ADD [unusedQty] INT NOT NULL CONSTRAINT [DF_StayBenefit_unusedQty] DEFAULT 0;
IF COL_LENGTH('dbo.StayBenefit', 'expiredAt') IS NULL
    ALTER TABLE [dbo].[StayBenefit] ADD [expiredAt] DATETIME2 NULL;
