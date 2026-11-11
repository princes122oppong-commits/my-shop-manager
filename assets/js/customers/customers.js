import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { customerService } from '../services/customerService.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { formatCurrency } from '../utils/currency.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.CUSTOMERS);
    renderNavbar('Customers');
    await loadCustomers();

    document.getElementById('add-customer-btn')?.addEventListener('click', async () => {
        await openCustomerModal();
    });
});

async function loadCustomers() {
    const customers = await customerService.getAll();

    renderTable({
        containerId: 'customers-table-container',
        headers: ['Name', 'Email', 'Phone', 'Total Purchases', 'Loyalty Points', 'Actions'],
        data: customers,
        renderRow: (customer) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-weight: 600;">${customer.name}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${customer.email}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${customer.phone}</td>
                <td style="padding: 1rem; font-weight: 600;">${formatCurrency(customer.totalPurchases)}</td>
                <td style="padding: 1rem;">
                    <span class="badge badge-success">${customer.loyaltyPoints} pts</span>
                </td>
                <td style="padding: 1rem;">
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editCustomer('${customer.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteCustomer('${customer.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `
    });
}

async function openCustomerModal(customerId = null) {
    const customer = customerId ? await customerService.getById(customerId) : null;
    const isEdit = !!customer;

    const modal = createModal({
        id: 'customer-modal',
        title: isEdit ? 'Edit Customer' : 'Add New Customer',
        submitText: isEdit ? 'Update' : 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Full Name</label>
                <input type="text" id="customer-name" class="form-control" value="${customer?.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" id="customer-email" class="form-control" value="${customer?.email || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" id="customer-phone" class="form-control" value="${customer?.phone || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Address</label>
                <textarea id="customer-address" class="form-control" rows="2">${customer?.address || ''}</textarea>
            </div>
        `,
        onSubmit: async (data, close) => {
            const customerData = {
                name: data.customerName,
                email: data.customerEmail,
                phone: data.customerPhone,
                address: data.customerAddress
            };

            if (isEdit) {
                await customerService.update(customerId, customerData);
                addAuditLog('Customer Updated', `Customer updated: ${customerData.name}`);
                showAlert('Customer updated successfully!', 'success');
            } else {
                await customerService.create(customerData);
                addAuditLog('Customer Created', `New customer created: ${customerData.name}`);
                showAlert('Customer created successfully!', 'success');
            }

            close();
            await loadCustomers();
        }
    });

    modal.open();
}

window.editCustomer = async (id) => await openCustomerModal(id);

window.deleteCustomer = async (id) => {
    const customer = await customerService.getById(id);
    if (confirm(`Are you sure you want to delete "${customer.name}"?`)) {
        await customerService.delete(id);
        addAuditLog('Customer Deleted', `Customer deleted: ${customer.name}`);
        showAlert('Customer deleted successfully!', 'success');
        await loadCustomers();
    }
};
