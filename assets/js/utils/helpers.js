import CONSTANTS from '../config/constants.js';

export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function addAuditLog(action, details) {
    const currentUser = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER) || '{"name":"System"}');
    const logs = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.AUDIT_LOGS) || '[]');
    
    logs.push({
        id: generateId(),
        action,
        details,
        user: currentUser.name,
        email: currentUser.email,
        timestamp: new Date().toISOString(),
        date: formatDate(new Date()),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });

    localStorage.setItem(CONSTANTS.STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs));
}

export function getAuditLogs() {
    return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.AUDIT_LOGS) || '[]');
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