BEGIN TRY

BEGIN TRAN;

-- AlterTable: tamaño del artículo en la dotación base por tipo de habitación
ALTER TABLE [dbo].[RoomTypeDotacion] ADD [size] NVARCHAR(120) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
