BEGIN TRY

BEGIN TRAN;

-- Reposición parcial de frigobar: cantidad ya repuesta por línea (0..consumedQty).
-- Pendiente por línea = consumedQty − repositionedQty.
IF COL_LENGTH('dbo.FrigobarReviewLine', 'repositionedQty') IS NULL
    ALTER TABLE [dbo].[FrigobarReviewLine] ADD [repositionedQty] INT NOT NULL CONSTRAINT [FrigobarReviewLine_repositionedQty_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
