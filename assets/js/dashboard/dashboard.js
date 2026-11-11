import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { reportService } from '../services/reportService.js';
import { renderTable } from '../components/table.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/formatter.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.DASHBOARD);
    renderNavbar('Dashboard Overview');

    await loadDashboardData();
});

function loadDashboardStats(stats) {
    document.getElementById('stat-revenue').textContent = formatCurrency(stats.totalRevenue);
    document.getElementById('stat-sales').textContent = stats.totalSalesCount;
    document.getElementById('stat-products').textContent = stats.totalProducts;
    document.getElementById('stat-low-stock').textContent = stats.lowStockCount;
}

async function loadDashboardData() {
    const stats = await reportService.getDashboardStats();
    loadDashboardStats(stats);

    // Render Recent Sales Table
    const recentSales = (await reportService.getSalesReport()).slice(0, 5);
    renderTable({
        containerId: 'recent-sales-table',
        headers: ['Sale ID', 'Customer', 'Date', 'Payment', 'Total'],
        data: recentSales,
        renderRow: (sale) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-weight: 600; color: var(--primary);">${sale.id}</td>
                <td style="padding: 1rem;">${sale.customerName}</td>
                <td style="padding: 1rem; font-size: 0.875rem; color: var(--text-muted);">${formatDate(sale.date)}</td>
                <td style="padding: 1rem;"><span class="badge badge-success" style="background-color: var(--primary-light); color: var(--primary);">${sale.paymentMethod}</span></td>
                <td style="padding: 1rem; font-weight: 600;">${formatCurrency(sale.total)}</td>
            </tr>
        `
    });

    // Render Top Selling Products
    const topProductsContainer = document.getElementById('top-products-list');
    if (topProductsContainer) {
        if (stats.topProducts.length === 0) {
            topProductsContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No sales recorded yet.</p>';
        } else {
            topProductsContainer.innerHTML = stats.topProducts.map((p, index) => `
                <div class="flex justify-between items-center" style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
                    <div class="flex items-center gap-3">
                        <span style="font-weight: 700; color: var(--primary); font-size: 1.125rem;">#${index + 1}</span>
                        <div>
                            <h4 style="font-weight: 600; font-size: 0.875rem;">${p.name}</h4>
                            <span style="font-size: 0.75rem; color: var(--text-muted);">${p.quantity} units sold</span>
                        </div>
                    </div>
                    <span style="font-weight: 600; font-size: 0.875rem;">${formatCurrency(p.revenue)}</span>
                </div>
            `).join('');
        }
    }
}
