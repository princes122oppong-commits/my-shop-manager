import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { reportService } from '../services/reportService.js';
import { renderTable } from '../components/table.js';
import { formatCurrency } from '../utils/currency.js';
import { formatDate } from '../utils/formatter.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.REPORTS);
    renderNavbar('Sales Reports');

    // Set default dates (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    document.getElementById('report-start-date').value = start.toISOString().split('T')[0];
    document.getElementById('report-end-date').value = end.toISOString().split('T')[0];

    await loadReport();
    setupEventListeners();
});

async function loadReport() {
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;

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
                <td style="padding: 1rem; font-weight: 600; color: var(--primary);">${s.id}</td>
                <td style="padding: 1rem;">${s.customerName}</td>
                <td style="padding: 1rem; font-size: 0.875rem; color: var(--text-muted);">${formatDate(s.date)}</td>
                <td style="padding: 1rem;"><span class="badge" style="background-color: var(--primary-light); color: var(--primary);">${s.paymentMethod}</span></td>
                <td style="padding: 1rem; font-weight: 500;">${s.items.reduce((sum, item) => sum + item.quantity, 0)} items</td>
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
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    const sales = await reportService.getSalesReport(startDate, endDate);

    if (sales.length === 0) {
        alert('No data to export!');
        return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Transaction ID,Customer,Date,Payment Method,Total Amount\n';

    sales.forEach(s => {
        csvContent += `${s.id},"${s.customerName}",${s.date},${s.paymentMethod},${s.total.toFixed(2)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_report_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
