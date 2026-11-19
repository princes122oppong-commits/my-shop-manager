import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { getAuditLogs } from '../utils/helpers.js';
import { formatDateTime } from '../utils/helpers.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!await checkAuth()) return;
    renderSidebar(ROUTES.AUDIT_LOGS);
    renderNavbar('Audit Logs');
    await loadAuditLogs();

    document.getElementById('refresh-logs-btn')?.addEventListener('click', loadAuditLogs);
});

async function loadAuditLogs() {
    const logs = await getAuditLogs();
    
    if (logs.length === 0) {
        document.getElementById('audit-logs-table-container').innerHTML = `
            <p style="text-align: center; color: var(--text-muted); padding: 2rem;">No audit logs recorded yet.</p>
        `;
        return;
    }

    renderTable({
        containerId: 'audit-logs-table-container',
        headers: ['Date & Time', 'User', 'Action', 'Details'],
        data: logs,
        renderRow: (log) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-size: 0.875rem; color: var(--text-muted);">
                    ${formatDateTime(log.timestamp)}
                </td>
                <td style="padding: 1rem; font-weight: 600;">${log.user}</td>
                <td style="padding: 1rem;">
                    <span class="badge badge-info" style="background-color: #DBEAFE; color: #1E40AF;">${log.action}</span>
                </td>
                <td style="padding: 1rem; color: var(--text-muted);">${log.details}</td>
            </tr>
        `
    });
}
