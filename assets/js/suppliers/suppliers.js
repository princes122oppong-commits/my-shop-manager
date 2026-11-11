import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { supplierService } from '../services/supplierService.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { formatCurrency } from '../utils/currency.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.SUPPLIERS);
    renderNavbar('Suppliers');
    await loadSuppliers();

    document.getElementById('add-supplier-btn')?.addEventListener('click', async () => {
        await openSupplierModal();
    });
});

async function loadSuppliers() {
    const suppliers = await supplierService.getAll();

    renderTable({
        containerId: 'suppliers-table-container',
        headers: ['Supplier Name', 'Contact Person', 'Email', 'Phone', 'Total Orders', 'Actions'],
        data: suppliers,
        renderRow: (supplier) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-weight: 600;">${supplier.name}</td>
                <td style="padding: 1rem;">${supplier.contactPerson}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${supplier.email}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${supplier.phone}</td>
                <td style="padding: 1rem; font-weight: 600;">${supplier.totalOrders || 0}</td>
                <td style="padding: 1rem;">
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editSupplier('${supplier.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteSupplier('${supplier.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `
    });
}

async function openSupplierModal(supplierId = null) {
    const supplier = supplierId ? await supplierService.getById(supplierId) : null;
    const isEdit = !!supplier;

    const modal = createModal({
        id: 'supplier-modal',
        title: isEdit ? 'Edit Supplier' : 'Add New Supplier',
        submitText: isEdit ? 'Update' : 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Company Name</label>
                <input type="text" id="supplier-name" class="form-control" value="${supplier?.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Contact Person</label>
                <input type="text" id="supplier-contact" class="form-control" value="${supplier?.contactPerson || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" id="supplier-email" class="form-control" value="${supplier?.email || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" id="supplier-phone" class="form-control" value="${supplier?.phone || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Address</label>
                <textarea id="supplier-address" class="form-control" rows="2">${supplier?.address || ''}</textarea>
            </div>
        `,
        onSubmit: async (data, close) => {
            const supplierData = {
                name: data.supplierName,
                contactPerson: data.supplierContact,
                email: data.supplierEmail,
                phone: data.supplierPhone,
                address: data.supplierAddress
            };

            if (isEdit) {
                await supplierService.update(supplierId, supplierData);
                addAuditLog('Supplier Updated', `Supplier updated: ${supplierData.name}`);
                showAlert('Supplier updated successfully!', 'success');
            } else {
                await supplierService.create(supplierData);
                addAuditLog('Supplier Created', `New supplier created: ${supplierData.name}`);
                showAlert('Supplier created successfully!', 'success');
            }

            close();
            await loadSuppliers();
        }
    });

    modal.open();
}

window.editSupplier = async (id) => await openSupplierModal(id);

window.deleteSupplier = async (id) => {
    const supplier = await supplierService.getById(id);
    if (confirm(`Are you sure you want to delete "${supplier.name}"?`)) {
        await supplierService.delete(id);
        addAuditLog('Supplier Deleted', `Supplier deleted: ${supplier.name}`);
        showAlert('Supplier deleted successfully!', 'success');
        await loadSuppliers();
    }
};
