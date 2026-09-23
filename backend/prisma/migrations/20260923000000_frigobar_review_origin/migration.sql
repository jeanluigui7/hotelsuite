BEGIN TRY

BEGIN TRAN;

-- Origen de la inspección de frigobar (RECEPCION | HOUSEKEEPING).
IF COL_LENGTH('dbo.FrigobarReview', 'origin') IS NULL
    ALTER TABLE [dbo].[FrigobarReview] ADD [origin] NVARCHAR(20) NOT NULL CONSTRAINT [FrigobarReview_origin_df] DEFAULT 'RECEPCION';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
