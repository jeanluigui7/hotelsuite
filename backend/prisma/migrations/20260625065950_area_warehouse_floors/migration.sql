BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Area] ADD [managesFloors] BIT NOT NULL CONSTRAINT [Area_managesFloors_df] DEFAULT 0,
[warehouseId] NVARCHAR(1000);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Area_warehouseId_idx] ON [dbo].[Area]([warehouseId]);

-- AddForeignKey
ALTER TABLE [dbo].[Area] ADD CONSTRAINT [Area_warehouseId_fkey] FOREIGN KEY ([warehouseId]) REFERENCES [dbo].[Warehouse]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
