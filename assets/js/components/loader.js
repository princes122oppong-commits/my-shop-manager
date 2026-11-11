export function showLoader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="flex items-center justify-center" style="padding: 3rem; min-height: 200px;">
            <div class="spinner" style="width: 40px; height: 40px; border: 4px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
    `;
}

export function hideLoader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
}

// Add spin keyframe dynamically
const style = document.createElement('style');
style.textContent = `
@keyframes spin {
    to { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);
