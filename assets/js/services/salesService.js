import CONSTANTS from '../config/constants.js';
import { inventoryService } from './inventoryService.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService, branchService } from './organizationService.js';
import { subscriptionService } from './subscriptionService.js';

function mapSale(row, items = []) {
    return {
        id: row.sale_number || row.id,
        databaseId: row.id,
        items,
        subtotal: Number(row.subtotal) || 0,
        tax: Number(row.tax_amount) || 0,
        total: Number(row.total) || 0,
        paymentMethod: row.payment_method || '',
        customerName: row.customer_name || 'Walk-in Customer',
        date: row.created_at,
        cashier: row.cashier_name || 'System'
    };
}

export const salesService = {
    init() {
        const sales = localStorage.getItem(CONSTANTS.STORAGE_KEYS.SALES);
        if (!sales) {
            const defaultSales = [
                {
                    id: 'S-1001',
                    items: [
                        {
                            productId: '1',
                            name: 'iPhone 15 Pro Max 256GB',
                            price: 1199.00,
                            quantity: 1,
                            total: 1199.00
                        },
                        {
                            productId: '5',
                            name: 'Logitech MX Master 3S Mouse',
                            price: 99.00,
                            quantity: 2,
                            total: 198.00
                        }
                    ],
                    subtotal: 1397.00,
                    tax: 115.25,
                    total: 1512.25,
                    paymentMethod: 'Credit Card',
                    customerName: 'Walk-in Customer',
                    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                    cashier: 'Sarah Cashier'
                },
                {
                    id: 'S-1002',
                    items: [
                        {
                            productId: '4',
                            name: 'Sony WH-1000XM5 Wireless Headphones',
                            price: 399.00,
                            quantity: 1,
                            total: 399.00
                        }
                    ],
                    subtotal: 399.00,
                    tax: 32.92,
                    total: 431.92,
                    paymentMethod: 'Cash',
                    customerName: 'John Doe',
                    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                    cashier: 'Sarah Cashier'
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.SALES, JSON.stringify(defaultSales));
        }
    },

    async getAll() {
        const client = await getSupabaseClient();
        if (client) {
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) return [];
            const { data, error } = await client.from('sales').select('*, sale_items(*)').eq('organization_id', organizationId).eq('branch_id', branchService.getCurrentBranchId()).order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).map(row => mapSale(row, (row.sale_items || []).map(item => ({
                productId: item.product_id,
                name: item.product_name,
                price: Number(item.unit_price),
                cost: Number(item.cost_price) || 0,
                quantity: Number(item.quantity),
                total: Number(item.total)
            }))));
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SALES));
    },

    async createSale({ items, paymentMethod, customerName, cashier }) {
        const client = await getSupabaseClient();
        if (client) {
            const organizationId = organizationService.getCurrentOrganizationId();
            const branchId = branchService.getCurrentBranchId();
            if (!organizationId || !branchId) throw new Error('Select a store and branch before processing sales.');
            await subscriptionService.assertCanCreate('sale');
            const { data: authData } = await client.auth.getUser();
            const settings = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS)) || CONSTANTS.DEFAULT_SETTINGS;
            const taxRate = Number(settings.taxRate || 0) / 100;
            const payment = String(paymentMethod || 'cash').toLowerCase().replaceAll(' ', '_');
            const saleFingerprint = JSON.stringify({
                organizationId, branchId, payment, customerName: customerName || 'Walk-in Customer',
                items: items.map(item => [item.productId, Number(item.quantity)])
            });
            let pendingCheckout;
            try { pendingCheckout = JSON.parse(sessionStorage.getItem('joetech_pending_checkout') || 'null'); } catch { pendingCheckout = null; }
            if (pendingCheckout?.fingerprint !== saleFingerprint) {
                pendingCheckout = {
                    fingerprint: saleFingerprint,
                    id: crypto.randomUUID(),
                    saleNumber: `S-${Date.now()}`
                };
                sessionStorage.setItem('joetech_pending_checkout', JSON.stringify(pendingCheckout));
            }

            const { error: checkoutError } = await client.rpc('create_sale_with_inventory', {
                p_sale_id: pendingCheckout.id,
                p_sale_number: pendingCheckout.saleNumber,
                p_organization_id: organizationId,
                p_branch_id: branchId,
                p_customer_name: customerName || 'Walk-in Customer',
                p_cashier_name: cashier || authData?.user?.email || 'System',
                p_tax_rate: taxRate,
                p_payment_method: ['cash', 'credit_card', 'mobile_transfer', 'check', 'wallet'].includes(payment) ? payment : 'cash',
                p_items: items.map(item => ({ productId: item.productId, quantity: Number(item.quantity) }))
            });
            if (checkoutError) {
                // If the response was lost after the database committed, recover
                // the completed sale instead of deleting a valid transaction.
                const { data: recoveredSale, error: recoveryError } = await client.from('sales')
                    .select('*, sale_items(*)')
                    .eq('organization_id', organizationId)
                    .eq('branch_id', branchId)
                    .eq('id', pendingCheckout.id)
                    .maybeSingle();
                if (recoveryError || !recoveredSale) throw checkoutError;
                sessionStorage.removeItem('joetech_pending_checkout');
                return mapSale(recoveredSale, (recoveredSale.sale_items || []).map(item => ({
                    productId: item.product_id,
                    name: item.product_name,
                    price: Number(item.unit_price),
                    cost: Number(item.cost_price) || 0,
                    quantity: Number(item.quantity),
                    total: Number(item.total)
                })));
            }

            const { data: sale, error: saleError } = await client.from('sales')
                .select('*, sale_items(*)')
                .eq('organization_id', organizationId)
                .eq('branch_id', branchId)
                .eq('id', pendingCheckout.id)
                .single();
            if (saleError) throw saleError;
            sessionStorage.removeItem('joetech_pending_checkout');
            return mapSale(sale, (sale.sale_items || []).map(item => ({
                productId: item.product_id,
                name: item.product_name,
                price: Number(item.unit_price),
                cost: Number(item.cost_price) || 0,
                quantity: Number(item.quantity),
                total: Number(item.total)
            })));
        }

        this.init();
        const sales = await this.getAll();

        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const settings = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS)) || CONSTANTS.DEFAULT_SETTINGS;
        const taxRate = parseFloat(settings.taxRate || 0) / 100;
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        const saleId = 'S-' + (1000 + sales.length + 1);

        const newSale = {
            id: saleId,
            items,
            subtotal,
            tax,
            total,
            paymentMethod,
            customerName: customerName || 'Walk-in Customer',
            date: new Date().toISOString(),
            cashier: cashier || 'System'
        };

        // Deduct stock and record inventory movement
        await Promise.all(items.map(item => inventoryService.addMovement({
                productId: item.productId,
                type: 'OUT',
                quantity: item.quantity,
                reason: `Sale ${saleId}`,
                user: cashier
            })));

        sales.unshift(newSale);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.SALES, JSON.stringify(sales));
        return newSale;
    }
};
