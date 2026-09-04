BEGIN TRY

BEGIN TRAN;

-- Saldo de VUELTO pendiente por estancia (sobrevive al cierre de caja).
CREATE TABLE [dbo].[ChangeCredit] (
  [id]              NVARCHAR(1000) NOT NULL,
  [branchId]        NVARCHAR(1000) NOT NULL,
  [stayId]          NVARCHAR(1000) NOT NULL,
  [guestId]         NVARCHAR(1000) NULL,
  [room]            NVARCHAR(60)   NULL,
  [originSessionId] NVARCHAR(1000) NULL,
  [amount]          DECIMAL(10,2)  NOT NULL,
  [remaining]       DECIMAL(10,2)  NOT NULL,
  [status]          NVARCHAR(30)   NOT NULL CONSTRAINT [ChangeCredit_status_df] DEFAULT 'PENDIENTE',
  [createdByUserId] NVARCHAR(1000) NULL,
  [createdAt]       DATETIME2      NOT NULL CONSTRAINT [ChangeCredit_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [closedAt]        DATETIME2      NULL,
  [closedSessionId] NVARCHAR(1000) NULL,
  [note]            NVARCHAR(500)  NULL,
  CONSTRAINT [ChangeCredit_pkey] PRIMARY KEY CLUSTERED ([id])
);

EXEC('CREATE NONCLUSTERED INDEX [ChangeCredit_branchId_idx] ON [dbo].[ChangeCredit]([branchId])');
EXEC('CREATE NONCLUSTERED INDEX [ChangeCredit_stayId_idx] ON [dbo].[ChangeCredit]([stayId])');
EXEC('CREATE NONCLUSTERED INDEX [ChangeCredit_status_idx] ON [dbo].[ChangeCredit]([status])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
