import { organizationService, branchService } from '../services/organizationService.js';
import { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (window.lucide) window.lucide.createIcons();

    const existing = await organizationService.getMyOrganizations();
    if (existing.organizations.length > 0) {
        const currentId = organizationService.getCurrentOrganizationId();
        const organization = existing.organizations.find(item => item.id === currentId) || existing.organizations[0];
        await organizationService.setActiveOrganization(organization);
        window.location.href = 'dashboard.html';
        return;
    }

    const form = document.getElementById('onboarding-form');
    const error = document.getElementById('onboarding-error');
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        error.style.display = 'none';
        try {
            await organizationService.createOrganization(new FormData(form).get('storeName'));
            await branchService.ensureDefaultBranch();
            window.location.href = 'dashboard.html';
        } catch (exception) {
            error.textContent = exception.message || 'Unable to create your store.';
            error.style.display = 'block';
            button.disabled = false;
        }
    });
});
