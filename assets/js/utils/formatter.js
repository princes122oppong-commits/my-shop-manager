export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatPercent(value) {
    return `${parseFloat(value).toFixed(2)}%`;
}

export function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(value);
}
