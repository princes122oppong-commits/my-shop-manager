import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { organizationService, branchService } from '../services/organizationService.js';
import { isSupabaseConfigured } from '../services/supabase.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!await checkAuth()) return;
    renderSidebar(ROUTES.BRANCHES);
    renderNavbar('Branches');
    const role = String(organizationService.getCurrentOrganization()?.role || '').toLowerCase();
    const canManage = ['owner', 'admin', 'manager'].includes(role);
    const button = document.getElementById('add-branch-btn');
    button.hidden = !canManage;
    if (!isSupabaseConfigured()) showNotice('Branch management is available for connected Supabase businesses. The offline demo has one Main Store branch.');
    button?.addEventListener('click', openCreateBranch);
    await loadBranches(canManage);
});

async function loadBranches(canManage) {
    const container = document.getElementById('branches-table-container');
    try {
        const branches = await branchService.getAllBranches();
        if (!branches.length) {
            showNotice('No branches are available for this account. Ask an organization admin to assign your account to a branch.');
            container.innerHTML = '<p style="padding:1rem;color:var(--text-muted);">No branches found.</p>';
            return;
        }
        const currentId = branchService.getCurrentBranchId();
        container.innerHTML = `<div class="table-responsive"><table class="data-table"><thead><tr><th>Branch</th><th>Location</th><th>Phone</th><th>Status</th><th>Active view</th>${canManage ? '<th>Actions</th>' : ''}</tr></thead><tbody>${branches.map(branch => `
            <tr><td><strong>${escapeHtml(branch.name)}</strong></td><td>${escapeHtml([branch.address, branch.city].filter(Boolean).join(', ') || '—')}</td><td>${escapeHtml(branch.phone || '—')}</td><td><span class="badge ${branch.is_active ? 'badge-success' : 'badge-secondary'}">${branch.is_active ? 'Active' : 'Inactive'}</span></td><td>${branch.id === currentId ? '<span class="badge badge-info">Selected</span>' : ''}</td>${canManage ? `<td><div class="flex gap-2"><button class="btn btn-secondary branch-staff" data-id="${escapeHtml(branch.id)}" data-name="${escapeHtml(branch.name)}">Staff access</button>${branch.is_active ? `<button class="btn btn-secondary branch-toggle" data-id="${escapeHtml(branch.id)}" data-active="false">Deactivate</button>` : `<button class="btn btn-secondary branch-toggle" data-id="${escapeHtml(branch.id)}" data-active="true">Activate</button>`}</div></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
        container.querySelectorAll('.branch-staff').forEach(button => button.addEventListener('click', () => openStaffAssignment(button.dataset.id, button.dataset.name)));
        container.querySelectorAll('.branch-toggle').forEach(button => button.addEventListener('click', async () => {
            try {
                await branchService.setActive(button.dataset.id, button.dataset.active === 'true');
                await loadBranches(canManage);
                showAlert('Branch status updated.', 'success');
            } catch (error) { showAlert(error.message || 'Unable to update branch.', 'error'); }
        }));
    } catch (error) {
        showNotice(error.message || 'Unable to load branches. Run the branch migration in Supabase, then reload this page.');
        container.innerHTML = '<p style="padding:1rem;color:var(--text-muted);">Branch data could not be loaded.</p>';
    }
}

async function openStaffAssignment(branchId, branchName) {
    try {
        const members = await branchService.getOrganizationMembers();
        const modal = createModal({
            id: 'branch-staff-modal', title: `Staff access · ${branchName}`,
            content: members.length ? `<p style="color:var(--text-muted);margin-bottom:1rem;">Select the staff who can switch to this branch. Owners, admins and managers can access every branch.</p>${members.map(member => `<label style="display:flex;align-items:center;gap:.65rem;padding:.55rem 0;border-bottom:1px solid var(--border-color);"><input type="checkbox" name="branch-member" value="${escapeHtml(member.id)}" ${member.branchIds.includes(branchId) ? 'checked' : ''}><span><strong>${escapeHtml(member.name)}</strong><small style="display:block;color:var(--text-muted);">${escapeHtml(member.email)} · ${escapeHtml(member.role)}</small></span></label>`).join('')}` : '<p>No active organization members are available.</p>',
            onSubmit: async (_data, close) => {
                const selected = [...modal.form.querySelectorAll('input[name="branch-member"]:checked')].map(input => input.value);
                try {
                    await branchService.setBranchMembers(branchId, selected);
                    close();
                    showAlert('Branch staff access updated.', 'success');
                } catch (error) { showAlert(error.message || 'Unable to update staff access.', 'error'); }
            }
        });
        modal.open();
    } catch (error) { showAlert(error.message || 'Unable to load organization members.', 'error'); }
}

function openCreateBranch() {
    if (!isSupabaseConfigured()) return showAlert('Connect Supabase before adding business branches.', 'error');
    const modal = createModal({
        id: 'create-branch-modal', title: 'Add a branch',
        content: `<div class="form-group"><label class="form-label">Branch name</label><input name="name" class="form-control" maxlength="100" required placeholder="e.g. Airport City Outlet"></div><div class="form-group"><label class="form-label">Address</label><input name="address" class="form-control" maxlength="200"></div><div class="form-group"><label class="form-label">City</label><input name="city" class="form-control" maxlength="100"></div><div class="form-group"><label class="form-label">Phone</label><input name="phone" class="form-control" maxlength="40"></div><div class="form-group"><label class="form-label">Email</label><input name="email" type="email" class="form-control" maxlength="200"></div>`,
        onSubmit: async (input, close) => {
            try {
                await branchService.createBranch(input);
                close();
                await loadBranches(true);
                showAlert('Branch created. Use Staff access to assign employees to this outlet.', 'success');
            } catch (error) { showAlert(error.message || 'Unable to create branch.', 'error'); }
        }
    });
    modal.open();
}

function showNotice(message) {
    const notice = document.getElementById('branches-notice');
    notice.textContent = message;
    notice.style.display = 'block';
}

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
