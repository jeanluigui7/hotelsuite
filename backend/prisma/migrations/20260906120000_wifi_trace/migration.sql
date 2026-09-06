BEGIN TRY

BEGIN TRAN;

-- Trazabilidad de asignación/consumo de credenciales WiFi (auditoría; no vuelven al pool).
ALTER TABLE [dbo].[WifiCredential] ADD
  [usedAt]           DATETIME2      NULL,
  [assignReason]     NVARCHAR(30)   NULL,
  [assignedByUserId] NVARCHAR(1000) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
