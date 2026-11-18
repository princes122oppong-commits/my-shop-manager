import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { reportService } from '../services/reportService.js';
import { renderTable } from '../components/table.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/formatter.js';
import ROUTES, { checkAuth } from '../config/routes.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.REPORTS);
    renderNavbar('Sales Reports');

    // Set default dates (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');

    // The reports hub links to dedicated report pages and does not contain
    // the sales report filter controls. Only load the inline report when
    // those controls are present.
    if (!startInput || !endInput) return;

    startInput.value = start.toISOString().split('T')[0];
    endInput.value = end.toISOString().split('T')[0];

    await loadReport();
    setupEventListeners();
});

async function loadReport() {
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');
    if (!startInput || !endInput) return;

    const startDate = startInput.value;
    const endDate = endInput.value;

    const sales = await reportService.getSalesReport(startDate, endDate);

    // Calculate Summary Metrics
    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const totalTransactions = sales.length;
    const avgOrder = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    document.getElementById('report-total-revenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('report-total-transactions').textContent = totalTransactions;
    document.getElementById('report-avg-order').textContent = formatCurrency(avgOrder);

    // Render Table
    renderTable({
        containerId: 'reports-table-container',
        headers: ['Transaction ID', 'Customer', 'Date', 'Payment Method', 'Items Count', 'Total Amount'],
        data: sales,
        renderRow: (s) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-weight: 600; color: var(--primary);">${escapeHtml(s.id)}</td>
                <td style="padding: 1rem;">${escapeHtml(s.customerName || 'Walk-in customer')}</td>
                <td style="padding: 1rem; font-size: 0.875rem; color: var(--text-muted);">${formatDate(s.date)}</td>
                <td style="padding: 1rem;"><span class="badge" style="background-color: var(--primary-light); color: var(--primary);">${escapeHtml(s.paymentMethod)}</span></td>
                <td style="padding: 1rem; font-weight: 500;">${(s.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} items</td>
                <td style="padding: 1rem; font-weight: 600;">${formatCurrency(s.total)}</td>
            </tr>
        `
    });
}

function setupEventListeners() {
    document.getElementById('filter-report-btn')?.addEventListener('click', loadReport);
    document.getElementById('export-report-btn')?.addEventListener('click', exportToCSV);
}

async function exportToCSV() {
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');
    if (!startInput || !endInput) return;

    const startDate = startInput.value;
    const endDate = endInput.value;
    const sales = await reportService.getSalesReport(startDate, endDate);

    if (sales.length === 0) {
        alert('No data to export!');
        return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Transaction ID,Customer,Date,Payment Method,Total Amount\n';

    sales.forEach(s => {
        const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        csvContent += [s.id, s.customerName || 'Walk-in customer', s.date, s.paymentMethod, Number(s.total || 0).toFixed(2)].map(csvCell).join(',') + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
