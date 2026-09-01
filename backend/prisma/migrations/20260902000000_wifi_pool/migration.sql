BEGIN TRY

BEGIN TRAN;

-- Pool de credenciales WiFi: categoría de tarifa, código, uso/asignación y datos de GRATIS.
ALTER TABLE [dbo].[WifiCredential] ADD
  [category]       NVARCHAR(30)  NOT NULL CONSTRAINT [WifiCredential_category_df] DEFAULT 'PERNOCTACION',
  [code]           NVARCHAR(60)  NULL,
  [used]           BIT           NOT NULL CONSTRAINT [WifiCredential_used_df] DEFAULT 0,
  [assignedStayId] NVARCHAR(1000) NULL,
  [assignedRoom]   NVARCHAR(60)  NULL,
  [assignedGuest]  NVARCHAR(200) NULL,
  [assignedAt]     DATETIME2     NULL,
  [validMinutes]   INT           NULL,
  [message]        NVARCHAR(300) NULL;

EXEC('CREATE NONCLUSTERED INDEX [WifiCredential_branchId_category_idx] ON [dbo].[WifiCredential]([branchId], [category])');
EXEC('CREATE NONCLUSTERED INDEX [WifiCredential_assignedStayId_idx] ON [dbo].[WifiCredential]([assignedStayId])');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
