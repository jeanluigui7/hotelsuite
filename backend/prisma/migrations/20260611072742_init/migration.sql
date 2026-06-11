BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Branch] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [address] NVARCHAR(1000),
    [taxId] NVARCHAR(1000),
    [legalName] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [logoUrl] NVARCHAR(1000),
    [currency] NVARCHAR(1000) NOT NULL CONSTRAINT [Branch_currency_df] DEFAULT 'PEN',
    [cutoffHour] INT NOT NULL CONSTRAINT [Branch_cutoffHour_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Branch_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Branch_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Branch_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [passwordHash] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [User_status_df] DEFAULT 'active',
    [roleId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [isSystem] BIT NOT NULL CONSTRAINT [Role_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Role_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Role_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Permission] (
    [id] NVARCHAR(1000) NOT NULL,
    [module] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Permission_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Permission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Permission_module_action_key] UNIQUE NONCLUSTERED ([module],[action])
);

-- CreateTable
CREATE TABLE [dbo].[RolePermission] (
    [id] NVARCHAR(1000) NOT NULL,
    [roleId] NVARCHAR(1000) NOT NULL,
    [permissionId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [RolePermission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RolePermission_roleId_permissionId_key] UNIQUE NONCLUSTERED ([roleId],[permissionId])
);

-- CreateTable
CREATE TABLE [dbo].[UserBranch] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [UserBranch_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [UserBranch_userId_branchId_key] UNIQUE NONCLUSTERED ([userId],[branchId])
);

-- CreateTable
CREATE TABLE [dbo].[RefreshToken] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [tokenHash] NVARCHAR(1000) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RefreshToken_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [RefreshToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RefreshToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[Setting] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [key] NVARCHAR(1000) NOT NULL,
    [value] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Setting_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Setting_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Setting_branchId_key_key] UNIQUE NONCLUSTERED ([branchId],[key])
);

-- CreateTable
CREATE TABLE [dbo].[RoomType] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [capacity] INT NOT NULL CONSTRAINT [RoomType_capacity_df] DEFAULT 2,
    [basePrice] DECIMAL(10,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [RoomType_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoomType_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RoomType_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RoomAttribute] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [icon] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [RoomAttribute_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RoomAttribute_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RoomAttribute_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[RoomTypeAttribute] (
    [id] NVARCHAR(1000) NOT NULL,
    [roomTypeId] NVARCHAR(1000) NOT NULL,
    [attributeId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [RoomTypeAttribute_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RoomTypeAttribute_roomTypeId_attributeId_key] UNIQUE NONCLUSTERED ([roomTypeId],[attributeId])
);

-- CreateTable
CREATE TABLE [dbo].[ClientTier] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [discountPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [ClientTier_discountPercent_df] DEFAULT 0,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ClientTier_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ClientTier_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ClientTier_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Guest] (
    [id] NVARCHAR(1000) NOT NULL,
    [documentType] NVARCHAR(1000) NOT NULL CONSTRAINT [Guest_documentType_df] DEFAULT 'DNI',
    [documentNumber] NVARCHAR(1000) NOT NULL,
    [firstName] NVARCHAR(1000) NOT NULL,
    [lastName] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [notes] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Guest_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Guest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Guest_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Guest_documentType_documentNumber_key] UNIQUE NONCLUSTERED ([documentType],[documentNumber])
);

-- CreateTable
CREATE TABLE [dbo].[Rate] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomTypeId] NVARCHAR(1000) NOT NULL,
    [label] NVARCHAR(1000) NOT NULL,
    [durationMinutes] INT NOT NULL,
    [price] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Rate_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Rate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Rate_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Rate_branchId_roomTypeId_durationMinutes_key] UNIQUE NONCLUSTERED ([branchId],[roomTypeId],[durationMinutes])
);

-- CreateTable
CREATE TABLE [dbo].[CustomRate] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomTypeId] NVARCHAR(1000) NOT NULL,
    [tierId] NVARCHAR(1000),
    [label] NVARCHAR(1000) NOT NULL,
    [durationMinutes] INT NOT NULL,
    [price] DECIMAL(10,2) NOT NULL,
    [validFrom] DATETIME2,
    [validTo] DATETIME2,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [CustomRate_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomRate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CustomRate_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Area] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Area_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Area_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Area_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryCategory] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [InventoryCategory_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [InventoryCategory_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Item] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [kind] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [price] DECIMAL(10,2),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Item_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Item_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Item_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Schedule] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [startTime] NVARCHAR(1000) NOT NULL,
    [endTime] NVARCHAR(1000) NOT NULL,
    [daysOfWeek] NVARCHAR(1000) NOT NULL CONSTRAINT [Schedule_daysOfWeek_df] DEFAULT '',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Schedule_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Schedule_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Schedule_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Room] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomTypeId] NVARCHAR(1000) NOT NULL,
    [number] NVARCHAR(1000) NOT NULL,
    [floor] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Room_status_df] DEFAULT 'FREE',
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Room_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Room_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Room_branchId_number_key] UNIQUE NONCLUSTERED ([branchId],[number])
);

-- CreateTable
CREATE TABLE [dbo].[Stay] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000) NOT NULL,
    [guestId] NVARCHAR(1000) NOT NULL,
    [rateId] NVARCHAR(1000),
    [tierId] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Stay_status_df] DEFAULT 'OPEN',
    [checkInAt] DATETIME2 NOT NULL CONSTRAINT [Stay_checkInAt_df] DEFAULT CURRENT_TIMESTAMP,
    [plannedCheckoutAt] DATETIME2 NOT NULL,
    [checkOutAt] DATETIME2,
    [durationMinutes] INT NOT NULL,
    [priceAgreed] DECIMAL(10,2) NOT NULL,
    [adults] INT NOT NULL CONSTRAINT [Stay_adults_df] DEFAULT 1,
    [children] INT NOT NULL CONSTRAINT [Stay_children_df] DEFAULT 0,
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Stay_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Stay_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StayGuest] (
    [id] NVARCHAR(1000) NOT NULL,
    [stayId] NVARCHAR(1000) NOT NULL,
    [guestId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [StayGuest_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StayGuest_stayId_guestId_key] UNIQUE NONCLUSTERED ([stayId],[guestId])
);

-- CreateTable
CREATE TABLE [dbo].[Reservation] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomTypeId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000),
    [guestId] NVARCHAR(1000),
    [guestName] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [expectedCheckInAt] DATETIME2 NOT NULL,
    [durationMinutes] INT NOT NULL CONSTRAINT [Reservation_durationMinutes_df] DEFAULT 1440,
    [adults] INT NOT NULL CONSTRAINT [Reservation_adults_df] DEFAULT 1,
    [children] INT NOT NULL CONSTRAINT [Reservation_children_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Reservation_status_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(1000),
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Reservation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Reservation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Observation] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000),
    [title] NVARCHAR(1000),
    [body] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Observation_status_df] DEFAULT 'OPEN',
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Observation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Observation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ConciergeRequest] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000),
    [guestName] NVARCHAR(1000),
    [category] NVARCHAR(1000),
    [description] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ConciergeRequest_status_df] DEFAULT 'PENDING',
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ConciergeRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ConciergeRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Warehouse] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL CONSTRAINT [Warehouse_type_df] DEFAULT 'PRODUCTS',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Warehouse_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Warehouse_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Warehouse_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Product] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [categoryId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [sku] NVARCHAR(1000),
    [salePrice] DECIMAL(10,2) NOT NULL,
    [cost] DECIMAL(10,2),
    [reorderPoint] INT NOT NULL CONSTRAINT [Product_reorderPoint_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Product_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Product_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Product_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Stock] (
    [id] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [warehouseId] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL CONSTRAINT [Stock_quantity_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Stock_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Stock_productId_warehouseId_key] UNIQUE NONCLUSTERED ([productId],[warehouseId])
);

-- CreateTable
CREATE TABLE [dbo].[CashSession] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [openedByUserId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [CashSession_status_df] DEFAULT 'OPEN',
    [openingAmount] DECIMAL(10,2) NOT NULL,
    [closingAmount] DECIMAL(10,2),
    [expectedAmount] DECIMAL(10,2),
    [notes] NVARCHAR(1000),
    [openedAt] DATETIME2 NOT NULL CONSTRAINT [CashSession_openedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [closedAt] DATETIME2,
    CONSTRAINT [CashSession_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CashMovement] (
    [id] NVARCHAR(1000) NOT NULL,
    [cashSessionId] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(10,2) NOT NULL,
    [concept] NVARCHAR(1000) NOT NULL,
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CashMovement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CashMovement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FolioSeries] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [documentType] NVARCHAR(1000) NOT NULL,
    [series] NVARCHAR(1000) NOT NULL,
    [currentNumber] INT NOT NULL CONSTRAINT [FolioSeries_currentNumber_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [FolioSeries_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FolioSeries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [FolioSeries_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FolioSeries_branchId_documentType_series_key] UNIQUE NONCLUSTERED ([branchId],[documentType],[series])
);

-- CreateTable
CREATE TABLE [dbo].[Invoice] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [saleId] NVARCHAR(1000),
    [type] NVARCHAR(1000) NOT NULL,
    [series] NVARCHAR(1000) NOT NULL,
    [number] INT NOT NULL,
    [customerDoc] NVARCHAR(1000),
    [customerName] NVARCHAR(1000) NOT NULL,
    [subtotal] DECIMAL(10,2) NOT NULL,
    [taxAmount] DECIMAL(10,2) NOT NULL,
    [total] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Invoice_status_df] DEFAULT 'ISSUED',
    [providerStatus] NVARCHAR(1000),
    [providerRef] NVARCHAR(1000),
    [issuedAt] DATETIME2 NOT NULL CONSTRAINT [Invoice_issuedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdByUserId] NVARCHAR(1000),
    CONSTRAINT [Invoice_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Invoice_branchId_series_number_key] UNIQUE NONCLUSTERED ([branchId],[series],[number])
);

-- CreateTable
CREATE TABLE [dbo].[CreditDebitNote] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [invoiceId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [series] NVARCHAR(1000) NOT NULL,
    [number] INT NOT NULL,
    [reason] NVARCHAR(1000) NOT NULL,
    [total] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [CreditDebitNote_status_df] DEFAULT 'ISSUED',
    [issuedAt] DATETIME2 NOT NULL CONSTRAINT [CreditDebitNote_issuedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [createdByUserId] NVARCHAR(1000),
    CONSTRAINT [CreditDebitNote_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CreditDebitNote_branchId_series_number_key] UNIQUE NONCLUSTERED ([branchId],[series],[number])
);

-- CreateTable
CREATE TABLE [dbo].[InventoryMovement] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [warehouseId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    [unitCost] DECIMAL(10,2),
    [reference] NVARCHAR(1000),
    [relatedWarehouseId] NVARCHAR(1000),
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InventoryMovement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [InventoryMovement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Supplier] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [taxId] NVARCHAR(1000),
    [contact] NVARCHAR(1000),
    [phone] NVARCHAR(1000),
    [email] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Supplier_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Supplier_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Supplier_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseInvoice] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [supplierId] NVARCHAR(1000) NOT NULL,
    [warehouseId] NVARCHAR(1000) NOT NULL,
    [documentNumber] NVARCHAR(1000),
    [total] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [PurchaseInvoice_status_df] DEFAULT 'RECEIVED',
    [notes] NVARCHAR(1000),
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PurchaseInvoice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PurchaseInvoice_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PurchaseInvoiceItem] (
    [id] NVARCHAR(1000) NOT NULL,
    [purchaseId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    [unitCost] DECIMAL(10,2) NOT NULL,
    [subtotal] DECIMAL(10,2) NOT NULL,
    CONSTRAINT [PurchaseInvoiceItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ChecklistItem] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ChecklistItem_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ChecklistItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ChecklistItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[HousekeepingTask] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000) NOT NULL,
    [assignedToUserId] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [HousekeepingTask_status_df] DEFAULT 'PENDING',
    [result] NVARCHAR(1000) NOT NULL CONSTRAINT [HousekeepingTask_result_df] DEFAULT 'PENDING',
    [notes] NVARCHAR(1000),
    [completedAt] DATETIME2,
    [inspectedAt] DATETIME2,
    [inspectedByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [HousekeepingTask_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [HousekeepingTask_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Attendance] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL CONSTRAINT [Attendance_source_df] DEFAULT 'MANUAL',
    [at] DATETIME2 NOT NULL CONSTRAINT [Attendance_at_df] DEFAULT CURRENT_TIMESTAMP,
    [note] NVARCHAR(1000),
    [deviceId] NVARCHAR(1000),
    CONSTRAINT [Attendance_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ActivityLog] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000),
    [userId] NVARCHAR(1000),
    [userEmail] NVARCHAR(1000),
    [action] NVARCHAR(1000) NOT NULL,
    [module] NVARCHAR(1000) NOT NULL,
    [entityId] NVARCHAR(1000),
    [summary] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ActivityLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ActivityLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TaskInspection] (
    [id] NVARCHAR(1000) NOT NULL,
    [taskId] NVARCHAR(1000) NOT NULL,
    [checklistItemId] NVARCHAR(1000) NOT NULL,
    [passed] BIT NOT NULL,
    [note] NVARCHAR(1000),
    CONSTRAINT [TaskInspection_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Maintenance] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000),
    [title] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Maintenance_status_df] DEFAULT 'OPEN',
    [cost] DECIMAL(10,2),
    [assignedToUserId] NVARCHAR(1000),
    [scheduledAt] DATETIME2,
    [completedAt] DATETIME2,
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Maintenance_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Maintenance_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Revision] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [roomId] NVARCHAR(1000) NOT NULL,
    [notes] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Revision_status_df] DEFAULT 'PENDING',
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Revision_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Revision_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LaundryMachine] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [capacity] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [LaundryMachine_status_df] DEFAULT 'available',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LaundryMachine_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [LaundryMachine_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[BiometricDevice] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [ip] NVARCHAR(1000) NOT NULL,
    [port] INT NOT NULL CONSTRAINT [BiometricDevice_port_df] DEFAULT 4370,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [BiometricDevice_status_df] DEFAULT 'offline',
    [lastSyncAt] DATETIME2,
    [notes] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BiometricDevice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BiometricDevice_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[WhatsAppInstance] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [provider] NVARCHAR(1000) NOT NULL CONSTRAINT [WhatsAppInstance_provider_df] DEFAULT 'mock',
    [phoneNumber] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [WhatsAppInstance_status_df] DEFAULT 'disconnected',
    [config] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [WhatsAppInstance_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [WhatsAppInstance_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MessageTemplate] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [body] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [MessageTemplate_status_df] DEFAULT 'active',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MessageTemplate_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [MessageTemplate_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[MessageLog] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [templateId] NVARCHAR(1000),
    [to] NVARCHAR(1000) NOT NULL,
    [body] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [MessageLog_status_df] DEFAULT 'SENT',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MessageLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [MessageLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Reminder] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [templateId] NVARCHAR(1000),
    [trigger] NVARCHAR(1000),
    [active] BIT NOT NULL CONSTRAINT [Reminder_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Reminder_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Reminder_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DeviceEnrollment] (
    [id] NVARCHAR(1000) NOT NULL,
    [deviceId] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [deviceUserId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DeviceEnrollment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DeviceEnrollment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [DeviceEnrollment_deviceId_deviceUserId_key] UNIQUE NONCLUSTERED ([deviceId],[deviceUserId])
);

-- CreateTable
CREATE TABLE [dbo].[LaundryTask] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [machineId] NVARCHAR(1000),
    [description] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [LaundryTask_status_df] DEFAULT 'PENDING',
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LaundryTask_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [completedAt] DATETIME2,
    CONSTRAINT [LaundryTask_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Sale] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [stayId] NVARCHAR(1000),
    [guestId] NVARCHAR(1000),
    [customerName] NVARCHAR(1000),
    [cashSessionId] NVARCHAR(1000),
    [total] DECIMAL(10,2) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Sale_status_df] DEFAULT 'OPEN',
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Sale_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Sale_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SaleItem] (
    [id] NVARCHAR(1000) NOT NULL,
    [saleId] NVARCHAR(1000) NOT NULL,
    [productId] NVARCHAR(1000),
    [itemId] NVARCHAR(1000),
    [description] NVARCHAR(1000) NOT NULL,
    [quantity] INT NOT NULL,
    [unitPrice] DECIMAL(10,2) NOT NULL,
    [unitCost] DECIMAL(10,2),
    [subtotal] DECIMAL(10,2) NOT NULL,
    CONSTRAINT [SaleItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Payment] (
    [id] NVARCHAR(1000) NOT NULL,
    [branchId] NVARCHAR(1000) NOT NULL,
    [saleId] NVARCHAR(1000) NOT NULL,
    [cashSessionId] NVARCHAR(1000),
    [method] NVARCHAR(1000) NOT NULL,
    [amount] DECIMAL(10,2) NOT NULL,
    [reference] NVARCHAR(1000),
    [createdByUserId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Payment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Payment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Branch_status_idx] ON [dbo].[Branch]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_roleId_idx] ON [dbo].[User]([roleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_status_idx] ON [dbo].[User]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Permission_module_idx] ON [dbo].[Permission]([module]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RolePermission_roleId_idx] ON [dbo].[RolePermission]([roleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RolePermission_permissionId_idx] ON [dbo].[RolePermission]([permissionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UserBranch_userId_idx] ON [dbo].[UserBranch]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UserBranch_branchId_idx] ON [dbo].[UserBranch]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RefreshToken_userId_idx] ON [dbo].[RefreshToken]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Setting_branchId_idx] ON [dbo].[Setting]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomType_branchId_idx] ON [dbo].[RoomType]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomType_status_idx] ON [dbo].[RoomType]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomAttribute_branchId_idx] ON [dbo].[RoomAttribute]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomTypeAttribute_roomTypeId_idx] ON [dbo].[RoomTypeAttribute]([roomTypeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [RoomTypeAttribute_attributeId_idx] ON [dbo].[RoomTypeAttribute]([attributeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ClientTier_branchId_idx] ON [dbo].[ClientTier]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Guest_documentNumber_idx] ON [dbo].[Guest]([documentNumber]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Rate_branchId_idx] ON [dbo].[Rate]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Rate_roomTypeId_idx] ON [dbo].[Rate]([roomTypeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomRate_branchId_idx] ON [dbo].[CustomRate]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomRate_roomTypeId_idx] ON [dbo].[CustomRate]([roomTypeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomRate_tierId_idx] ON [dbo].[CustomRate]([tierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Area_branchId_idx] ON [dbo].[Area]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryCategory_branchId_idx] ON [dbo].[InventoryCategory]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Item_branchId_idx] ON [dbo].[Item]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Item_kind_idx] ON [dbo].[Item]([kind]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Schedule_branchId_idx] ON [dbo].[Schedule]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Room_branchId_idx] ON [dbo].[Room]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Room_roomTypeId_idx] ON [dbo].[Room]([roomTypeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Room_status_idx] ON [dbo].[Room]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Stay_branchId_idx] ON [dbo].[Stay]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Stay_roomId_idx] ON [dbo].[Stay]([roomId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Stay_guestId_idx] ON [dbo].[Stay]([guestId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Stay_status_idx] ON [dbo].[Stay]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StayGuest_stayId_idx] ON [dbo].[StayGuest]([stayId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StayGuest_guestId_idx] ON [dbo].[StayGuest]([guestId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Reservation_branchId_idx] ON [dbo].[Reservation]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Reservation_status_idx] ON [dbo].[Reservation]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Reservation_roomTypeId_idx] ON [dbo].[Reservation]([roomTypeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Observation_branchId_idx] ON [dbo].[Observation]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Observation_status_idx] ON [dbo].[Observation]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ConciergeRequest_branchId_idx] ON [dbo].[ConciergeRequest]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ConciergeRequest_status_idx] ON [dbo].[ConciergeRequest]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Warehouse_branchId_idx] ON [dbo].[Warehouse]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_branchId_idx] ON [dbo].[Product]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Product_categoryId_idx] ON [dbo].[Product]([categoryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Stock_productId_idx] ON [dbo].[Stock]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Stock_warehouseId_idx] ON [dbo].[Stock]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CashSession_branchId_idx] ON [dbo].[CashSession]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CashSession_status_idx] ON [dbo].[CashSession]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CashMovement_cashSessionId_idx] ON [dbo].[CashMovement]([cashSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CashMovement_branchId_idx] ON [dbo].[CashMovement]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FolioSeries_branchId_idx] ON [dbo].[FolioSeries]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_branchId_idx] ON [dbo].[Invoice]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_status_idx] ON [dbo].[Invoice]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_type_idx] ON [dbo].[Invoice]([type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CreditDebitNote_branchId_idx] ON [dbo].[CreditDebitNote]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CreditDebitNote_invoiceId_idx] ON [dbo].[CreditDebitNote]([invoiceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryMovement_branchId_idx] ON [dbo].[InventoryMovement]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryMovement_productId_idx] ON [dbo].[InventoryMovement]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryMovement_warehouseId_idx] ON [dbo].[InventoryMovement]([warehouseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InventoryMovement_type_idx] ON [dbo].[InventoryMovement]([type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Supplier_branchId_idx] ON [dbo].[Supplier]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseInvoice_branchId_idx] ON [dbo].[PurchaseInvoice]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseInvoice_supplierId_idx] ON [dbo].[PurchaseInvoice]([supplierId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PurchaseInvoiceItem_purchaseId_idx] ON [dbo].[PurchaseInvoiceItem]([purchaseId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ChecklistItem_branchId_idx] ON [dbo].[ChecklistItem]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HousekeepingTask_branchId_idx] ON [dbo].[HousekeepingTask]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HousekeepingTask_roomId_idx] ON [dbo].[HousekeepingTask]([roomId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HousekeepingTask_status_idx] ON [dbo].[HousekeepingTask]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Attendance_branchId_idx] ON [dbo].[Attendance]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Attendance_userId_idx] ON [dbo].[Attendance]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Attendance_at_idx] ON [dbo].[Attendance]([at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityLog_branchId_idx] ON [dbo].[ActivityLog]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityLog_userId_idx] ON [dbo].[ActivityLog]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ActivityLog_createdAt_idx] ON [dbo].[ActivityLog]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [TaskInspection_taskId_idx] ON [dbo].[TaskInspection]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Maintenance_branchId_idx] ON [dbo].[Maintenance]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Maintenance_status_idx] ON [dbo].[Maintenance]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Revision_branchId_idx] ON [dbo].[Revision]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Revision_roomId_idx] ON [dbo].[Revision]([roomId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LaundryMachine_branchId_idx] ON [dbo].[LaundryMachine]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BiometricDevice_branchId_idx] ON [dbo].[BiometricDevice]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [WhatsAppInstance_branchId_idx] ON [dbo].[WhatsAppInstance]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageTemplate_branchId_idx] ON [dbo].[MessageTemplate]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MessageLog_branchId_idx] ON [dbo].[MessageLog]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Reminder_branchId_idx] ON [dbo].[Reminder]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DeviceEnrollment_deviceId_idx] ON [dbo].[DeviceEnrollment]([deviceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DeviceEnrollment_userId_idx] ON [dbo].[DeviceEnrollment]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LaundryTask_branchId_idx] ON [dbo].[LaundryTask]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LaundryTask_status_idx] ON [dbo].[LaundryTask]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Sale_branchId_idx] ON [dbo].[Sale]([branchId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Sale_cashSessionId_idx] ON [dbo].[Sale]([cashSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Sale_status_idx] ON [dbo].[Sale]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SaleItem_saleId_idx] ON [dbo].[SaleItem]([saleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_saleId_idx] ON [dbo].[Payment]([saleId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_cashSessionId_idx] ON [dbo].[Payment]([cashSessionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_branchId_idx] ON [dbo].[Payment]([branchId]);

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_permissionId_fkey] FOREIGN KEY ([permissionId]) REFERENCES [dbo].[Permission]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[UserBranch] ADD CONSTRAINT [UserBranch_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[UserBranch] ADD CONSTRAINT [UserBranch_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RefreshToken] ADD CONSTRAINT [RefreshToken_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Setting] ADD CONSTRAINT [Setting_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RoomType] ADD CONSTRAINT [RoomType_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RoomAttribute] ADD CONSTRAINT [RoomAttribute_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RoomTypeAttribute] ADD CONSTRAINT [RoomTypeAttribute_roomTypeId_fkey] FOREIGN KEY ([roomTypeId]) REFERENCES [dbo].[RoomType]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RoomTypeAttribute] ADD CONSTRAINT [RoomTypeAttribute_attributeId_fkey] FOREIGN KEY ([attributeId]) REFERENCES [dbo].[RoomAttribute]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ClientTier] ADD CONSTRAINT [ClientTier_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Rate] ADD CONSTRAINT [Rate_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Rate] ADD CONSTRAINT [Rate_roomTypeId_fkey] FOREIGN KEY ([roomTypeId]) REFERENCES [dbo].[RoomType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomRate] ADD CONSTRAINT [CustomRate_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CustomRate] ADD CONSTRAINT [CustomRate_roomTypeId_fkey] FOREIGN KEY ([roomTypeId]) REFERENCES [dbo].[RoomType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomRate] ADD CONSTRAINT [CustomRate_tierId_fkey] FOREIGN KEY ([tierId]) REFERENCES [dbo].[ClientTier]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Area] ADD CONSTRAINT [Area_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryCategory] ADD CONSTRAINT [InventoryCategory_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Item] ADD CONSTRAINT [Item_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Schedule] ADD CONSTRAINT [Schedule_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Room] ADD CONSTRAINT [Room_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Room] ADD CONSTRAINT [Room_roomTypeId_fkey] FOREIGN KEY ([roomTypeId]) REFERENCES [dbo].[RoomType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Stay] ADD CONSTRAINT [Stay_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Stay] ADD CONSTRAINT [Stay_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[Room]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Stay] ADD CONSTRAINT [Stay_guestId_fkey] FOREIGN KEY ([guestId]) REFERENCES [dbo].[Guest]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Stay] ADD CONSTRAINT [Stay_rateId_fkey] FOREIGN KEY ([rateId]) REFERENCES [dbo].[Rate]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Stay] ADD CONSTRAINT [Stay_tierId_fkey] FOREIGN KEY ([tierId]) REFERENCES [dbo].[ClientTier]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StayGuest] ADD CONSTRAINT [StayGuest_stayId_fkey] FOREIGN KEY ([stayId]) REFERENCES [dbo].[Stay]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[StayGuest] ADD CONSTRAINT [StayGuest_guestId_fkey] FOREIGN KEY ([guestId]) REFERENCES [dbo].[Guest]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [Reservation_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [Reservation_roomTypeId_fkey] FOREIGN KEY ([roomTypeId]) REFERENCES [dbo].[RoomType]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [Reservation_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[Room]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Reservation] ADD CONSTRAINT [Reservation_guestId_fkey] FOREIGN KEY ([guestId]) REFERENCES [dbo].[Guest]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Observation] ADD CONSTRAINT [Observation_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Observation] ADD CONSTRAINT [Observation_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[Room]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ConciergeRequest] ADD CONSTRAINT [ConciergeRequest_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ConciergeRequest] ADD CONSTRAINT [ConciergeRequest_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [dbo].[Room]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Warehouse] ADD CONSTRAINT [Warehouse_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Product] ADD CONSTRAINT [Product_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Product] ADD CONSTRAINT [Product_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[InventoryCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Stock] ADD CONSTRAINT [Stock_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Stock] ADD CONSTRAINT [Stock_warehouseId_fkey] FOREIGN KEY ([warehouseId]) REFERENCES [dbo].[Warehouse]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CashSession] ADD CONSTRAINT [CashSession_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CashMovement] ADD CONSTRAINT [CashMovement_cashSessionId_fkey] FOREIGN KEY ([cashSessionId]) REFERENCES [dbo].[CashSession]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[FolioSeries] ADD CONSTRAINT [FolioSeries_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Invoice] ADD CONSTRAINT [Invoice_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CreditDebitNote] ADD CONSTRAINT [CreditDebitNote_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CreditDebitNote] ADD CONSTRAINT [CreditDebitNote_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InventoryMovement] ADD CONSTRAINT [InventoryMovement_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Supplier] ADD CONSTRAINT [Supplier_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseInvoice] ADD CONSTRAINT [PurchaseInvoice_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseInvoice] ADD CONSTRAINT [PurchaseInvoice_supplierId_fkey] FOREIGN KEY ([supplierId]) REFERENCES [dbo].[Supplier]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PurchaseInvoiceItem] ADD CONSTRAINT [PurchaseInvoiceItem_purchaseId_fkey] FOREIGN KEY ([purchaseId]) REFERENCES [dbo].[PurchaseInvoice]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ChecklistItem] ADD CONSTRAINT [ChecklistItem_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[HousekeepingTask] ADD CONSTRAINT [HousekeepingTask_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TaskInspection] ADD CONSTRAINT [TaskInspection_taskId_fkey] FOREIGN KEY ([taskId]) REFERENCES [dbo].[HousekeepingTask]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Maintenance] ADD CONSTRAINT [Maintenance_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Revision] ADD CONSTRAINT [Revision_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LaundryMachine] ADD CONSTRAINT [LaundryMachine_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[BiometricDevice] ADD CONSTRAINT [BiometricDevice_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[WhatsAppInstance] ADD CONSTRAINT [WhatsAppInstance_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MessageTemplate] ADD CONSTRAINT [MessageTemplate_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MessageLog] ADD CONSTRAINT [MessageLog_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Reminder] ADD CONSTRAINT [Reminder_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[DeviceEnrollment] ADD CONSTRAINT [DeviceEnrollment_deviceId_fkey] FOREIGN KEY ([deviceId]) REFERENCES [dbo].[BiometricDevice]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[LaundryTask] ADD CONSTRAINT [LaundryTask_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Sale] ADD CONSTRAINT [Sale_branchId_fkey] FOREIGN KEY ([branchId]) REFERENCES [dbo].[Branch]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Sale] ADD CONSTRAINT [Sale_cashSessionId_fkey] FOREIGN KEY ([cashSessionId]) REFERENCES [dbo].[CashSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SaleItem] ADD CONSTRAINT [SaleItem_saleId_fkey] FOREIGN KEY ([saleId]) REFERENCES [dbo].[Sale]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_saleId_fkey] FOREIGN KEY ([saleId]) REFERENCES [dbo].[Sale]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
