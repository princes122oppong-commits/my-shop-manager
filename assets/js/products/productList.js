import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { productService } from '../services/productService.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import { formatCurrency } from '../utils/currency.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    renderSidebar(ROUTES.PRODUCTS);
    renderNavbar('Products');
    await loadProducts();
    setupEventListeners();
});

async function loadProducts() {
    const products = await productService.getAll();
    
    renderTable({
        containerId: 'products-table-container',
        headers: ['Product Name', 'SKU', 'Category', 'Price', 'Stock', 'Status', 'Actions'],
        data: products,
        renderRow: (product) => {
            const isLowStock = product.stock <= product.minStock;
            const statusBadge = isLowStock 
                ? '<span class="badge badge-danger">Low Stock</span>'
                : product.stock === 0 
                    ? '<span class="badge badge-danger">Out of Stock</span>'
                    : '<span class="badge badge-success">In Stock</span>';

            return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 1rem; font-weight: 600;">${product.name}</td>
                    <td style="padding: 1rem; font-family: monospace; font-size: 0.875rem; color: var(--text-muted);">${product.sku}</td>
                    <td style="padding: 1rem;">${product.category}</td>
                    <td style="padding: 1rem; font-weight: 600;">${formatCurrency(product.price)}</td>
                    <td style="padding: 1rem;">${product.stock}</td>
                    <td style="padding: 1rem;">${statusBadge}</td>
                    <td style="padding: 1rem;">
                        <div class="flex gap-2">
                            <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editProduct('${product.id}')">Edit</button>
                            <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteProduct('${product.id}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }
    });
}

function setupEventListeners() {
    document.getElementById('add-product-btn')?.addEventListener('click', async () => {
        await openProductModal();
    });

    document.getElementById('product-search')?.addEventListener('input', async (e) => {
        const searchVal = e.target.value.toLowerCase();
        const products = (await productService.getAll()).filter(p => 
            p.name.toLowerCase().includes(searchVal) || 
            p.sku.toLowerCase().includes(searchVal) ||
            p.barcode.includes(searchVal)
        );
        renderTable({
            containerId: 'products-table-container',
            headers: ['Product Name', 'SKU', 'Category', 'Price', 'Stock', 'Status', 'Actions'],
            data: products,
            renderRow: (product) => {
                const isLowStock = product.stock <= product.minStock;
                const statusBadge = isLowStock 
                    ? '<span class="badge badge-danger">Low Stock</span>'
                    : product.stock === 0 
                        ? '<span class="badge badge-danger">Out of Stock</span>'
                        : '<span class="badge badge-success">In Stock</span>';

                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 1rem; font-weight: 600;">${product.name}</td>
                        <td style="padding: 1rem; font-family: monospace; font-size: 0.875rem; color: var(--text-muted);">${product.sku}</td>
                        <td style="padding: 1rem;">${product.category}</td>
                        <td style="padding: 1rem; font-weight: 600;">${formatCurrency(product.price)}</td>
                        <td style="padding: 1rem;">${product.stock}</td>
                        <td style="padding: 1rem;">${statusBadge}</td>
                        <td style="padding: 1rem;">
                            <div class="flex gap-2">
                                <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editProduct('${product.id}')">Edit</button>
                                <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteProduct('${product.id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `;
            }
        });
    });
}

async function openProductModal(productId = null) {
    const product = productId ? await productService.getById(productId) : null;
    const isEdit = !!product;

    const modal = createModal({
        id: 'product-modal',
        title: isEdit ? 'Edit Product' : 'Add New Product',
        submitText: isEdit ? 'Update' : 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Product Name</label>
                <input type="text" id="product-name" class="form-control" value="${product?.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">SKU</label>
                <input type="text" id="product-sku" class="form-control" value="${product?.sku || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Barcode</label>
                <input type="text" id="product-barcode" class="form-control" value="${product?.barcode || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">Category</label>
                <select id="product-category" class="form-control">
                    <option value="Smartphones">Smartphones</option>
                    <option value="Laptops">Laptops</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                    <label class="form-label">Price ($)</label>
                    <input type="number" step="0.01" id="product-price" class="form-control" value="${product?.price || ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Cost ($)</label>
                    <input type="number" step="0.01" id="product-cost" class="form-control" value="${product?.cost || ''}" required>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                    <label class="form-label">Stock Quantity</label>
                    <input type="number" id="product-stock" class="form-control" value="${product?.stock || 0}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Min Stock Level</label>
                    <input type="number" id="product-minStock" class="form-control" value="${product?.minStock || 5}" required>
                </div>
            </div>
        `,
        onSubmit: async (data, close) => {
            const productData = {
                name: data.productName,
                sku: data.productSku,
                barcode: data.productBarcode,
                category: data.productCategory,
                price: parseFloat(data.productPrice),
                cost: parseFloat(data.productCost),
                stock: parseInt(data.productStock),
                minStock: parseInt(data.productMinStock)
            };

            if (isEdit) {
                await productService.update(productId, productData);
                addAuditLog('Product Updated', `Product updated: ${productData.name}`);
                showAlert('Product updated successfully!', 'success');
            } else {
                await productService.create(productData);
                addAuditLog('Product Created', `New product created: ${productData.name}`);
                showAlert('Product created successfully!', 'success');
            }

            close();
            await loadProducts();
        }
    });

    modal.open();
}

window.editProduct = async (id) => {
    await openProductModal(id);
};

window.deleteProduct = async (id) => {
    const product = await productService.getById(id);
    
    if (confirm(`Are you sure you want to delete "${product.name}"? This cannot be undone.`)) {
        await productService.delete(id);
        addAuditLog('Product Deleted', `Product deleted: ${product.name}`);
        showAlert('Product deleted successfully!', 'success');
        await loadProducts();
    }
};
