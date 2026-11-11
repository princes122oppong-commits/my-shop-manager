import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { employeeService } from '../services/employeeService.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { formatCurrency } from '../utils/currency.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    renderSidebar(ROUTES.EMPLOYEES);
    renderNavbar('Employees');
    loadEmployees();

    document.getElementById('add-employee-btn')?.addEventListener('click', () => {
        openEmployeeModal();
    });
});

function loadEmployees() {
    const employees = employeeService.getAll();

    renderTable({
        containerId: 'employees-table-container',
        headers: ['Name', 'Email', 'Phone', 'Role', 'Department', 'Status', 'Actions'],
        data: employees,
        renderRow: (employee) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-weight: 600;">${employee.name}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${employee.email}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${employee.phone}</td>
                <td style="padding: 1rem;">
                    <span class="badge badge-info">${employee.role}</span>
                </td>
                <td style="padding: 1rem;">${employee.department}</td>
                <td style="padding: 1rem;">
                    <span class="badge badge-success">${employee.status}</span>
                </td>
                <td style="padding: 1rem;">
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editEmployee('${employee.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteEmployee('${employee.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `
    });
}

function openEmployeeModal(employeeId = null) {
    const employee = employeeId ? employeeService.getById(employeeId) : null;
    const isEdit = !!employee;

    const modal = createModal({
        id: 'employee-modal',
        title: isEdit ? 'Edit Employee' : 'Add New Employee',
        submitText: isEdit ? 'Update' : 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Full Name</label>
                <input type="text" id="employee-name" class="form-control" value="${employee?.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" id="employee-email" class="form-control" value="${employee?.email || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="tel" id="employee-phone" class="form-control" value="${employee?.phone || ''}" required>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                    <label class="form-label">Role</label>
                    <select id="employee-role" class="form-control">
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="cashier">Cashier</option>
                        <option value="inventory_officer">Inventory Officer</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Department</label>
                    <input type="text" id="employee-department" class="form-control" value="${employee?.department || ''}" required>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Salary ($)</label>
                <input type="number" step="0.01" id="employee-salary" class="form-control" value="${employee?.salary || ''}" required>
            </div>
        `,
        onSubmit: (data, close) => {
            const employeeData = {
                name: data.employeeName,
                email: data.employeeEmail,
                phone: data.employeePhone,
                role: data.employeeRole,
                department: data.employeeDepartment,
                salary: parseFloat(data.employeeSalary)
            };

            if (isEdit) {
                employeeService.update(employeeId, employeeData);
                addAuditLog('Employee Updated', `Employee updated: ${employeeData.name}`);
                showAlert('Employee updated successfully!', 'success');
            } else {
                employeeService.create(employeeData);
                addAuditLog('Employee Created', `New employee created: ${employeeData.name}`);
                showAlert('Employee created successfully!', 'success');
            }

            close();
            loadEmployees();
        }
    });

    modal.open();
}

window.editEmployee = (id) => openEmployeeModal(id);

window.deleteEmployee = (id) => {
    const employee = employeeService.getById(id);
    if (confirm(`Are you sure you want to delete "${employee.name}"?`)) {
        employeeService.delete(id);
        addAuditLog('Employee Deleted', `Employee deleted: ${employee.name}`);
        showAlert('Employee deleted successfully!', 'success');
        loadEmployees();
    }
};
