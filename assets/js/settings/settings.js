import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';
import { configureSupabase, isSupabaseConfigured } from '../services/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    renderSidebar(ROUTES.SETTINGS);
    renderNavbar('Settings');
    loadSettings();
    loadSupabaseSettings();
    setupEventListeners();
});

function loadSupabaseSettings() {
    const urlInput = document.getElementById('supabase-url');
    const keyInput = document.getElementById('supabase-key');
    const status = document.getElementById('supabase-status');
    if (!urlInput || !keyInput || !status) return;

    urlInput.value = localStorage.getItem('SUPABASE_URL') || '';
    status.textContent = isSupabaseConfigured()
        ? 'Connected configuration found. Reloading after changes will use Supabase.'
        : 'Offline mode is active. Data is stored in this browser.';
}

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS)) || CONSTANTS.DEFAULT_SETTINGS;
    
    document.getElementById('setting-storeName').value = settings.storeName || 'JoeTech Store';
    document.getElementById('setting-currency').value = settings.currency || 'USD';
    document.getElementById('setting-taxRate').value = settings.taxRate || 8.25;
    document.getElementById('setting-lowStockThreshold').value = settings.lowStockThreshold || 10;
    document.getElementById('setting-theme').value = settings.theme || 'light';
    document.getElementById('setting-enableEmailNotifications').checked = settings.enableEmailNotifications !== false;
    document.getElementById('setting-enableSMSNotifications').checked = settings.enableSMSNotifications || false;
    document.getElementById('setting-enable2FA').checked = settings.enable2FA || false;
}

function setupEventListeners() {
    document.getElementById('store-settings-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettings();
    });

    document.getElementById('export-data-btn')?.addEventListener('click', exportData);
    document.getElementById('clear-data-btn')?.addEventListener('click', clearAllData);
    document.getElementById('setting-theme')?.addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
        saveSettings();
    });

    document.getElementById('supabase-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('supabase-url').value.trim();
        const key = document.getElementById('supabase-key').value.trim();
        if (!url || !key) {
            showAlert('Enter both the Supabase URL and anon key.', 'error');
            return;
        }
        configureSupabase(url, key);
    });

    document.getElementById('disconnect-supabase-btn')?.addEventListener('click', () => {
        configureSupabase('', '');
    });
}

function saveSettings() {
    const settings = {
        storeName: document.getElementById('setting-storeName').value,
        currency: document.getElementById('setting-currency').value,
        taxRate: parseFloat(document.getElementById('setting-taxRate').value),
        lowStockThreshold: parseInt(document.getElementById('setting-lowStockThreshold').value),
        theme: document.getElementById('setting-theme').value,
        enableEmailNotifications: document.getElementById('setting-enableEmailNotifications').checked,
        enableSMSNotifications: document.getElementById('setting-enableSMSNotifications').checked,
        enable2FA: document.getElementById('setting-enable2FA').checked
    };

    localStorage.setItem(CONSTANTS.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    addAuditLog('Settings Updated', 'Store settings have been modified');
    showAlert('Settings saved successfully!', 'success');
}

function exportData() {
    const data = {
        products: JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.PRODUCTS) || '[]'),
        sales: JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SALES) || '[]'),
        customers: JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CUSTOMERS) || '[]'),
        suppliers: JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SUPPLIERS) || '[]'),
        expenses: JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXPENSES) || '[]')
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `joetech-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    addAuditLog('Data Export', 'Full database export completed');
    showAlert('Data exported successfully!', 'success');
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all data? This action cannot be undone!')) {
        if (confirm('This will delete ALL products, sales, customers, and other data. Continue?')) {
            const keys = Object.values(CONSTANTS.STORAGE_KEYS);
            keys.forEach(key => localStorage.removeItem(key));
            addAuditLog('Data Cleared', 'All application data has been cleared');
            showAlert('All data cleared successfully!', 'success');
            setTimeout(() => window.location.reload(), 1500);
        }
    }
}
