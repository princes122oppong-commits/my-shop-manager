import CONSTANTS from '../config/constants.js';
import { productService } from './productService.js';
import { inventoryService } from './inventoryService.js';
import { getSupabaseClient } from './supabase.js';

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
            const { data, error } = await client.from('sales').select('*, sale_items(*)').order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).map(row => mapSale(row, (row.sale_items || []).map(item => ({
                productId: item.product_id,
                name: item.product_name,
                price: Number(item.unit_price),
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
            const { data: authData } = await client.auth.getUser();
            const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
            const settings = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SETTINGS)) || CONSTANTS.DEFAULT_SETTINGS;
            const taxRate = Number(settings.taxRate || 0) / 100;
            const tax = subtotal * taxRate;
            const total = subtotal + tax;
            const saleNumber = `S-${Date.now()}`;
            const payment = String(paymentMethod || 'cash').toLowerCase().replaceAll(' ', '_');

            const { data: sale, error: saleError } = await client.from('sales').insert({
                sale_number: saleNumber,
                customer_name: customerName || 'Walk-in Customer',
                user_id: authData?.user?.id || null,
                cashier_name: cashier || authData?.user?.email || 'System',
                subtotal,
                tax_amount: tax,
                total,
                payment_method: ['cash', 'credit_card', 'mobile_transfer', 'check', 'wallet'].includes(payment) ? payment : 'cash',
                payment_status: 'paid'
            }).select('*').single();
            if (saleError) throw saleError;

            const saleItems = items.map(item => ({
                sale_id: sale.id,
                product_id: item.productId,
                product_name: item.name,
                product_sku: item.sku || null,
                quantity: Number(item.quantity),
                unit_price: Number(item.price),
                cost_price: Number(item.cost || 0),
                total: Number(item.price) * Number(item.quantity)
            }));
            const { error: itemError } = await client.from('sale_items').insert(saleItems);
            if (itemError) {
                await client.from('sales').delete().eq('id', sale.id);
                throw itemError;
            }
            return mapSale({ ...sale, sale_number: saleNumber }, items);
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
