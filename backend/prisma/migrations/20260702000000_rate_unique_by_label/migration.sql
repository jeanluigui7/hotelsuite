BEGIN TRY

BEGIN TRAN;

-- DropIndex (unique constraint solo por duración)
ALTER TABLE [dbo].[Rate] DROP CONSTRAINT [Rate_branchId_roomTypeId_durationMinutes_key];

-- CreateIndex (unique constraint por duración + etiqueta: permite varias pernocta por tipo)
ALTER TABLE [dbo].[Rate] ADD CONSTRAINT [Rate_branchId_roomTypeId_durationMinutes_label_key] UNIQUE NONCLUSTERED ([branchId], [roomTypeId], [durationMinutes], [label]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
