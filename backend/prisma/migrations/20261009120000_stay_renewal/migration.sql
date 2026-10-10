-- Renovaciones persistidas (para recalcular la salida con solo las válidas) + estado CANCELLED de estadía.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF OBJECT_ID('dbo.StayRenewal', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[StayRenewal] (
        [id]               NVARCHAR(1000) NOT NULL CONSTRAINT [PK_StayRenewal] PRIMARY KEY,
        [branchId]         NVARCHAR(1000) NOT NULL,
        [stayId]           NVARCHAR(1000) NOT NULL,
        [saleId]           NVARCHAR(1000) NULL,
        [mode]             NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SR_mode] DEFAULT 'NIGHTS',
        [addedMinutes]     INT            NOT NULL,
        [prevCheckoutAt]   DATETIME2      NOT NULL,
        [newCheckoutAt]    DATETIME2      NOT NULL,
        [status]           NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SR_status] DEFAULT 'ACTIVE',
        [createdByUserId]  NVARCHAR(1000) NULL,
        [cancelledByUserId] NVARCHAR(1000) NULL,
        [cancelledAt]      DATETIME2      NULL,
        [createdAt]        DATETIME2      NOT NULL CONSTRAINT [DF_SR_createdAt] DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX [IX_SR_branchId] ON [dbo].[StayRenewal]([branchId]);
    CREATE INDEX [IX_SR_stayId] ON [dbo].[StayRenewal]([stayId]);
    CREATE INDEX [IX_SR_saleId] ON [dbo].[StayRenewal]([saleId]);
    ALTER TABLE [dbo].[StayRenewal] ADD CONSTRAINT [FK_SR_stay]
        FOREIGN KEY ([stayId]) REFERENCES [dbo].[Stay]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
END
