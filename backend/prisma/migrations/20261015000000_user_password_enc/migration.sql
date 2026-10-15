-- Contraseña cifrada (reversible) para la visualización administrativa del cargo máximo.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('dbo.User', 'passwordEnc') IS NULL
    ALTER TABLE [dbo].[User] ADD [passwordEnc] NVARCHAR(MAX) NULL;
