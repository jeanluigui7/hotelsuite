BEGIN TRY

BEGIN TRAN;

-- AlterTable: correlativo visible por sucursal + usuario que cerró
ALTER TABLE [dbo].[CashSession] ADD [number] INT NULL;
ALTER TABLE [dbo].[CashSession] ADD [closedByUserId] NVARCHAR(1000) NULL;

-- Backfill del correlativo por sucursal en orden de apertura.
-- EXEC difiere la compilación para que la columna recién agregada sea visible.
EXEC('
;WITH cte AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY branchId ORDER BY openedAt ASC, id ASC) AS rn
  FROM [dbo].[CashSession]
)
UPDATE cs SET cs.[number] = cte.rn
FROM [dbo].[CashSession] cs INNER JOIN cte ON cs.id = cte.id;
');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
