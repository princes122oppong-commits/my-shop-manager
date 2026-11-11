import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';

function mapSupplier(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email || '',
        phone: row.phone || '',
        address: row.address || '',
        contactPerson: row.contact_person || '',
        website: row.website || '',
        taxId: row.tax_id || '',
        totalOrders: Number(row.total_orders) || 0,
        totalPurchases: Number(row.total_purchases) || 0,
        rating: Number(row.rating) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: row.is_active !== false
    };
}

export const supplierService = {
    init() {
        const suppliers = localStorage.getItem(CONSTANTS.STORAGE_KEYS.SUPPLIERS);
        if (!suppliers) {
            const defaultSuppliers = [
                {
                    id: '1',
                    name: 'Apple Inc.',
                    email: 'orders@apple.com',
                    phone: '+1 555-0201',
                    address: '1 Apple Park Way, Cupertino, CA',
                    contactPerson: 'Tim Cook',
                    totalOrders: 15,
                    totalPurchases: 25000,
                    rating: 5,
                    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: '2',
                    name: 'Samsung Electronics',
                    email: 'orders@samsung.com',
                    phone: '+1 555-0202',
                    address: '129 Samsung-ro, Suwon-si, Korea',
                    contactPerson: 'JK Shin',
                    totalOrders: 12,
                    totalPurchases: 18500,
                    rating: 4,
                    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.SUPPLIERS, JSON.stringify(defaultSuppliers));
        }
    },

    async getAll() {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('suppliers').select('*').eq('is_active', true).order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).map(mapSupplier);
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.SUPPLIERS) || '[]');
    },

    async getById(id) {
        return (await this.getAll()).find(s => s.id === id);
    },

    async search(query) {
        const suppliers = await this.getAll();
        const q = query.toLowerCase();
        return suppliers.filter(s => 
            s.name.toLowerCase().includes(q) || 
            s.email.toLowerCase().includes(q) || 
            s.contactPerson.toLowerCase().includes(q)
        );
    },

    async create(supplierData) {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('suppliers').insert({
                name: supplierData.name,
                email: supplierData.email || null,
                phone: supplierData.phone,
                address: supplierData.address || null,
                contact_person: supplierData.contactPerson || null,
                website: supplierData.website || null,
                tax_id: supplierData.taxId || null,
                is_active: true
            }).select('*').single();
            if (error) throw error;
            return mapSupplier(data);
        }

        this.init();
        const suppliers = await this.getAll();
        const newSupplier = {
            id: Date.now().toString(),
            ...supplierData,
            totalOrders: 0,
            totalPurchases: 0,
            rating: 0,
            createdAt: new Date().toISOString()
        };
        suppliers.push(newSupplier);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
        return newSupplier;
    },

    async update(id, supplierData) {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('suppliers').update({
                name: supplierData.name,
                email: supplierData.email || null,
                phone: supplierData.phone,
                address: supplierData.address || null,
                contact_person: supplierData.contactPerson || null,
                website: supplierData.website || null,
                tax_id: supplierData.taxId || null
            }).eq('id', id).select('*').single();
            if (error) throw error;
            return mapSupplier(data);
        }

        this.init();
        const suppliers = await this.getAll();
        const index = suppliers.findIndex(s => s.id === id);
        if (index !== -1) {
            suppliers[index] = { ...suppliers[index], ...supplierData };
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
            return suppliers[index];
        }
        return null;
    },

    async delete(id) {
        const client = await getSupabaseClient();
        if (client) {
            const { error } = await client.from('suppliers').update({ is_active: false }).eq('id', id);
            if (error) throw error;
            return true;
        }

        this.init();
        const suppliers = (await this.getAll()).filter(s => s.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
        return true;
    },

    async updateStats(id, orderAmount) {
        const supplier = await this.getById(id);
        if (supplier) {
            supplier.totalOrders = (supplier.totalOrders || 0) + 1;
            supplier.totalPurchases = (supplier.totalPurchases || 0) + orderAmount;
            await this.update(id, supplier);
        }
    }
};
