import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { reportService } from '../services/reportService.js';
import { formatCurrency } from '../utils/currency.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.FINANCE);
    renderNavbar('Finance Management');
    await loadFinancialOverview();
});

async function loadFinancialOverview() {
    const profitLoss = await reportService.getProfitLoss();
    const sales = await reportService.getSalesReport();
    const expenses = await reportService.getExpenseReport();
    
    const today = new Date().toDateString();
    const todaySales = sales.filter(s => new Date(s.date).toDateString() === today);
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
    
    const todayExpenses = expenses.filter(e => new Date(e.date).toDateString() === today);
    const todayExpenseTotal = todayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    const container = document.getElementById('finance-overview-container');
    container.innerHTML = `
        <div class="grid grid-cols-3 gap-4">
            <div style="padding: 1.5rem; border-radius: var(--radius-sm); background-color: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.1);">
                <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Today's Revenue</div>
                <div style="font-size: 1.75rem; font-weight: 700; color: var(--success);">${formatCurrency(todayRevenue)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">${todaySales.length} transactions</div>
            </div>
            
            <div style="padding: 1.5rem; border-radius: var(--radius-sm); background-color: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.1);">
                <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Today's Expenses</div>
                <div style="font-size: 1.75rem; font-weight: 700; color: var(--danger);">${formatCurrency(todayExpenseTotal)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">${todayExpenses.length} transactions</div>
            </div>
            
            <div style="padding: 1.5rem; border-radius: var(--radius-sm); background-color: rgba(79, 70, 229, 0.05); border: 1px solid rgba(79, 70, 229, 0.1);">
                <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">Net Profit</div>
                <div style="font-size: 1.75rem; font-weight: 700; color: var(--primary);">${formatCurrency(profitLoss.netProfit)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">All time</div>
            </div>
        </div>
        
        <div style="margin-top: 2rem; padding: 1.5rem; border-radius: var(--radius-sm); background-color: var(--bg-main); border: 1px solid var(--border-color);">
            <h4 style="font-weight: 600; font-size: 1rem; margin-bottom: 1rem;">Quick Actions</h4>
            <div class="flex gap-2">
                <a href="daily-cash-book.html" class="btn btn-primary">
                    <i data-lucide="book-open" style="width: 16px; height: 16px;"></i>
                    <span>Daily Cash Book</span>
                </a>
                <a href="transactions.html" class="btn btn-secondary">
                    <i data-lucide="list" style="width: 16px; height: 16px;"></i>
                    <span>View Transactions</span>
                </a>
            </div>
        </div>
    `;
    
    if (window.lucide) window.lucide.createIcons();
}
