import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { notificationService } from '../services/notificationService.js';
import { formatDateTime } from '../utils/helpers.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    renderSidebar(ROUTES.NOTIFICATIONS);
    renderNavbar('Notifications');
    await loadNotifications();

    document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
        await notificationService.markAllAsRead();
        await loadNotifications();
    });
});

async function loadNotifications() {
    const notifications = await notificationService.getAll();
    const container = document.getElementById('notifications-list-container');

    if (notifications.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No notifications yet.</p>';
        return;
    }

    container.innerHTML = notifications.map(notification => {
        const iconMap = {
            low_stock: 'alert-triangle',
            new_order: 'shopping-cart',
            new_sale: 'dollar-sign',
            alert: 'bell'
        };
        const colorMap = {
            low_stock: 'var(--warning)',
            new_order: 'var(--success)',
            new_sale: 'var(--primary)',
            alert: 'var(--danger)'
        };
        const icon = iconMap[notification.type] || 'bell';
        const color = colorMap[notification.type] || 'var(--primary)';

        return `
            <div style="display: flex; gap: 1rem; padding: 1rem; border-radius: var(--radius-sm); background-color: ${notification.read ? 'transparent' : 'rgba(79, 70, 229, 0.03)'}; border: 1px solid ${notification.read ? 'var(--border-color)' : 'rgba(79, 70, 229, 0.1)'}; transition: var(--transition);">
                <div style="width: 40px; height: 40px; border-radius: 50%; background-color: ${color}15; color: ${color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i data-lucide="${icon}" style="width: 20px; height: 20px;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.25rem;">
                        <h4 style="font-weight: 600; font-size: 0.875rem;">${notification.title}</h4>
                        <span style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; margin-left: 1rem;">${formatDateTime(notification.date)}</span>
                    </div>
                    <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 0.5rem;">${notification.message}</p>
                    ${!notification.read ? `<span style="font-size: 0.75rem; font-weight: 600; color: var(--primary);">New</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}
