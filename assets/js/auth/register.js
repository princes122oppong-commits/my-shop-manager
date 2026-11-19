import { showAlert } from '../components/alert.js';
import { authService } from '../services/authService.js';
import { addAuditLog } from '../utils/helpers.js';
import ROUTES from '../config/routes.js';
import { isSupabaseConfigured } from '../services/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('register-form');
    if (!form) return;
    if (isSupabaseConfigured()) {
        const roleField = document.getElementById('role');
        const roleGroup = roleField?.closest('.form-group');
        if (roleGroup) {
            roleGroup.hidden = true;
            roleField.required = false;
            roleField.value = 'cashier';
            const note = document.createElement('p');
            note.className = 'text-muted';
            note.textContent = 'After signing up, create your store to become its owner. Staff join an existing store by invitation.';
            roleGroup.after(note);
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim().toLowerCase();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const role = document.getElementById('role').value;

        if (password !== confirmPassword) {
            showAlert('Passwords do not match!', 'error');
            return;
        }

        if (password.length < 6) {
            showAlert('Password must be at least 6 characters!', 'error');
            return;
        }

        const result = await authService.register({
            name,
            email,
            password,
            role,
            isActive: true
        });

        if (result.success) {
            addAuditLog('User Registration', `New user registered: ${name} (${email}) as ${role}`);
            showAlert(result.confirmationRequired ? 'Account created. Check your email to confirm it.' : 'Account created successfully! Please login.', 'success');
            setTimeout(() => {
                window.location.href = ROUTES.LOGIN;
            }, 1500);
        } else {
            showAlert(result.message, 'error');
        }
    });
});
