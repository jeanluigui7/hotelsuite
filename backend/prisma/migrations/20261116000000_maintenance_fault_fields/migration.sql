SET QUOTED_IDENTIFIER ON;

BEGIN TRY

BEGIN TRAN;

IF COL_LENGTH('dbo.Maintenance', 'faultTypeId') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [faultTypeId] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.Maintenance', 'category') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [category] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.Maintenance', 'categoryLabel') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [categoryLabel] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.Maintenance', 'faultLabel') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [faultLabel] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.Maintenance', 'severity') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [severity] NVARCHAR(1000) NOT NULL CONSTRAINT [Maintenance_severity_df] DEFAULT 'LEVE';

IF COL_LENGTH('dbo.Maintenance', 'photo') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [photo] NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.Maintenance', 'resolvedAt') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [resolvedAt] DATETIME2 NULL;

IF COL_LENGTH('dbo.Maintenance', 'resolvedByUserId') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [resolvedByUserId] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.Maintenance', 'repairedBy') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [repairedBy] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.Maintenance', 'resolutionNotes') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [resolutionNotes] NVARCHAR(1000) NULL;

IF COL_LENGTH('dbo.Maintenance', 'resolutionPhoto') IS NULL
    ALTER TABLE [dbo].[Maintenance] ADD [resolutionPhoto] NVARCHAR(MAX) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
