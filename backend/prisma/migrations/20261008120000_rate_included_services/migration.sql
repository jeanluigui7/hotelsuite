-- Servicios incluidos en tarifa: config por tarifa (RateIncludedService), snapshot por estadía
-- (StayBenefit), pedido/entrega (ServiceOrder) + modalidad explícita por línea de venta.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- SaleItem: modalidad explícita (no se deduce por importe 0) + vínculo al beneficio consumido.
IF COL_LENGTH('dbo.SaleItem', 'modality') IS NULL
    ALTER TABLE [dbo].[SaleItem] ADD [modality] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SaleItem_modality] DEFAULT 'VENTA';
IF COL_LENGTH('dbo.SaleItem', 'stayBenefitId') IS NULL
    ALTER TABLE [dbo].[SaleItem] ADD [stayBenefitId] NVARCHAR(1000) NULL;

-- RateIncludedService
IF OBJECT_ID('dbo.RateIncludedService', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[RateIncludedService] (
        [id]           NVARCHAR(1000) NOT NULL CONSTRAINT [PK_RateIncludedService] PRIMARY KEY,
        [branchId]     NVARCHAR(1000) NOT NULL,
        [rateId]       NVARCHAR(1000) NOT NULL,
        [conceptId]    NVARCHAR(1000) NOT NULL,
        [quantity]     INT            NOT NULL CONSTRAINT [DF_RIS_quantity] DEFAULT 1,
        [assignment]   NVARCHAR(1000) NOT NULL CONSTRAINT [DF_RIS_assignment] DEFAULT 'PER_ROOM',
        [frequency]    NVARCHAR(1000) NOT NULL CONSTRAINT [DF_RIS_frequency] DEFAULT 'PER_STAY',
        [availability] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_RIS_availability] DEFAULT 'SAME_DAY',
        [scheduleFrom] NVARCHAR(1000) NULL,
        [scheduleTo]   NVARCHAR(1000) NULL,
        [place]        NVARCHAR(1000) NOT NULL CONSTRAINT [DF_RIS_place] DEFAULT 'BOTH',
        [sortOrder]    INT            NOT NULL CONSTRAINT [DF_RIS_sortOrder] DEFAULT 0,
        [createdAt]    DATETIME2      NOT NULL CONSTRAINT [DF_RIS_createdAt] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt]    DATETIME2      NOT NULL
    );
    CREATE INDEX [IX_RIS_branchId] ON [dbo].[RateIncludedService]([branchId]);
    CREATE INDEX [IX_RIS_rateId] ON [dbo].[RateIncludedService]([rateId]);
    CREATE INDEX [IX_RIS_conceptId] ON [dbo].[RateIncludedService]([conceptId]);
    ALTER TABLE [dbo].[RateIncludedService] ADD CONSTRAINT [FK_RIS_rate]
        FOREIGN KEY ([rateId]) REFERENCES [dbo].[Rate]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
END

-- StayBenefit
IF OBJECT_ID('dbo.StayBenefit', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[StayBenefit] (
        [id]           NVARCHAR(1000) NOT NULL CONSTRAINT [PK_StayBenefit] PRIMARY KEY,
        [branchId]     NVARCHAR(1000) NOT NULL,
        [stayId]       NVARCHAR(1000) NOT NULL,
        [rateId]       NVARCHAR(1000) NULL,
        [conceptId]    NVARCHAR(1000) NOT NULL,
        [serviceName]  NVARCHAR(1000) NOT NULL,
        [includedQty]  INT            NOT NULL CONSTRAINT [DF_SB_includedQty] DEFAULT 0,
        [pendingQty]   INT            NOT NULL CONSTRAINT [DF_SB_pendingQty] DEFAULT 0,
        [deliveredQty] INT            NOT NULL CONSTRAINT [DF_SB_deliveredQty] DEFAULT 0,
        [periodStart]  DATETIME2      NOT NULL,
        [periodEnd]    DATETIME2      NOT NULL,
        [scheduleFrom] NVARCHAR(1000) NULL,
        [scheduleTo]   NVARCHAR(1000) NULL,
        [place]        NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SB_place] DEFAULT 'BOTH',
        [assignment]   NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SB_assignment] DEFAULT 'PER_ROOM',
        [frequency]    NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SB_frequency] DEFAULT 'PER_STAY',
        [period]       INT            NOT NULL CONSTRAINT [DF_SB_period] DEFAULT 1,
        [status]       NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SB_status] DEFAULT 'ACTIVE',
        [createdAt]    DATETIME2      NOT NULL CONSTRAINT [DF_SB_createdAt] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt]    DATETIME2      NOT NULL
    );
    CREATE INDEX [IX_SB_branchId] ON [dbo].[StayBenefit]([branchId]);
    CREATE INDEX [IX_SB_stayId] ON [dbo].[StayBenefit]([stayId]);
    CREATE INDEX [IX_SB_conceptId] ON [dbo].[StayBenefit]([conceptId]);
    ALTER TABLE [dbo].[StayBenefit] ADD CONSTRAINT [FK_SB_stay]
        FOREIGN KEY ([stayId]) REFERENCES [dbo].[Stay]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
END

-- ServiceOrder
IF OBJECT_ID('dbo.ServiceOrder', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ServiceOrder] (
        [id]                NVARCHAR(1000) NOT NULL CONSTRAINT [PK_ServiceOrder] PRIMARY KEY,
        [branchId]          NVARCHAR(1000) NOT NULL,
        [stayId]            NVARCHAR(1000) NULL,
        [roomId]            NVARCHAR(1000) NULL,
        [guestId]           NVARCHAR(1000) NULL,
        [conceptId]         NVARCHAR(1000) NOT NULL,
        [description]       NVARCHAR(1000) NOT NULL,
        [quantity]          INT            NOT NULL CONSTRAINT [DF_SO_quantity] DEFAULT 1,
        [modality]          NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SO_modality] DEFAULT 'VENTA',
        [stayBenefitId]     NVARCHAR(1000) NULL,
        [saleId]            NVARCHAR(1000) NULL,
        [saleItemId]        NVARCHAR(1000) NULL,
        [place]             NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SO_place] DEFAULT 'ROOM',
        [observations]      NVARCHAR(MAX)  NULL,
        [area]              NVARCHAR(1000) NULL,
        [operationalStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_SO_opStatus] DEFAULT 'PENDING',
        [requestedByUserId] NVARCHAR(1000) NULL,
        [deliveredByUserId] NVARCHAR(1000) NULL,
        [requestedAt]       DATETIME2      NOT NULL CONSTRAINT [DF_SO_requestedAt] DEFAULT CURRENT_TIMESTAMP,
        [deliveredAt]       DATETIME2      NULL,
        [cancelledAt]       DATETIME2      NULL,
        [cancelReason]      NVARCHAR(1000) NULL
    );
    CREATE INDEX [IX_SO_branchId] ON [dbo].[ServiceOrder]([branchId]);
    CREATE INDEX [IX_SO_stayId] ON [dbo].[ServiceOrder]([stayId]);
    CREATE INDEX [IX_SO_opStatus] ON [dbo].[ServiceOrder]([operationalStatus]);
END
