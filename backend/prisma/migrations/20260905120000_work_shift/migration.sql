BEGIN TRY

BEGIN TRAN;

-- Turno de trabajo personal (jornada de recepción). USUARIO → TURNO → CAJA.
CREATE TABLE [dbo].[WorkShift] (
  [id]        NVARCHAR(1000) NOT NULL,
  [branchId]  NVARCHAR(1000) NOT NULL,
  [userId]    NVARCHAR(1000) NOT NULL,
  [shift]     NVARCHAR(30)   NOT NULL,
  [status]    NVARCHAR(20)   NOT NULL CONSTRAINT [WorkShift_status_df] DEFAULT 'ACTIVE',
  [startedAt] DATETIME2      NOT NULL CONSTRAINT [WorkShift_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
  [endedAt]   DATETIME2      NULL,
  [createdAt] DATETIME2      NOT NULL CONSTRAINT [WorkShift_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [WorkShift_pkey] PRIMARY KEY CLUSTERED ([id])
);

EXEC('CREATE NONCLUSTERED INDEX [WorkShift_branchId_idx] ON [dbo].[WorkShift]([branchId])');
EXEC('CREATE NONCLUSTERED INDEX [WorkShift_userId_status_idx] ON [dbo].[WorkShift]([userId], [status])');

-- La caja pertenece al turno; caja chica realmente declarada al cierre (editable).
ALTER TABLE [dbo].[CashSession] ADD
  [workShiftId]   NVARCHAR(1000) NULL,
  [pettyCashLeft] DECIMAL(10,2)  NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
