export function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

export function validateRequired(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
}

export function validatePrice(value) {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
}

export function validateStock(value) {
    const num = parseInt(value);
    return !isNaN(num) && num >= 0;
}
