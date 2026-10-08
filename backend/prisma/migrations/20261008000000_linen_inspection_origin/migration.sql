-- Origen BASE/ADICIONAL por unidad recogida en la limpieza (se persiste lo que vio el trabajador).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('dbo.LinenInspection', 'origin') IS NULL
    ALTER TABLE [dbo].[LinenInspection] ADD [origin] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_LinenInspection_origin] DEFAULT 'BASE';
