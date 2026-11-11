const CONSTANTS = {
    STORAGE_KEYS: {
        USERS: 'joetech_users',
        CURRENT_USER: 'joetech_current_user',
        PRODUCTS: 'joetech_products',
        INVENTORY_MOVEMENTS: 'joetech_inventory_movements',
        SALES: 'joetech_sales',
        CUSTOMERS: 'joetech_customers',
        SUPPLIERS: 'joetech_suppliers',
        EMPLOYEES: 'joetech_employees',
        EXPENSES: 'joetech_expenses',
        SETTINGS: 'joetech_settings',
        AUDIT_LOGS: 'joetech_audit_logs',
        NOTIFICATIONS: 'joetech_notifications',
        CATEGORIES: 'joetech_categories',
        BRANDS: 'joetech_brands',
        UNITS: 'joetech_units',
        PRODUCT_VARIANTS: 'joetech_product_variants',
        WAREHOUSES: 'joetech_warehouses',
        PURCHASE_ORDERS: 'joetech_purchase_orders',
        PROMOTIONS: 'joetech_promotions',
        COUPONS: 'joetech_coupons',
        BRANCHES: 'joetech_branches',
        STOCK_COUNTS: 'joetech_stock_counts',
        CASH_REGISTER: 'joetech_cash_register',
        BANK_ACCOUNTS: 'joetech_bank_accounts',
        TRANSACTIONS: 'joetech_transactions'
    },
    DEFAULT_SETTINGS: {
        storeName: 'JoeTech Store',
        currency: 'USD',
        taxRate: 8.25,
        lowStockThreshold: 10,
        theme: 'light',
        enable2FA: false,
        enableEmailNotifications: true,
        enableSMSNotifications: false
    },
    USER_ROLES: {
        ADMIN: 'admin',
        MANAGER: 'manager',
        CASHIER: 'cashier',
        INVENTORY_OFFICER: 'inventory_officer',
        VIEWER: 'viewer'
    },
    PAYMENT_METHODS: ['Cash', 'Credit Card', 'Mobile Transfer', 'Check'],
    EXPENSE_CATEGORIES: ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Marketing', 'Maintenance', 'Other']
};

export default CONSTANTS;
