BEGIN TRY

BEGIN TRAN;

-- Revisión/consumo de frigobar por estancia (housekeeping/recepción).
IF OBJECT_ID('[dbo].[FrigobarReview]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FrigobarReview] (
        [id]                NVARCHAR(1000) NOT NULL,
        [branchId]          NVARCHAR(1000) NOT NULL,
        [stayId]            NVARCHAR(1000) NOT NULL,
        [roomId]            NVARCHAR(1000) NOT NULL,
        [status]            NVARCHAR(20)   NOT NULL CONSTRAINT [FrigobarReview_status_df] DEFAULT 'REVIEWED',
        [reviewedByUserId]  NVARCHAR(1000) NULL,
        [reviewedAt]        DATETIME2      NOT NULL CONSTRAINT [FrigobarReview_reviewedAt_df] DEFAULT CURRENT_TIMESTAMP,
        [saleId]            NVARCHAR(1000) NULL,
        [consumedTotal]     DECIMAL(10,2)  NOT NULL CONSTRAINT [FrigobarReview_consumedTotal_df] DEFAULT 0,
        [repositionPending] BIT            NOT NULL CONSTRAINT [FrigobarReview_repositionPending_df] DEFAULT 0,
        [repositionDoneAt]  DATETIME2      NULL,
        [createdAt]         DATETIME2      NOT NULL CONSTRAINT [FrigobarReview_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
        [updatedAt]         DATETIME2      NOT NULL,
        CONSTRAINT [FrigobarReview_pkey] PRIMARY KEY CLUSTERED ([id])
    );
END

IF OBJECT_ID('[dbo].[FrigobarReviewLine]', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[FrigobarReviewLine] (
        [id]          NVARCHAR(1000) NOT NULL,
        [reviewId]    NVARCHAR(1000) NOT NULL,
        [productId]   NVARCHAR(1000) NOT NULL,
        [name]        NVARCHAR(1000) NOT NULL,
        [expectedQty] INT            NOT NULL,
        [foundQty]    INT            NOT NULL,
        [consumedQty] INT            NOT NULL,
        [unitPrice]   DECIMAL(10,2)  NOT NULL,
        [amount]      DECIMAL(10,2)  NOT NULL,
        CONSTRAINT [FrigobarReviewLine_pkey] PRIMARY KEY CLUSTERED ([id])
    );
    ALTER TABLE [dbo].[FrigobarReviewLine] ADD CONSTRAINT [FrigobarReviewLine_reviewId_fkey]
        FOREIGN KEY ([reviewId]) REFERENCES [dbo].[FrigobarReview]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
END

COMMIT TRAN;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'FrigobarReview_stayId_idx' AND object_id = OBJECT_ID('[dbo].[FrigobarReview]'))
    EXEC('CREATE NONCLUSTERED INDEX [FrigobarReview_stayId_idx] ON [dbo].[FrigobarReview]([stayId])');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'FrigobarReview_branchId_idx' AND object_id = OBJECT_ID('[dbo].[FrigobarReview]'))
    EXEC('CREATE NONCLUSTERED INDEX [FrigobarReview_branchId_idx] ON [dbo].[FrigobarReview]([branchId])');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'FrigobarReviewLine_reviewId_idx' AND object_id = OBJECT_ID('[dbo].[FrigobarReviewLine]'))
    EXEC('CREATE NONCLUSTERED INDEX [FrigobarReviewLine_reviewId_idx] ON [dbo].[FrigobarReviewLine]([reviewId])');

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
