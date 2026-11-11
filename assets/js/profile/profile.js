import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { authService } from '../services/authService.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    renderSidebar(ROUTES.PROFILE);
    renderNavbar('My Profile');
    loadProfile();
    setupEventListeners();
});

function loadProfile() {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return;

    document.getElementById('profile-name').value = currentUser.name || '';
    document.getElementById('profile-email').value = currentUser.email || '';
    document.getElementById('profile-phone').value = currentUser.phone || '';
}

function setupEventListeners() {
    document.getElementById('profile-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        const name = document.getElementById('profile-name').value;
        const phone = document.getElementById('profile-phone').value;

        authService.update(currentUser.id, { name, phone });
        addAuditLog('Profile Updated', 'User updated their profile information');
        showAlert('Profile updated successfully!', 'success');
    });

    document.getElementById('password-form')?.addEventListener('submit', (e) => {
        e.preventDefault();

        const currentUser = authService.getCurrentUser();
        if (!currentUser) return;

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmNewPassword = document.getElementById('confirm-new-password').value;

        const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS) || '[]');
        const user = users.find(u => u.id === currentUser.id);

        if (!user || user.password !== currentPassword) {
            showAlert('Current password is incorrect!', 'error');
            return;
        }

        if (newPassword !== confirmNewPassword) {
            showAlert('New passwords do not match!', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showAlert('Password must be at least 6 characters!', 'error');
            return;
        }

        user.password = newPassword;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(users));

        addAuditLog('Password Changed', 'User changed their password');
        showAlert('Password changed successfully!', 'success');

        document.getElementById('password-form').reset();
    });
}
