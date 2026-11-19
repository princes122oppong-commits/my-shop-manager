import CONSTANTS from '../config/constants.js';
import { productService } from './productService.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService, branchService } from './organizationService.js';

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
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) return [];
            const { data, error } = await client
                .from('inventory_movements')
                .select('*, products(name)')
                .eq('organization_id', organizationId)
                .eq('branch_id', branchService.getCurrentBranchId())
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
            const organizationId = organizationService.getCurrentOrganizationId();
            const branchId = branchService.getCurrentBranchId();
            if (!organizationId || !branchId) throw new Error('Select a store and branch before adjusting stock.');
            if (!['IN', 'OUT'].includes(type)) throw new Error('Stock adjustment type must be IN or OUT.');
            if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) throw new Error('Quantity must be a positive whole number.');
            const product = await productService.getById(productId);
            if (!product) return null;
            const { data: authData } = await client.auth.getUser();
            const { data: movementId, error } = await client.rpc('adjust_branch_inventory', {
                p_organization_id: organizationId,
                p_branch_id: branchId,
                p_product_id: productId,
                p_type: type,
                p_quantity: Number(quantity),
                p_reason: reason || null
            });
            if (error) throw error;
            const { data, error: movementError } = await client.from('inventory_movements')
                .select('*, products(name)').eq('organization_id', organizationId).eq('branch_id', branchId).eq('id', movementId).single();
            if (movementError) throw movementError;
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
