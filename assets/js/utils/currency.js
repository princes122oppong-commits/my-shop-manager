import CONSTANTS from '../config/constants.js';

export function formatCurrency(amount) {
    const settings = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS)) || CONSTANTS.DEFAULT_SETTINGS;
    const currency = settings.currency || 'USD';

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
}
