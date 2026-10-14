-- Fuerza el cambio de contraseña en el próximo ingreso (restablecimiento administrativo).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF COL_LENGTH('dbo.User', 'mustChangePassword') IS NULL
    ALTER TABLE [dbo].[User] ADD [mustChangePassword] BIT NOT NULL CONSTRAINT [DF_User_mustChangePassword] DEFAULT 0;
