import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { authService } from '../services/authService.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    renderSidebar(ROUTES.USER_MANAGEMENT);
    renderNavbar('User Management');
    loadUsers();

    document.getElementById('add-user-btn')?.addEventListener('click', () => {
        openUserModal();
    });
});

function loadUsers() {
    const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]');
    const currentUser = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER) || '{}');

    renderTable({
        containerId: 'users-table-container',
        headers: ['Name', 'Email', 'Role', 'Status', 'Actions'],
        data: users,
        renderRow: (user) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-weight: 600;">${user.name}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${user.email}</td>
                <td style="padding: 1rem;">
                    <span class="badge badge-info">${user.role}</span>
                </td>
                <td style="padding: 1rem;">
                    <span class="badge badge-success">Active</span>
                </td>
                <td style="padding: 1rem;">
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editUser('${user.id}')">Edit</button>
                        ${user.id !== currentUser.id ? `<button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteUser('${user.id}')">Delete</button>` : ''}
                    </div>
                </td>
            </tr>
        `
    });
}

function openUserModal(userId = null) {
    const user = userId ? JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]').find(u => u.id === userId) : null;
    const isEdit = !!user;

    const modal = createModal({
        id: 'user-modal',
        title: isEdit ? 'Edit User' : 'Add New User',
        submitText: isEdit ? 'Update' : 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Full Name</label>
                <input type="text" id="user-name" class="form-control" value="${user?.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input type="email" id="user-email" class="form-control" value="${user?.email || ''}" required>
            </div>
            ${!isEdit ? `
            <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" id="user-password" class="form-control" required minlength="6">
            </div>
            ` : ''}
            <div class="form-group">
                <label class="form-label">Role</label>
                <select id="user-role" class="form-control">
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="cashier">Cashier</option>
                    <option value="inventory_officer">Inventory Officer</option>
                    <option value="viewer">Viewer</option>
                </select>
            </div>
        `,
        onSubmit: (data, close) => {
            const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]');

            if (isEdit) {
                const index = users.findIndex(u => u.id === userId);
                users[index] = { ...users[index], name: data.userName, email: data.userEmail, role: data.userRole };
                addAuditLog('User Updated', `User updated: ${data.userName}`);
                showAlert('User updated successfully!', 'success');
            } else {
                if (users.some(u => u.email === data.userEmail)) {
                    showAlert('Email already exists!', 'error');
                    return;
                }
                users.push({
                    id: Date.now().toString(),
                    name: data.userName,
                    email: data.userEmail,
                    password: data.userPassword,
                    role: data.userRole
                });
                addAuditLog('User Created', `New user created: ${data.userName}`);
                showAlert('User created successfully!', 'success');
            }

            localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(users));
            close();
            loadUsers();
        }
    });

    modal.open();
}

window.editUser = (id) => {
    openUserModal(id);
};

window.deleteUser = (id) => {
    if (confirm('Are you sure you want to delete this user?')) {
        authService.init();
        const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]');
        const user = users.find(u => u.id === id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(users.filter(u => u.id !== id)));
        addAuditLog('User Deleted', `User deleted: ${user?.name}`);
        showAlert('User deleted successfully!', 'success');
        loadUsers();
    }
};
