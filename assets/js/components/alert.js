export function showAlert(message, type = 'success', duration = 3000) {
    let container = document.getElementById('alert-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'alert-container';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }

    const alert = document.createElement('div');
    alert.className = `alert alert-${type} card`;
    alert.style.cssText = `
        padding: 1rem 1.5rem;
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 300px;
        max-width: 450px;
        animation: slideIn 0.3s ease;
        background-color: var(--bg-card);
        border-left: 4px solid var(--primary);
    `;

    let icon = 'check-circle';
    let color = 'var(--success)';
    if (type === 'success') {
        alert.style.borderLeftColor = 'var(--success)';
        icon = 'check-circle';
        color = 'var(--success)';
    } else if (type === 'error') {
        alert.style.borderLeftColor = 'var(--danger)';
        icon = 'alert-triangle';
        color = 'var(--danger)';
    } else if (type === 'warning') {
        alert.style.borderLeftColor = 'var(--warning)';
        icon = 'alert-circle';
        color = 'var(--warning)';
    } else if (type === 'info') {
        alert.style.borderLeftColor = 'var(--info)';
        icon = 'info';
        color = 'var(--info)';
    }

    alert.innerHTML = `
        <i data-lucide="${icon}" style="color: ${color}; flex-shrink: 0;"></i>
        <div style="flex: 1; font-size: 0.875rem; font-weight: 500;">${message}</div>
        <button class="alert-close" style="background: none; font-size: 1.125rem; color: var(--text-muted); cursor: pointer;">&times;</button>
    `;

    container.appendChild(alert);

    if (window.lucide) {
        window.lucide.createIcons();
    }

    const removeAlert = () => {
        alert.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => alert.remove(), 300);
    };

    alert.querySelector('.alert-close').addEventListener('click', removeAlert);

    setTimeout(removeAlert, duration);
}

// Add CSS keyframes dynamically
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(120%); opacity: 0; }
}
@keyframes slideDown {
    from { transform: translateY(-20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
`;
document.head.appendChild(style);
