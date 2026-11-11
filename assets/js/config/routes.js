const ROUTES = {
    INDEX: 'index.html',
    LOGIN: 'login.html',
    REGISTER: 'register.html',
    FORGOT_PASSWORD: 'forgot-password.html',
    RESET_PASSWORD: 'reset-password.html',
    DASHBOARD: 'dashboard.html',
    PRODUCTS: 'products.html',
    PRODUCT_CATEGORIES: 'product-categories.html',
    PRODUCT_BRANDS: 'product-brands.html',
    PRODUCT_UNITS: 'product-units.html',
    PRODUCT_VARIANTS: 'product-variants.html',
    INVENTORY: 'inventory.html',
    INVENTORY_ADJUSTMENTS: 'inventory-adjustments.html',
    STOCK_COUNT: 'stock-count.html',
    WAREHOUSES: 'warehouses.html',
    SALES: 'sales.html',
    SALES_HISTORY: 'sales-history.html',
    SALES_RETURNS: 'sales-returns.html',
    RECEIPTS: 'receipts.html',
    CUSTOMERS: 'customers.html',
    CUSTOMER_GROUPS: 'customer-groups.html',
    CUSTOMER_WALLET: 'customer-wallet.html',
    LOYALTY_PROGRAM: 'loyalty-program.html',
    SUPPLIERS: 'suppliers.html',
    SUPPLIER_PAYMENTS: 'supplier-payments.html',
    PURCHASE_ORDERS: 'purchase-orders.html',
    PURCHASING: 'purchasing.html',
    PURCHASE_RETURNS: 'purchase-returns.html',
    EXPENSES: 'expenses.html',
    EXPENSE_CATEGORIES: 'expense-categories.html',
    EXPENSE_REPORTS: 'expense-reports.html',
    EMPLOYEES: 'employees.html',
    EMPLOYEE_ROLES: 'employee-roles.html',
    ATTENDANCE: 'attendance.html',
    LEAVE_REQUESTS: 'leave-requests.html',
    PAYROLL: 'payroll.html',
    REPORTS: 'reports.html',
    SALES_REPORT: 'sales-report.html',
    INVENTORY_REPORT: 'inventory-report.html',
    CUSTOMER_REPORT: 'customer-report.html',
    SUPPLIER_REPORT: 'supplier-report.html',
    EMPLOYEE_REPORT: 'employee-report.html',
    EXPENSE_REPORT: 'expense-report.html',
    PROFIT_LOSS: 'profit-loss.html',
    TAX_REPORT: 'tax-report.html',
    FINANCE: 'finance.html',
    CASH_FLOW: 'cash-flow.html',
    BANK_ACCOUNTS: 'bank-accounts.html',
    DAILY_CASH_BOOK: 'daily-cash-book.html',
    TRANSACTIONS: 'transactions.html',
    NOTIFICATIONS: 'notifications.html',
    PROMOTIONS: 'promotions.html',
    COUPONS: 'coupons.html',
    AUDIT_LOGS: 'audit-logs.html',
    USER_MANAGEMENT: 'user-management.html',
    PROFILE: 'profile.html',
    BRANCHES: 'branches.html',
    SETTINGS: 'settings.html',
    BACKUP_RESTORE: 'backup-restore.html',
    SECURITY: 'security.html',
    SYSTEM_ADMIN: 'system-admin.html'
};

export function checkAuth() {
    const currentUser = localStorage.getItem('joetech_current_user');
    const currentPage = window.location.pathname.split('/').pop();

    if (!currentUser && currentPage !== ROUTES.LOGIN && currentPage !== 'index.html' && currentPage !== '') {
        window.location.href = ROUTES.LOGIN;
    } else if (currentUser && (currentPage === ROUTES.LOGIN || currentPage === 'index.html' || currentPage === '')) {
        window.location.href = ROUTES.DASHBOARD;
    }
}

export default ROUTES;
