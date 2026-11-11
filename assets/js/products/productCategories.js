import { renderSidebar } from '../components/sidebar.js';
import { renderNavbar } from '../components/navbar.js';
import { renderTable } from '../components/table.js';
import { createModal } from '../components/modal.js';
import { showAlert } from '../components/alert.js';
import { addAuditLog } from '../utils/helpers.js';
import CONSTANTS from '../config/constants.js';
import ROUTES, { checkAuth } from '../config/routes.js';

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    renderSidebar(ROUTES.PRODUCT_CATEGORIES);
    renderNavbar('Product Categories');
    loadCategories();
});

function loadCategories() {
    const categories = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CATEGORIES) || '[]');
    const products = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.PRODUCTS) || '[]');
    
    // If no categories exist, create default ones
    if (categories.length === 0) {
        const defaultCategories = [
            { id: '1', name: 'Smartphones', description: 'Mobile phones and accessories', productCount: 0 },
            { id: '2', name: 'Laptops', description: 'Notebooks and laptops', productCount: 0 },
            { id: '3', name: 'Accessories', description: 'Various tech accessories', productCount: 0 }
        ];
        
        defaultCategories.forEach(cat => {
            cat.productCount = products.filter(p => p.category === cat.name).length;
        });
        
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.CATEGORIES, JSON.stringify(defaultCategories));
    }

    const categoriesWithCounts = categories.map(cat => ({
        ...cat,
        productCount: products.filter(p => p.category === cat.name).length
    }));

    renderTable({
        containerId: 'categories-table-container',
        headers: ['Category Name', 'Description', 'Products', 'Actions'],
        data: categoriesWithCounts,
        renderRow: (category) => `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 1rem; font-weight: 600;">${category.name}</td>
                <td style="padding: 1rem; color: var(--text-muted);">${category.description || '-'}</td>
                <td style="padding: 1rem;">
                    <span class="badge badge-success">${category.productCount} products</span>
                </td>
                <td style="padding: 1rem;">
                    <div class="flex gap-2">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="editCategory('${category.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.4rem 0.8rem; font-size: 0.875rem;" onclick="deleteCategory('${category.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `
    });

    document.getElementById('add-category-btn')?.addEventListener('click', () => {
        openCategoryModal();
    });
}

function openCategoryModal(categoryId = null) {
    const category = categoryId ? JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CATEGORIES) || '[]').find(c => c.id === categoryId) : null;
    const isEdit = !!category;

    const modal = createModal({
        id: 'category-modal',
        title: isEdit ? 'Edit Category' : 'Add New Category',
        submitText: isEdit ? 'Update' : 'Create',
        content: `
            <div class="form-group">
                <label class="form-label">Category Name</label>
                <input type="text" id="category-name" class="form-control" value="${category?.name || ''}" required>
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea id="category-description" class="form-control" rows="3">${category?.description || ''}</textarea>
            </div>
        `,
        onSubmit: (data, close) => {
            const categories = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CATEGORIES) || '[]');
            
            if (isEdit) {
                const index = categories.findIndex(c => c.id === categoryId);
                categories[index] = { ...categories[index], name: data.categoryName, description: data.categoryDescription };
                addAuditLog('Category Updated', `Category updated: ${data.categoryName}`);
                showAlert('Category updated successfully!', 'success');
            } else {
                categories.push({
                    id: Date.now().toString(),
                    name: data.categoryName,
                    description: data.categoryDescription,
                    productCount: 0
                });
                addAuditLog('Category Created', `New category created: ${data.categoryName}`);
                showAlert('Category created successfully!', 'success');
            }

            localStorage.setItem(CONSTANTS.STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
            close();
            loadCategories();
        }
    });

    modal.open();
}

window.editCategory = (id) => {
    openCategoryModal(id);
};

window.deleteCategory = (id) => {
    if (confirm('Are you sure you want to delete this category?')) {
        const categories = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CATEGORIES) || '[]');
        const category = categories.find(c => c.id === id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.CATEGORIES, JSON.stringify(categories.filter(c => c.id !== id)));
        addAuditLog('Category Deleted', `Category deleted: ${category?.name}`);
        showAlert('Category deleted successfully!', 'success');
        loadCategories();
    }
};
