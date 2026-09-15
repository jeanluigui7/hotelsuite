BEGIN TRY

BEGIN TRAN;

-- Bitácora de auditoría de dominio: campos legibles sobre ActivityLog (los registros HTTP legacy
-- quedan con activity NULL y se ocultan de la vista). No se borra ni altera el histórico existente.
ALTER TABLE [dbo].[ActivityLog] ADD
  [activity]           NVARCHAR(60)   NULL,
  [area]               NVARCHAR(40)   NULL,
  [reference]          NVARCHAR(200)  NULL,
  [detail]             NVARCHAR(MAX)  NULL,
  [shift]              NVARCHAR(20)   NULL,
  [roomId]             NVARCHAR(1000) NULL,
  [authorizedByUserId] NVARCHAR(1000) NULL,
  [metaJson]           NVARCHAR(MAX)  NULL;

COMMIT TRAN;

-- Índices fuera de la transacción del ALTER (patrón del proyecto).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ActivityLog_activity_idx' AND object_id = OBJECT_ID('[dbo].[ActivityLog]'))
    EXEC('CREATE NONCLUSTERED INDEX [ActivityLog_activity_idx] ON [dbo].[ActivityLog]([activity])');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ActivityLog_area_idx' AND object_id = OBJECT_ID('[dbo].[ActivityLog]'))
    EXEC('CREATE NONCLUSTERED INDEX [ActivityLog_area_idx] ON [dbo].[ActivityLog]([area])');

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
