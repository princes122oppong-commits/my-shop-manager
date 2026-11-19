export function createModal({ id, title, content, onSubmit, submitText = 'Save', cancelText = 'Cancel' }) {
    // Remove existing modal if any
    const existingModal = document.getElementById(id);
    if (existingModal) existingModal.remove();

    const modalHtml = `
        <div id="${id}" class="modal-overlay" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
            <div class="modal-content card" style="width: 100%; max-width: 500px; margin: 1rem; position: relative; animation: slideDown 0.2s ease;">
                <div class="modal-header flex justify-between items-center" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1rem;">
                    <h3 style="font-weight: 600; font-size: 1.125rem;">${title}</h3>
                    <button class="modal-close-btn" style="background: none; font-size: 1.25rem; color: var(--text-muted);">&times;</button>
                </div>
                <form id="${id}-form">
                    <div class="modal-body" style="margin-bottom: 1.5rem; max-height: 60vh; overflow-y: auto; padding-right: 0.25rem;">
                        ${content}
                    </div>
                    <div class="modal-footer flex justify-end gap-2" style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
                        <button type="button" class="btn btn-secondary modal-cancel-btn">${cancelText}</button>
                        <button type="submit" class="btn btn-primary">${submitText}</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById(id);
    const form = document.getElementById(`${id}-form`);

    const close = () => {
        modal.style.display = 'none';
        modal.classList.remove('flex');
    };

    const open = () => {
        modal.style.display = 'flex';
        modal.classList.add('flex');
    };

    modal.querySelector('.modal-close-btn').addEventListener('click', close);
    modal.querySelector('.modal-cancel-btn').addEventListener('click', close);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (onSubmit) {
            const formData = new FormData(form);
            form.querySelectorAll('input[id], select[id], textarea[id]').forEach(field => {
                if (field.name || field.disabled || formData.has(field.id)) return;
                const key = field.id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                formData.set(key, field.type === 'checkbox' ? field.checked : field.value);
            });
            const data = Object.fromEntries(formData.entries());
            await onSubmit(data, close);
        }
    });

    return { open, close, form };
}
