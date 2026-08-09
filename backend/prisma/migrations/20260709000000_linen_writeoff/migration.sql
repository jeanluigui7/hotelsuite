BEGIN TRY

BEGIN TRAN;

-- CreateTable: Historial de bajas de ropa (Retorno / Dañado / Robado).
CREATE TABLE [dbo].[LinenWriteoff] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [linenItemId] NVARCHAR(1000) NOT NULL,
    [floor] NVARCHAR(1000) NOT NULL,
    [motivo] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    [remBefore] INT NOT NULL CONSTRAINT [LinenWriteoff_remBefore_df] DEFAULT 0,
    [remAfter] INT NOT NULL CONSTRAINT [LinenWriteoff_remAfter_df] DEFAULT 0,
    [baseBefore] INT NOT NULL CONSTRAINT [LinenWriteoff_baseBefore_df] DEFAULT 0,
    [baseAfter] INT NOT NULL CONSTRAINT [LinenWriteoff_baseAfter_df] DEFAULT 0,
    [notes] NVARCHAR(max),
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LinenWriteoff_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LinenWriteoff_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LinenWriteoff_branchId_idx] ON [dbo].[LinenWriteoff]([branchId]);
CREATE NONCLUSTERED INDEX [LinenWriteoff_linenItemId_idx] ON [dbo].[LinenWriteoff]([linenItemId]);

-- AddForeignKey
ALTER TABLE [dbo].[LinenWriteoff] ADD CONSTRAINT [LinenWriteoff_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[LinenWriteoff] ADD CONSTRAINT [LinenWriteoff_linenItemId_fkey] FOREIGN KEY ([linenItemId]) REFERENCES [dbo].[LinenItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
