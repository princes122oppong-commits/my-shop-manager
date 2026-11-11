import ROUTES from '../config/routes.js';
import { authService } from '../services/authService.js';

export function renderSidebar(activePage) {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    const menuItems = [
        { name: 'Dashboard', icon: 'layout-dashboard', route: ROUTES.DASHBOARD },
        { name: 'Products', icon: 'package', route: ROUTES.PRODUCTS },
        { name: 'Inventory', icon: 'boxes', route: ROUTES.INVENTORY },
        { name: 'POS / Sales', icon: 'shopping-cart', route: ROUTES.SALES },
        { name: 'Customers', icon: 'users', route: ROUTES.CUSTOMERS },
        { name: 'Suppliers', icon: 'truck', route: ROUTES.SUPPLIERS },
        { name: 'Employees', icon: 'user-check', route: ROUTES.EMPLOYEES },
        { name: 'Expenses', icon: 'receipt', route: ROUTES.EXPENSES },
        { name: 'Reports', icon: 'bar-chart-3', route: ROUTES.REPORTS },
        { name: 'Finance', icon: 'wallet', route: ROUTES.FINANCE },
        { name: 'Promotions', icon: 'tag', route: ROUTES.PROMOTIONS },
        { name: 'Notifications', icon: 'bell', route: ROUTES.NOTIFICATIONS },
        { name: 'Audit Logs', icon: 'file-text', route: ROUTES.AUDIT_LOGS },
        { name: 'User Management', icon: 'shield', route: ROUTES.USER_MANAGEMENT },
        { name: 'Settings', icon: 'settings', route: ROUTES.SETTINGS }
    ];

    const menuHtml = menuItems.map(item => {
        const isActive = activePage === item.route ? 'active' : '';
        return `
            <li class="sidebar-item ${isActive}">
                <a href="${item.route}" class="sidebar-link">
                    <i data-lucide="${item.icon}"></i>
                    <span>${item.name}</span>
                </a>
            </li>
        `;
    }).join('');

    sidebarContainer.innerHTML = `
        <div class="sidebar">
            <div class="sidebar-brand">
                <i data-lucide="cpu" style="color: var(--primary);"></i>
                <span>JoeTech Store</span>
            </div>
            <ul class="sidebar-menu">
                ${menuHtml}
            </ul>
            <div class="sidebar-footer">
                <button id="logout-btn" class="sidebar-logout">
                    <i data-lucide="log-out"></i>
                    <span>Logout</span>
                </button>
            </div>
        </div>
    `;

    // Bind logout event
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await authService.logout();
        window.location.href = ROUTES.LOGIN;
    });

    // Re-initialize lucide icons if available
    if (window.lucide) {
        window.lucide.createIcons();
    }
}
