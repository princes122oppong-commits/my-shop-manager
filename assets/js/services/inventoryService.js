import CONSTANTS from '../config/constants.js';
import { productService } from './productService.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService } from './organizationService.js';

export const inventoryService = {
    init() {
        const movements = localStorage.getItem(CONSTANTS.STORAGE_KEYS.INVENTORY_MOVEMENTS);
        if (!movements) {
            const defaultMovements = [
                {
                    id: '1',
                    productId: '1',
                    productName: 'iPhone 15 Pro Max 256GB',
                    type: 'IN', // IN, OUT, ADJUST
                    quantity: 15,
                    reason: 'Initial Stock',
                    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    user: 'Joe Tech Admin'
                },
                {
                    id: '2',
                    productId: '2',
                    productName: 'MacBook Pro 14" M3 16GB/512GB',
                    type: 'IN',
                    quantity: 8,
                    reason: 'Initial Stock',
                    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    user: 'Joe Tech Admin'
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.INVENTORY_MOVEMENTS, JSON.stringify(defaultMovements));
        }
    },

    async getMovements() {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client
                .from('inventory_movements')
                .select('*, products(name)')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).map(m => ({
                id: m.id,
                productId: m.product_id,
                productName: m.products?.name || 'Unknown product',
                type: m.type,
                quantity: Number(m.quantity),
                reason: m.reason || '',
                date: m.created_at,
                user: m.user_id || 'System'
            }));
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.INVENTORY_MOVEMENTS));
    },

    async addMovement({ productId, type, quantity, reason, user }) {
        const client = await getSupabaseClient();
        if (client) {
            const product = await productService.getById(productId);
            if (!product) return null;
            const { data: authData } = await client.auth.getUser();
            const { data, error } = await client.from('inventory_movements').insert({
                organization_id: organizationService.getCurrentOrganizationId(),
                product_id: productId,
                type,
                quantity: Number(quantity),
                reason: reason || null,
                user_id: authData?.user?.id || null
            }).select('*, products(name)').single();
            if (error) throw error;
            await productService.updateStock(productId, type === 'IN' ? Number(quantity) : -Number(quantity));
            return {
                id: data.id,
                productId: data.product_id,
                productName: data.products?.name || product.name,
                type: data.type,
                quantity: Number(data.quantity),
                reason: data.reason || '',
                date: data.created_at,
                user: user || authData?.user?.email || 'System'
            };
        }

        this.init();
        const product = await productService.getById(productId);
        if (!product) return null;

        const movements = await this.getMovements();
        const newMovement = {
            id: Date.now().toString(),
            productId,
            productName: product.name,
            type,
            quantity: parseInt(quantity),
            reason,
            date: new Date().toISOString(),
            user: user || 'System'
        };

        movements.unshift(newMovement); // Add to top
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.INVENTORY_MOVEMENTS, JSON.stringify(movements));

        // Update product stock
        const stockChange = type === 'IN' ? quantity : -quantity;
        await productService.updateStock(productId, stockChange);

        return newMovement;
    }
};
