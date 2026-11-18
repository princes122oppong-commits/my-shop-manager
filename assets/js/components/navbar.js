import { organizationService, branchService } from '../services/organizationService.js';

export function renderNavbar(title) {
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) return;

    const currentUser = JSON.parse(localStorage.getItem('joetech_current_user') || '{"name":"Admin","role":"Administrator"}');
    const initials = currentUser.name ? currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'AD';
    const currentTheme = localStorage.getItem('joetech_theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);

    navbarContainer.innerHTML = `
        <nav class="navbar">
            <div class="navbar-left">
                <button id="mobile-menu-toggle" class="mobile-menu-toggle" type="button" aria-label="Open navigation" aria-controls="sidebar-container" aria-expanded="false">
                    <i data-lucide="menu"></i>
                </button>
                <h1 class="navbar-title">${title}</h1>
            </div>
            <div class="navbar-right">
                <div id="store-context" class="store-context" aria-label="Store and branch selection"></div>
                <button id="theme-toggle-btn" class="theme-toggle" title="Toggle Theme">
                    <i data-lucide="${currentTheme === 'light' ? 'moon' : 'sun'}"></i>
                </button>
                <div class="user-profile">
                    <div class="user-avatar">${initials}</div>
                    <div class="user-info">
                        <span class="user-name">${currentUser.name}</span>
                        <span class="user-role">${currentUser.role}</span>
                    </div>
                </div>
            </div>
        </nav>
    `;

    // Bind theme toggle event
    const menuBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    menuBtn?.addEventListener('click', () => {
        const isOpen = sidebar?.classList.toggle('active') || false;
        menuBtn.setAttribute('aria-expanded', String(isOpen));
        menuBtn.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
        const icon = menuBtn.querySelector('i');
        icon?.setAttribute('data-lucide', isOpen ? 'x' : 'menu');
        if (window.lucide) window.lucide.createIcons();
    });

    loadStoreContext();

    const themeBtn = document.getElementById('theme-toggle-btn');
    themeBtn?.addEventListener('click', () => {
        const activeTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = activeTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('joetech_theme', newTheme);

        // Update icon
        const icon = themeBtn.querySelector('i');
        if (icon) {
            icon.setAttribute('data-lucide', newTheme === 'light' ? 'moon' : 'sun');
            if (window.lucide) window.lucide.createIcons();
        }
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

async function loadStoreContext() {
    const container = document.getElementById('store-context');
    if (!container) return;
    try {
        const organizations = await organizationService.getMyOrganizations();
        if (!organizations.available || !organizations.organizations.length) return;
        const orgId = organizationService.getCurrentOrganizationId();
        const org = organizations.organizations.find(item => item.id === orgId) || organizations.organizations[0];
        if (org.id !== orgId) await organizationService.setActiveOrganization(org);
        let branches = await branchService.getMyBranches();
        if (!branches.length) {
            await branchService.ensureDefaultBranch();
            branches = await branchService.getMyBranches();
        }
        let branch = branches.find(item => item.id === branchService.getCurrentBranchId());
        if (!branch && branches.length) {
            branch = branches[0];
            branchService.setCurrentBranch(branch);
        }

        container.innerHTML = `
            ${organizations.organizations.length > 1 ? `<label class="context-select-wrap"><span>Store</span><select id="organization-switcher" aria-label="Select store">${organizations.organizations.map(item => `<option value="${escapeAttribute(item.id)}" ${item.id === org.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
            ${branches.length > 1 ? `<label class="context-select-wrap"><span>Branch</span><select id="branch-switcher" aria-label="Select branch">${branches.map(item => `<option value="${escapeAttribute(item.id)}" ${item.id === branch?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : branches.length === 1 ? `<span class="branch-current" title="Current branch">${escapeHtml(branches[0].name)}</span>` : ''}
        `;
        document.getElementById('organization-switcher')?.addEventListener('change', async event => {
            const selected = organizations.organizations.find(item => item.id === event.target.value);
            if (selected) {
                await organizationService.setActiveOrganization(selected);
                window.location.href = 'dashboard.html';
            }
        });
        document.getElementById('branch-switcher')?.addEventListener('change', event => {
            const selected = branches.find(item => item.id === event.target.value);
            if (selected) {
                branchService.setCurrentBranch(selected);
                window.location.reload();
            }
        });
    } catch (error) {
        console.error('Could not load store and branch selectors:', error);
    }
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function escapeAttribute(value = '') { return escapeHtml(value); }
