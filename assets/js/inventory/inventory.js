import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { productService } from '../services/productService.js';
import { inventoryService } from '../services/inventoryService.js';
import { renderTable } from '../components/table.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { formatDate } from '../utils/formatter.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.INVENTORY);
    renderNavbar('Inventory & Stock');

    await loadInventoryData();
    setupEventListeners();
});

async function loadInventoryData() {
    const products = await productService.getAll();
    const movements = await inventoryService.getMovements();

    // Render Stock Levels Table
    renderTable({
        containerId: 'stock-levels-table',
        headers: ['SKU', 'Product Name', 'Category', 'Current Stock', 'Min Stock', 'Status'],
        data: products,
        renderRow: (p) => {
            const isLow = p.stock <= p.minStock;
            return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 1rem; font-weight: 600;">${p.sku}</td>
                    <td style="padding: 1rem; font-weight: 500;">${p.name}</td>
                    <td style="padding: 1rem; color: var(--text-muted);">${p.category}</td>
                    <td style="padding: 1rem; font-weight: 600;">${p.stock} units</td>
                    <td style="padding: 1rem; color: var(--text-muted);">${p.minStock} units</td>
                    <td style="padding: 1rem;">
                        <span class="badge ${isLow ? 'badge-danger' : 'badge-success'}">
                            ${isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                    </td>
                </tr>
            `;
        }
    });

    // Render Movement History List
    const movementContainer = document.getElementById('movement-history-list');
    if (movementContainer) {
        if (movements.length === 0) {
            movementContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No stock movements recorded.</p>';
        } else {
            movementContainer.innerHTML = movements.map(m => {
                const isIn = m.type === 'IN';
                const icon = isIn ? 'arrow-down-left' : 'arrow-up-right';
                const color = isIn ? 'var(--success)' : 'var(--danger)';
                const bg = isIn ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

                return `
                    <div class="flex justify-between items-center" style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
                        <div class="flex items-center gap-3">
                            <div style="background: ${bg}; color: ${color}; padding: 0.5rem; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                            </div>
                            <div>
                                <h4 style="font-weight: 600; font-size: 0.875rem;">${m.productName}</h4>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">${m.reason} • ${formatDate(m.date)}</span>
                            </div>
                        </div>
                        <span style="font-weight: 700; color: ${color}; font-size: 0.875rem;">
                            ${isIn ? '+' : '-'}${m.quantity}
                        </span>
                    </div>
                `;
            }).join('');
        }
    }

    if (window.lucide) window.lucide.createIcons();
}

function setupEventListeners() {
    document.getElementById('stock-in-btn')?.addEventListener('click', () => handleStockAdjustment('IN'));
    document.getElementById('stock-out-btn')?.addEventListener('click', () => handleStockAdjustment('OUT'));
}

async function handleStockAdjustment(type) {
    const products = await productService.getAll();
    const productOptions = products.map(p => `<option value="${p.id}">${p.name} (Current: ${p.stock})</option>`).join('');

    const modal = createModal({
        id: 'stock-adjustment-modal',
        title: type === 'IN' ? 'Stock In (Add Inventory)' : 'Stock Out (Reduce Inventory)',
        content: `
            <div class="form-group">
                <label class="form-label">Select Product</label>
                <select name="productId" class="form-control" required>
                    ${productOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Quantity</label>
                <input type="number" name="quantity" class="form-control" min="1" required>
            </div>
            <div class="form-group">
                <label class="form-label">Reason / Reference</label>
                <input type="text" name="reason" class="form-control" placeholder="e.g., Supplier delivery, damaged stock, audit adjustment" required>
            </div>
        `,
        onSubmit: async (data, close) => {
            const currentUser = JSON.parse(localStorage.getItem('joetech_current_user') || '{"name":"Admin"}');

            // If stock out, verify we have enough stock
            if (type === 'OUT') {
                const product = await productService.getById(data.productId);
                if (product.stock < parseInt(data.quantity)) {
                    showAlert(`Insufficient stock! Only ${product.stock} units available.`, 'error');
                    return;
                }
            }

            await inventoryService.addMovement({
                productId: data.productId,
                type,
                quantity: data.quantity,
                reason: data.reason,
                user: currentUser.name
            });

            showAlert('Stock adjusted successfully!', 'success');
            close();
            await loadInventoryData();
        }
    });

    modal.open();
}
