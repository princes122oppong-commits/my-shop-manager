import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    renderSidebar(ROUTES.PROMOTIONS);
    renderNavbar('Promotions & Marketing');
    loadPromotions();
    loadCoupons();

    document.getElementById('add-promotion-btn')?.addEventListener('click', () => {
        openPromotionModal();
    });
});

function loadPromotions() {
    const promotions = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.PROMOTIONS) || '[]');
    const container = document.getElementById('promotions-list');

    if (promotions.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No active promotions</p>';
        return;
    }

    container.innerHTML = promotions.map(promo => `
        <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
            <div class="flex justify-between items-center" style="margin-bottom: 0.5rem;">
                <h4 style="font-weight: 600; font-size: 0.875rem;">${promo.name}</h4>
                <span class="badge badge-success">Active</span>
            </div>
            <p style="font-size: 0.875rem; color: var(--text-muted);">${promo.description}</p>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Discount: ${promo.discount}% | Ends: ${new Date(promo.endDate).toLocaleDateString()}</p>
        </div>
    `).join('');
}

function loadCoupons() {
    const coupons = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.COUPONS) || '[]');
    const container = document.getElementById('coupons-list');

    if (coupons.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No coupon codes</p>';
        return;
    }

    container.innerHTML = coupons.map(coupon => `
        <div style="padding: 1rem; border: 1px solid var(--border-color); border-radius: var(--radius-sm); margin-bottom: 0.5rem;">
            <div class="flex justify-between items-center">
                <div>
                    <h4 style="font-weight: 600; font-size: 0.875rem; font-family: monospace;">${coupon.code}</h4>
                    <p style="font-size: 0.75rem; color: var(--text-muted);">${coupon.discount}% off | Min: ${formatCurrency(coupon.minPurchase)}</p>
                </div>
                <span class="badge badge-${coupon.usageCount >= coupon.maxUsage ? 'danger' : 'success'}">${coupon.usageCount}/${coupon.maxUsage}</span>
            </div>
        </div>
    `).join('');
}

function openPromotionModal() {
    const modal = createModal({
        id: 'promotion-modal',
        title: 'Create Promotion',
        submitText: 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Promotion Name</label>
                <input type="text" id="promo-name" class="form-control" required>
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea id="promo-description" class="form-control" rows="2"></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Discount (%)</label>
                <input type="number" id="promo-discount" class="form-control" min="1" max="100" required>
            </div>
            <div class="form-group">
                <label class="form-label">End Date</label>
                <input type="date" id="promo-endDate" class="form-control" required>
            </div>
        `,
        onSubmit: (data, close) => {
            const promotions = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.PROMOTIONS) || '[]');
            promotions.push({
                id: Date.now().toString(),
                name: data.promoName,
                description: data.promoDescription,
                discount: parseFloat(data.promoDiscount),
                endDate: data.promoEndDate,
                active: true
            });
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.PROMOTIONS, JSON.stringify(promotions));
            addAuditLog('Promotion Created', `New promotion: ${data.promoName}`);
            showAlert('Promotion created successfully!', 'success');
            close();
            loadPromotions();
        }
    });

    modal.open();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}
