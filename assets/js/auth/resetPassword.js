import { showAlert } from '../components/alert.js';
import { authService } from '../services/authService.js';
import ROUTES from '../config/routes.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmNewPassword) {
            showAlert('Passwords do not match!', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showAlert('Password must be at least 6 characters!', 'error');
            return;
        }

        const result = await authService.resetPassword(email, newPassword);

        if (result.success) {
            showAlert('Password reset successfully! Please login.', 'success');
            setTimeout(() => {
                window.location.href = ROUTES.LOGIN;
            }, 1500);
        } else {
            showAlert(result.message, 'error');
        }
    });
});
