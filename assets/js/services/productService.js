import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService } from './organizationService.js';
import { subscriptionService } from './subscriptionService.js';
import { branchService } from './organizationService.js';

async function applyBranchStock(client, products) {
    const branchId = branchService.getCurrentBranchId();
    if (!branchId || !products.length) return products;
    const { data, error } = await client.from('branch_inventory').select('product_id, stock').eq('branch_id', branchId);
    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return products;
        throw error;
    }
    const stockByProduct = new Map((data || []).map(row => [row.product_id, Number(row.stock) || 0]));
    return products.map(product => ({ ...product, stock: stockByProduct.get(product.id) ?? 0 }));
}

function mapProduct(row) {
    return {
        id: row.id,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode || '',
        category: row.categories?.name || row.category || '',
        categoryId: row.category_id || null,
        brandId: row.brand_id || null,
        unitId: row.unit_id || null,
        description: row.description || '',
        price: Number(row.price) || 0,
        cost: Number(row.cost) || 0,
        stock: Number(row.stock) || 0,
        minStock: Number(row.min_stock) || 0,
        maxStock: row.max_stock,
        weight: row.weight,
        dimensions: row.dimensions,
        imageUrl: row.image_url,
        isActive: row.is_active !== false,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function resolveCategoryId(client, category) {
    if (!category || typeof category !== 'string') return null;
    const { data } = await client.from('categories').select('id').eq('name', category).maybeSingle();
    if (data?.id) return data.id;
    const { data: created, error } = await client.from('categories').insert({
        name: category,
        organization_id: organizationService.getCurrentOrganizationId()
    }).select('id').single();
    if (error) throw error;
    return created.id;
}

export const productService = {
    init() {
        const products = localStorage.getItem(CONSTANTS.STORAGE_KEYS.PRODUCTS);
        if (!products) {
            const defaultProducts = [
                {
                    id: '1',
                    name: 'iPhone 15 Pro Max 256GB',
                    sku: 'IPH15PM256',
                    barcode: '190199000123',
                    category: 'Smartphones',
                    price: 1199.00,
                    cost: 850.00,
                    stock: 15,
                    minStock: 5,
                    supplier: 'Apple Inc.'
                },
                {
                    id: '2',
                    name: 'MacBook Pro 14" M3 16GB/512GB',
                    sku: 'MBP14M3-16-512',
                    barcode: '190199000456',
                    category: 'Laptops',
                    price: 1799.00,
                    cost: 1350.00,
                    stock: 8,
                    minStock: 3,
                    supplier: 'Apple Inc.'
                },
                {
                    id: '3',
                    name: 'Samsung Galaxy S24 Ultra 512GB',
                    sku: 'SAMS24U512',
                    barcode: '880609000789',
                    category: 'Smartphones',
                    price: 1299.00,
                    cost: 950.00,
                    stock: 12,
                    minStock: 4,
                    supplier: 'Samsung Electronics'
                },
                {
                    id: '4',
                    name: 'Sony WH-1000XM5 Wireless Headphones',
                    sku: 'SONYXM5',
                    barcode: '454873613091',
                    category: 'Accessories',
                    price: 399.00,
                    cost: 250.00,
                    stock: 25,
                    minStock: 8,
                    supplier: 'Sony Corp'
                },
                {
                    id: '5',
                    name: 'Logitech MX Master 3S Mouse',
                    sku: 'LOGIMX3S',
                    barcode: '097855170123',
                    category: 'Accessories',
                    price: 99.00,
                    cost: 60.00,
                    stock: 40,
                    minStock: 10,
                    supplier: 'Logitech Inc.'
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.PRODUCTS, JSON.stringify(defaultProducts));
        }
    },

    async getAll() {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client
                .from('products')
                .select('*, categories(name)')
                .eq('is_active', true)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return applyBranchStock(client, (data || []).map(mapProduct));
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.PRODUCTS));
    },

    async getById(id) {
        const products = await this.getAll();
        return products.find(p => p.id === id);
    },

    async getByBarcode(barcode) {
        const products = await this.getAll();
        return products.find(p => p.barcode === barcode || p.sku === barcode);
    },

    async create(productData) {
        const client = await getSupabaseClient();
        if (client) {
            await subscriptionService.assertCanCreate('product');
            const { data, error } = await client.from('products').insert({
                organization_id: organizationService.getCurrentOrganizationId(),
                name: productData.name,
                sku: productData.sku,
                barcode: productData.barcode || null,
                category_id: await resolveCategoryId(client, productData.category),
                description: productData.description || null,
                price: Number(productData.price),
                cost: Number(productData.cost),
                stock: 0,
                min_stock: Number(productData.minStock || 0),
                is_active: true
            }).select('*, categories(name)').single();
            if (error) throw error;
            const branchId = branchService.getCurrentBranchId();
            const stock = Number(productData.stock || 0);
            if (branchId) {
                const { error: inventoryError } = await client.from('branch_inventory').upsert({
                    organization_id: organizationService.getCurrentOrganizationId(), branch_id: branchId,
                    product_id: data.id, stock, updated_at: new Date().toISOString()
                }, { onConflict: 'branch_id,product_id' });
                if (inventoryError && inventoryError.code !== '42P01' && inventoryError.code !== 'PGRST205') throw inventoryError;
            }
            return { ...mapProduct(data), stock };
        }

        const products = await this.getAll();
        const newProduct = {
            id: Date.now().toString(),
            ...productData,
            price: parseFloat(productData.price),
            cost: parseFloat(productData.cost),
            stock: parseInt(productData.stock || 0),
            minStock: parseInt(productData.minStock || 0)
        };
        products.push(newProduct);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
        return newProduct;
    },

    async update(id, productData) {
        const client = await getSupabaseClient();
        if (client) {
            const payload = {
                name: productData.name,
                sku: productData.sku,
                barcode: productData.barcode || null,
                category_id: await resolveCategoryId(client, productData.category),
                price: Number(productData.price),
                cost: Number(productData.cost),
                min_stock: Number(productData.minStock)
            };
            const { data, error } = await client.from('products').update(payload).eq('id', id).select('*, categories(name)').single();
            if (error) throw error;
            const branchId = branchService.getCurrentBranchId();
            if (branchId && productData.stock !== undefined) {
                const { error: inventoryError } = await client.from('branch_inventory').upsert({
                    organization_id: organizationService.getCurrentOrganizationId(), branch_id: branchId,
                    product_id: id, stock: Math.max(0, Number(productData.stock)), updated_at: new Date().toISOString()
                }, { onConflict: 'branch_id,product_id' });
                if (inventoryError && inventoryError.code !== '42P01' && inventoryError.code !== 'PGRST205') throw inventoryError;
            }
            return { ...mapProduct(data), stock: Number(productData.stock ?? data.stock) };
        }

        const products = await this.getAll();
        const index = products.findIndex(p => p.id === id);
        if (index !== -1) {
            products[index] = {
                ...products[index],
                ...productData,
                price: parseFloat(productData.price),
                cost: parseFloat(productData.cost),
                stock: parseInt(productData.stock),
                minStock: parseInt(productData.minStock)
            };
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
            return products[index];
        }
        return null;
    },

    async delete(id) {
        const client = await getSupabaseClient();
        if (client) {
            const { error } = await client.from('products').update({ is_active: false }).eq('id', id);
            if (error) throw error;
            return true;
        }

        const products = await this.getAll();
        const filtered = products.filter(p => p.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.PRODUCTS, JSON.stringify(filtered));
        return true;
    },

    async updateStock(id, quantityChange) {
        const client = await getSupabaseClient();
        if (client) {
            const branchId = branchService.getCurrentBranchId();
            const { data: product, error: readError } = await client.from('branch_inventory').select('stock').eq('product_id', id).eq('branch_id', branchId).maybeSingle();
            if (readError && readError.code !== '42P01' && readError.code !== 'PGRST205') throw readError;
            if (!branchId || (readError && (readError.code === '42P01' || readError.code === 'PGRST205'))) {
                const { data: legacyProduct, error: legacyError } = await client.from('products').select('stock').eq('id', id).single();
                if (legacyError) throw legacyError;
                const stock = Number(legacyProduct.stock) + Number(quantityChange);
                if (stock < 0) throw new Error('Insufficient stock.');
                const { data, error } = await client.from('products').update({ stock }).eq('id', id).select('*, categories(name)').single();
                if (error) throw error;
                return mapProduct(data);
            }
            const stock = Number(product?.stock || 0) + Number(quantityChange);
            if (stock < 0) throw new Error('Insufficient stock.');
            const { error: writeError } = await client.from('branch_inventory').upsert({
                organization_id: organizationService.getCurrentOrganizationId(), branch_id: branchId,
                product_id: id, stock, updated_at: new Date().toISOString()
            }, { onConflict: 'branch_id,product_id' });
            if (writeError) throw writeError;
            const productData = await this.getById(id);
            return { ...productData, stock };
        }

        const products = await this.getAll();
        const index = products.findIndex(p => p.id === id);
        if (index !== -1) {
            products[index].stock += quantityChange;
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
            return products[index];
        }
        return null;
    }
};
