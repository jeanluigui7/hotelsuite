-- Enlace del beneficio con la venta que lo originó (renovación): al anularla se cancelan los no usados.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('dbo.StayBenefit', 'saleId') IS NULL
    ALTER TABLE [dbo].[StayBenefit] ADD [saleId] NVARCHAR(1000) NULL;
