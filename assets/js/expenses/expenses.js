import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { expenseService } from '../services/expenseService.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { formatCurrency } from '../utils/currency.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.EXPENSES);
    renderNavbar('Expenses');
    await loadExpenses();

    document.getElementById('add-expense-btn')?.addEventListener('click', async () => {
        await openExpenseModal();
    });
});

async function loadExpenses() {
    const expenses = await expenseService.getAll();

    renderTable({
        containerId: 'expenses-table-container',
        headers: ['Date', 'Category', 'Description', 'Amount', 'Payment Method', 'Status', 'Actions'],
        data: expenses,
        renderRow: (expense) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-size: 0.875rem; color: var(--text-muted);">${new Date(expense.date).toLocaleDateString()}</td>
                <td style="padding: 1rem; font-weight: 600;">${expense.category}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${expense.description}</td>
                <td style="padding: 1rem; font-weight: 600;">${formatCurrency(expense.amount)}</td>
                <td style="padding: 1rem;">${expense.paymentMethod}</td>
                <td style="padding: 1rem;">
                    <span class="badge badge-success">${expense.status}</span>
                </td>
                <td style="padding: 1rem;">
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editExpense('${expense.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteExpense('${expense.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `
    });
}

async function openExpenseModal(expenseId = null) {
    const expense = expenseId ? await expenseService.getById(expenseId) : null;
    const isEdit = !!expense;

    const modal = createModal({
        id: 'expense-modal',
        title: isEdit ? 'Edit Expense' : 'Add New Expense',
        submitText: isEdit ? 'Update' : 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Category</label>
                <select id="expense-category" class="form-control">
                    ${CONSTANTS.EXPENSE_CATEGORIES.map(cat => `<option value="${cat}" ${expense?.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea id="expense-description" class="form-control" rows="2" required>${expense?.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Amount ($)</label>
                <input type="number" step="0.01" id="expense-amount" class="form-control" value="${expense?.amount || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Payment Method</label>
                <select id="expense-payment" class="form-control">
                    ${CONSTANTS.PAYMENT_METHODS.map(method => `<option value="${method}" ${expense?.paymentMethod === method ? 'selected' : ''}>${method}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Date</label>
                <input type="date" id="expense-date" class="form-control" value="${expense?.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Receipt Number</label>
                <input type="text" id="expense-receipt" class="form-control" value="${expense?.receipt || ''}">
            </div>
        `,
        onSubmit: async (data, close) => {
            const expenseData = {
                category: data.expenseCategory,
                description: data.expenseDescription,
                amount: parseFloat(data.expenseAmount),
                paymentMethod: data.expensePayment,
                date: data.expenseDate,
                receipt: data.expenseReceipt,
                status: 'paid'
            };

            if (isEdit) {
                await expenseService.update(expenseId, expenseData);
                addAuditLog('Expense Updated', `Expense updated: ${expenseData.description}`);
                showAlert('Expense updated successfully!', 'success');
            } else {
                await expenseService.create(expenseData);
                addAuditLog('Expense Created', `New expense: ${expenseData.description}`);
                showAlert('Expense created successfully!', 'success');
            }

            close();
            await loadExpenses();
        }
    });

    modal.open();
}

window.editExpense = async (id) => await openExpenseModal(id);

window.deleteExpense = async (id) => {
    const expense = await expenseService.getById(id);
    if (confirm(`Are you sure you want to delete this expense?`)) {
        await expenseService.delete(id);
        addAuditLog('Expense Deleted', `Expense deleted: ${expense.description}`);
        showAlert('Expense deleted successfully!', 'success');
        await loadExpenses();
    }
};
