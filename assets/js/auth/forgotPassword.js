import { showAlert } from '../components/alert.js';
import { authService } from '../services/authService.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgot-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();

        const result = await authService.forgotPassword(email);

        if (result.success) {
            showAlert('Password reset link sent to your email!', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showAlert(result.message, 'error');
        }
    });
});
