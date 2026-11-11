import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { productService } from '../services/productService.js';
import { salesService } from '../services/salesService.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { formatCurrency } from '../utils/currency.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';

let cart = [];

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.SALES);
    renderNavbar('Point of Sale (POS)');

    await loadPOSProducts();
    setupEventListeners();
});

async function loadPOSProducts() {
    const searchVal = document.getElementById('pos-search')?.value.toLowerCase() || '';
    let products = await productService.getAll();

    if (searchVal) {
        products = products.filter(p =>
            p.name.toLowerCase().includes(searchVal) ||
            p.sku.toLowerCase().includes(searchVal) ||
            p.barcode.includes(searchVal)
        );
    }

    const grid = document.getElementById('pos-products-grid');
    if (!grid) return;

    if (products.length === 0) {
        grid.innerHTML = '<p style="grid-column: span 3; text-align: center; color: var(--text-muted); padding: 2rem;">No products found.</p>';
        return;
    }

    grid.innerHTML = products.map(p => {
        const isOutOfStock = p.stock <= 0;
        return `
            <div class="card pos-product-card flex flex-col justify-between" style="padding: 1rem; margin-bottom: 0; cursor: ${isOutOfStock ? 'not-allowed' : 'pointer'}; opacity: ${isOutOfStock ? 0.5 : 1};" data-id="${p.id}">
                <div>
                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${p.category}</span>
                    <h4 style="font-weight: 600; font-size: 0.875rem; margin-top: 0.25rem; line-height: 1.2; height: 2.4rem; overflow: hidden;">${p.name}</h4>
                </div>
                <div class="flex justify-between items-center" style="margin-top: 1rem;">
                    <span style="font-weight: 700; color: var(--primary);">${formatCurrency(p.price)}</span>
                    <span style="font-size: 0.75rem; font-weight: 500; color: ${p.stock <= p.minStock ? 'var(--danger)' : 'var(--success)'};">
                        ${isOutOfStock ? 'Out of Stock' : `${p.stock} left`}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    // Bind click events to product cards
    grid.querySelectorAll('.pos-product-card').forEach(card => {
        card.addEventListener('click', async () => {
            const id = card.dataset.id;
            const product = await productService.getById(id);
            if (product && product.stock > 0) {
                addToCart(product);
            } else {
                showAlert('Product is out of stock!', 'error');
            }
        });
    });
}

function setupEventListeners() {
    document.getElementById('pos-search')?.addEventListener('input', loadPOSProducts);
    document.getElementById('checkout-btn')?.addEventListener('click', handleCheckout);

    // Barcode scan simulation button
    document.getElementById('barcode-scan-sim-btn')?.addEventListener('click', async () => {
        const products = await productService.getAll();
        if (products.length > 0) {
            const randomProduct = products[Math.floor(Math.random() * products.length)];
            showAlert(`Scanned Barcode: ${randomProduct.barcode} (${randomProduct.name})`, 'info');
            addToCart(randomProduct);
        }
    });
}

function addToCart(product) {
    const existingItem = cart.find(item => item.productId === product.id);
    if (existingItem) {
        if (existingItem.quantity >= product.stock) {
            showAlert(`Cannot add more. Only ${product.stock} units in stock.`, 'error');
            return;
        }
        existingItem.quantity++;
    } else {
        cart.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1
        });
    }
    updateCartUI();
}

function updateCartUI() {
    const list = document.getElementById('cart-items-list');
    if (!list) return;

    if (cart.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">Cart is empty</p>';
        document.getElementById('cart-subtotal').textContent = formatCurrency(0);
        document.getElementById('cart-tax').textContent = formatCurrency(0);
        document.getElementById('cart-total').textContent = formatCurrency(0);
        return;
    }

    list.innerHTML = cart.map((item, index) => `
        <div class="flex justify-between items-center" style="padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
            <div style="flex: 1; padding-right: 0.5rem;">
                <h5 style="font-weight: 600; font-size: 0.875rem; line-height: 1.2;">${item.name}</h5>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${formatCurrency(item.price)} each</span>
            </div>
            <div class="flex items-center gap-2">
                <button class="cart-qty-btn btn btn-secondary" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" data-index="${index}" data-action="dec">-</button>
                <span style="font-weight: 600; font-size: 0.875rem; min-width: 20px; text-align: center;">${item.quantity}</span>
                <button class="cart-qty-btn btn btn-secondary" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" data-index="${index}" data-action="inc">+</button>
                <button class="cart-remove-btn btn btn-danger" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; margin-left: 0.5rem;" data-index="${index}">
                    <i data-lucide="trash-2" style="width: 12px; height: 14px;"></i>
                </button>
            </div>
        </div>
    `).join('');

    // Bind cart actions
    list.querySelectorAll('.cart-qty-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const index = parseInt(btn.dataset.index);
            const action = btn.dataset.action;
            const item = cart[index];
            const product = await productService.getById(item.productId);

            if (action === 'inc') {
                if (item.quantity >= product.stock) {
                    showAlert(`Only ${product.stock} units available.`, 'error');
                    return;
                }
                item.quantity++;
            } else {
                if (item.quantity > 1) {
                    item.quantity--;
                } else {
                    cart.splice(index, 1);
                }
            }
            updateCartUI();
        });
    });

    list.querySelectorAll('.cart-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            cart.splice(index, 1);
            updateCartUI();
        });
    });

    // Calculate Totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const settings = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS)) || CONSTANTS.DEFAULT_SETTINGS;
    const taxRate = parseFloat(settings.taxRate || 0) / 100;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    document.getElementById('cart-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('cart-tax').textContent = formatCurrency(tax);
    document.getElementById('cart-total').textContent = formatCurrency(total);

    if (window.lucide) window.lucide.createIcons();
}

async function handleCheckout() {
    if (cart.length === 0) {
        showAlert('Cart is empty!', 'error');
        return;
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const settings = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS)) || CONSTANTS.DEFAULT_SETTINGS;
    const taxRate = parseFloat(settings.taxRate || 0) / 100;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    const modal = createModal({
        id: 'checkout-modal',
        title: 'Complete Sale',
        submitText: 'Pay & Print Receipt',
        content: `
            <div style="margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
                <div class="flex justify-between" style="margin-bottom: 0.5rem;">
                    <span style="color: var(--text-muted);">Subtotal:</span>
                    <span style="font-weight: 600;">${formatCurrency(subtotal)}</span>
                </div>
                <div class="flex justify-between" style="margin-bottom: 0.5rem;">
                    <span style="color: var(--text-muted);">Tax (${settings.taxRate}%):</span>
                    <span style="font-weight: 600;">${formatCurrency(tax)}</span>
                </div>
                <div class="flex justify-between" style="font-size: 1.25rem; font-weight: 700; margin-top: 0.5rem;">
                    <span>Total Amount:</span>
                    <span style="color: var(--primary);">${formatCurrency(total)}</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Payment Method</label>
                <select name="paymentMethod" class="form-control" required>
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Mobile Transfer">Mobile Transfer</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Amount Tendered (for Cash)</label>
                <input type="number" step="0.01" name="amountTendered" id="amount-tendered" class="form-control" placeholder="${total.toFixed(2)}">
            </div>
        `,
        onSubmit: async (data, close) => {
            const customerName = document.getElementById('cart-customer').value || 'Walk-in Customer';
            const currentUser = JSON.parse(localStorage.getItem('joetech_current_user') || '{"name":"Sarah Cashier"}');

            const sale = await salesService.createSale({
                items: cart,
                paymentMethod: data.paymentMethod,
                customerName,
                cashier: currentUser.name
            });

            showAlert('Sale completed successfully!', 'success');
            close();

            // Show Receipt Modal
            showReceipt(sale, data.amountTendered || total);

            // Reset Cart
            cart = [];
            document.getElementById('cart-customer').value = '';
            updateCartUI();
            await loadPOSProducts();
        }
    });

    modal.open();
}

function showReceipt(sale, amountTendered) {
    const tendered = parseFloat(amountTendered);
    const change = tendered - sale.total;

    const itemsHtml = sale.items.map(item => `
        <div class="flex justify-between" style="font-size: 0.875rem; margin-bottom: 0.25rem;">
            <span>${item.name} (x${item.quantity})</span>
            <span>${formatCurrency(item.price * item.quantity)}</span>
        </div>
    `).join('');

    const modal = createModal({
        id: 'receipt-modal',
        title: 'Transaction Receipt',
        submitText: 'Print',
        cancelText: 'Close',
        content: `
            <div id="printable-receipt" style="font-family: monospace; padding: 1rem; background: #fff; color: #000; border: 1px solid #ccc; border-radius: 4px;">
                <div style="text-align: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700;">JOETECH STORE</h3>
                    <p style="margin: 0.25rem 0; font-size: 0.75rem;">123 Tech Avenue, Silicon Valley</p>
                    <p style="margin: 0; font-size: 0.75rem;">Tel: 555-0100</p>
                </div>
                <div style="border-bottom: 1px dashed #000; padding-bottom: 0.5rem; margin-bottom: 0.5rem; font-size: 0.75rem;">
                    <div><b>Receipt ID:</b> ${sale.id}</div>
                    <div><b>Date:</b> ${new Date(sale.date).toLocaleString()}</div>
                    <div><b>Cashier:</b> ${sale.cashier}</div>
                    <div><b>Customer:</b> ${sale.customerName}</div>
                </div>
                <div style="border-bottom: 1px dashed #000; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                    ${itemsHtml}
                </div>
                <div style="font-size: 0.875rem; margin-bottom: 0.5rem;">
                    <div class="flex justify-between"><span>Subtotal:</span><span>${formatCurrency(sale.subtotal)}</span></div>
                    <div class="flex justify-between"><span>Tax:</span><span>${formatCurrency(sale.tax)}</span></div>
                    <div class="flex justify-between" style="font-weight: 700; font-size: 1rem; margin-top: 0.25rem; border-top: 1px solid #000; padding-top: 0.25rem;">
                        <span>TOTAL:</span><span>${formatCurrency(sale.total)}</span>
                    </div>
                </div>
                <div style="font-size: 0.75rem; border-top: 1px dashed #000; padding-top: 0.5rem;">
                    <div class="flex justify-between"><span>Payment Method:</span><span>${sale.paymentMethod}</span></div>
                    <div class="flex justify-between"><span>Amount Tendered:</span><span>${formatCurrency(tendered)}</span></div>
                    <div class="flex justify-between"><span>Change:</span><span>${formatCurrency(Math.max(0, change))}</span></div>
                </div>
                <div style="text-align: center; margin-top: 1.5rem; font-size: 0.75rem;">
                    <p style="margin: 0;">Thank you for shopping with us!</p>
                    <p style="margin: 0.25rem 0 0 0;">Please retain receipt for warranty.</p>
                </div>
            </div>
        `,
        onSubmit: (data, close) => {
            // Simulate printing
            const printContent = document.getElementById('printable-receipt').innerHTML;
            const originalContent = document.body.innerHTML;
            document.body.innerHTML = printContent;
            window.print();
            document.body.innerHTML = originalContent;
            window.location.reload();
        }
    });

    modal.open();
}
