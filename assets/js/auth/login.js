import { showAlert } from '../components/alert.js';
import { authService } from '../services/authService.js';
import { addAuditLog } from '../utils/helpers.js';
import ROUTES from '../config/routes.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;

        const result = await authService.login(email, password);

        if (result.success) {
            addAuditLog('User Login', `User logged in: ${result.user.name} (${result.user.email})`);
            showAlert('Login successful! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = ROUTES.DASHBOARD;
            }, 1000);
        } else {
            showAlert(result.message, 'error');
        }
    });
});
