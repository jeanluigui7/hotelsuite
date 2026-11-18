-- Reservas ETAPA 2 · Tanda 2C: anticipos (Advance). Solo DDL, tabla nueva.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF OBJECT_ID('dbo.Advance','U') IS NULL
CREATE TABLE [dbo].[Advance] (
  [id] NVARCHAR(1000) NOT NULL CONSTRAINT [Advance_pkey] PRIMARY KEY,
  [branchId] NVARCHAR(1000) NOT NULL,
  [code] NVARCHAR(1000) NULL,
  [clientName] NVARCHAR(1000) NOT NULL,
  [phone] NVARCHAR(1000) NULL,
  [amount] DECIMAL(10,2) NOT NULL,
  [applied] DECIMAL(10,2) NOT NULL CONSTRAINT [DF_Advance_applied] DEFAULT 0,
  [status] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_Advance_status] DEFAULT 'POR_APLICAR',
  [method] NVARCHAR(1000) NULL,
  [destination] NVARCHAR(1000) NULL,
  [reference] NVARCHAR(1000) NULL,
  [note] NVARCHAR(1000) NULL,
  [createdByUserId] NVARCHAR(1000) NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Advance_createdAt] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Advance_updatedAt] DEFAULT CURRENT_TIMESTAMP
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='Advance_branchId_idx' AND object_id=OBJECT_ID('dbo.Advance'))
CREATE INDEX [Advance_branchId_idx] ON [dbo].[Advance]([branchId]);
