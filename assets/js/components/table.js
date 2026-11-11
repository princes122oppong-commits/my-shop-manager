export function renderTable({ containerId, headers, data, renderRow, emptyMessage = 'No data found' }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="folder-open" style="width: 48px; height: 48px; margin-bottom: 1rem; stroke-width: 1.5;"></i>
                <p>${emptyMessage}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const headerHtml = headers.map(h => `<th style="text-align: left; padding: 1rem; font-weight: 600; border-bottom: 2px solid var(--border-color); font-size: 0.875rem; color: var(--text-muted);">${h}</th>`).join('');
    const rowsHtml = data.map((item, index) => renderRow(item, index)).join('');

    container.innerHTML = `
        <div style="overflow-x: auto; width: 100%;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr>${headerHtml}</tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;

    if (window.lucide) {
        window.lucide.createIcons();
    }
}
