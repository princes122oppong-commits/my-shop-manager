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
