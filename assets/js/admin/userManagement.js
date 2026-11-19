import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { authService } from '../services/authService.js';
import { employeeService } from '../services/employeeService.js';
import { organizationService, branchService } from '../services/organizationService.js';
import { getSupabaseClient } from '../services/supabase.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';

let hostedMode = false;
const roleOptions = [
    ['admin', 'Admin'], ['manager', 'Manager'], ['cashier', 'Cashier'],
    ['inventory_officer', 'Inventory Officer'], ['viewer', 'Viewer']
];

document.addEventListener('DOMContentLoaded', async () => {
    if (!await checkAuth()) return;
    renderSidebar(ROUTES.USER_MANAGEMENT);
    renderNavbar('User Management');
    hostedMode = Boolean(await getSupabaseClient());
    if (hostedMode && !['owner', 'admin'].includes(organizationService.getCurrentOrganization()?.role)) {
        document.getElementById('add-user-btn')?.setAttribute('hidden', '');
        document.getElementById('users-table-container').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">Only store owners and administrators can manage staff access.</p>';
        return;
    }
    await loadUsers();
    document.getElementById('add-user-btn')?.addEventListener('click', () => openUserModal());
});

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

async function loadUsers() {
    try {
        const users = hostedMode
            ? await employeeService.getAll()
            : JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]');
        let currentUserId = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER) || '{}').id;
        if (hostedMode) {
            const client = await getSupabaseClient();
            const { data } = await client.auth.getUser();
            currentUserId = data?.user?.id || currentUserId;
        }
        renderTable({
            containerId: 'users-table-container',
            headers: ['Name', 'Email', 'Role', 'Status', 'Actions'],
            data: users,
            renderRow: user => `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 1rem; font-weight: 600;">${escapeHtml(user.name)}</td>
                    <td style="padding: 1rem; color: var(--text-muted);">${escapeHtml(user.email)}</td>
                    <td style="padding: 1rem;"><span class="badge badge-info">${escapeHtml(user.role)}</span></td>
                    <td style="padding: 1rem;"><span class="badge ${user.status === 'inactive' ? 'badge-danger' : 'badge-success'}">${user.status === 'inactive' ? 'Inactive' : 'Active'}</span></td>
                    <td style="padding: 1rem;"><div class="flex gap-2">
                        ${user.id !== currentUserId && user.role !== 'owner' ? `<button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editUser('${escapeHtml(user.id)}')">Edit</button>` : ''}
                        ${user.id !== currentUserId && user.role !== 'owner' ? `<button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteUser('${escapeHtml(user.id)}')">Remove</button>` : ''}
                    </div></td>
                </tr>`
        });
    } catch (error) {
        showAlert(error.message || 'Could not load store staff.', 'error');
    }
}

function roleSelect(value = 'cashier') {
    return roleOptions.map(([role, label]) => `<option value="${role}" ${role === value ? 'selected' : ''}>${label}</option>`).join('');
}

async function openUserModal(userId = null) {
    const user = userId
        ? hostedMode
            ? await employeeService.getById(userId)
            : JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]').find(item => item.id === userId)
        : null;
    const isEdit = Boolean(user);
    const hostedForm = hostedMode ? `
        <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="user-name" class="form-control" value="${escapeHtml(user?.name || '')}" required></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" id="user-email" class="form-control" value="${escapeHtml(user?.email || '')}" ${isEdit ? 'disabled' : ''} required></div>
        <div class="form-group"><label class="form-label">Role</label><select id="user-role" class="form-control">${roleSelect(user?.role)}</select></div>
        <div class="form-group"><label class="form-label">Department</label><input type="text" id="user-department" class="form-control" value="${escapeHtml(user?.department || 'General')}" required></div>
        <div class="form-group"><label class="form-label">Salary</label><input type="number" min="0" step="0.01" id="user-salary" class="form-control" value="${Number(user?.salary) || 0}" required></div>
        ${isEdit ? '' : '<p class="text-muted">An invitation email will let the staff member set their password.</p>'}
    ` : `
        <div class="form-group"><label class="form-label">Full Name</label><input type="text" id="user-name" class="form-control" value="${escapeHtml(user?.name || '')}" required></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" id="user-email" class="form-control" value="${escapeHtml(user?.email || '')}" required></div>
        ${isEdit ? '' : '<div class="form-group"><label class="form-label">Password</label><input type="password" id="user-password" class="form-control" required minlength="6"></div>'}
        <div class="form-group"><label class="form-label">Role</label><select id="user-role" class="form-control">${roleSelect(user?.role)}</select></div>
    `;

    const modal = createModal({
        id: 'user-modal', title: isEdit ? 'Edit Staff Member' : hostedMode ? 'Invite Staff Member' : 'Add Demo User',
        submitText: isEdit ? 'Update' : hostedMode ? 'Send Invitation' : 'Create',
        content: hostedForm,
        onSubmit: async (data, close) => {
            try {
                const role = data.userRole;
                if (hostedMode) {
                    const organizationId = organizationService.getCurrentOrganizationId();
                    if (!organizationId) throw new Error('Select a store before managing staff.');
                    if (isEdit) {
                        await employeeService.update(userId, {
                            name: data.userName, email: user.email, role,
                            department: data.userDepartment, salary: Number(data.userSalary)
                        });
                        addAuditLog('Staff Updated', `Staff member updated: ${data.userName}`);
                        showAlert('Staff member updated.', 'success');
                    } else {
                        const client = await getSupabaseClient();
                        const { data: sessionData, error: sessionError } = await client.auth.getSession();
                        if (sessionError) throw sessionError;
                        const accessToken = sessionData?.session?.access_token;
                        if (!accessToken) throw new Error('Sign in again before inviting staff.');
                        const branchId = branchService.getCurrentBranchId();
                        if (!branchId) throw new Error('Select an active branch before inviting staff.');
                        const response = await fetch('/api/invite-user', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({
                                name: data.userName, email: data.userEmail, role,
                                organizationId, branchId, department: data.userDepartment,
                                salary: Number(data.userSalary)
                            })
                        });
                        const result = await response.json().catch(() => ({}));
                        if (!response.ok) throw new Error(result.error || 'Invitation failed.');
                        addAuditLog('Staff Invited', `Staff invitation sent: ${data.userEmail} as ${role}`);
                        showAlert(result.message || 'Invitation sent.', 'success');
                    }
                } else {
                    authService.init();
                    const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]');
                    if (isEdit) {
                        const index = users.findIndex(item => item.id === userId);
                        users[index] = { ...users[index], name: data.userName, email: data.userEmail, role };
                        addAuditLog('User Updated', `Demo user updated: ${data.userName}`);
                    } else {
                        if (users.some(item => item.email === data.userEmail)) throw new Error('Email already exists.');
                        users.push({ id: Date.now().toString(), name: data.userName, email: data.userEmail, password: data.userPassword, role });
                        addAuditLog('User Created', `Demo user created: ${data.userName}`);
                    }
                    localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(users));
                    showAlert(isEdit ? 'Demo user updated.' : 'Demo user created.', 'success');
                }
                close();
                await loadUsers();
            } catch (error) {
                showAlert(error.message || 'Could not save staff member.', 'error');
            }
        }
    });
    modal.open();
}

window.editUser = id => openUserModal(id);
window.deleteUser = async id => {
    if (!confirm('Remove this staff member from the current store?')) return;
    try {
        if (hostedMode) {
            await employeeService.delete(id);
        } else {
            authService.init();
            const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]');
            const user = users.find(item => item.id === id);
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(users.filter(item => item.id !== id)));
            addAuditLog('User Deleted', `Demo user removed: ${user?.name || id}`);
        }
        showAlert('Staff member removed from this store.', 'success');
        await loadUsers();
    } catch (error) {
        showAlert(error.message || 'Could not remove staff member.', 'error');
    }
};
