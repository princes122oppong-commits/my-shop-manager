import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from '../services/supabase.js';
import { organizationService } from '../services/organizationService.js';

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function addAuditLog(action, details) {
    const currentUser = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER) || '{"name":"System"}');
    const logs = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.AUDIT_LOGS) || '[]');
    const organizationId = organizationService.getCurrentOrganizationId();
    
    logs.push({
        id: generateId(),
        organizationId,
        action,
        details,
        user: currentUser.name,
        email: currentUser.email,
        timestamp: new Date().toISOString(),
        date: formatDate(new Date()),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });

    localStorage.setItem(CONSTANTS.STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));

    if (organizationId) {
        void getSupabaseClient().then(async client => {
            if (!client) return;
            const { error } = await client.rpc('record_audit_event', {
                p_organization_id: organizationId,
                p_action: action,
                p_details: details,
                p_metadata: null
            });
            if (error) console.error('Could not save the audit event:', error.message);
        }).catch(error => console.error('Could not save the audit event:', error.message));
    }
}

export async function getAuditLogs() {
    const organizationId = organizationService.getCurrentOrganizationId();
    const client = await getSupabaseClient();
    if (client) {
        if (!organizationId) return [];
        const { data, error } = await client.from('audit_logs').select('id, user_name, user_email, action, details, created_at')
            .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(500);
        if (error) throw error;
        return (data || []).map(log => ({
            id: log.id, user: log.user_name, email: log.user_email,
            action: log.action, details: log.details, timestamp: log.created_at
        }));
    }
    return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.AUDIT_LOGS) || '[]')
        .filter(log => !organizationId || log.organizationId === organizationId);
}

export function formatDate(date) {
    if (typeof date === 'string') date = new Date(date);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

export function formatDateTime(date) {
    if (typeof date === 'string') date = new Date(date);
    return date.toLocaleString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    const colors = {
        info: 'var(--primary)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--danger)'
    };
    
    alert.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background-color: ${colors[type]};
        color: white;
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg);
        z-index: 9999;
        font-weight: 500;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    alert.textContent = message;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

export function getItemCount(storageKey) {
    const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return items.length;
}

export function exportToCSV(data, filename) {
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(item => Object.values(item).join(','));
    const csvContent = [headers, ...rows].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}
