import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService } from './organizationService.js';

function mapCustomer(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email || '',
        phone: row.phone || '',
        address: row.address || '',
        city: row.city || '',
        country: row.country || 'Ghana',
        totalPurchases: Number(row.total_purchases) || 0,
        totalVisits: Number(row.total_visits) || 0,
        loyaltyPoints: Number(row.loyalty_points) || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: row.is_active !== false
    };
}

export const customerService = {
    init() {
        const customers = localStorage.getItem(CONSTANTS.STORAGE_KEYS.CUSTOMERS);
        if (!customers) {
            const defaultCustomers = [
                {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '+1 555-0101',
                    address: '123 Main St, City',
                    totalPurchases: 2500,
                    loyaltyPoints: 250,
                    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    id: '2',
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    phone: '+1 555-0102',
                    address: '456 Oak Ave, Town',
                    totalPurchases: 1200,
                    loyaltyPoints: 120,
                    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.CUSTOMERS, JSON.stringify(defaultCustomers));
        }
    },

    async getAll() {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('customers').select('*').eq('is_active', true).order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).map(mapCustomer);
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CUSTOMERS) || '[]');
    },

    async getById(id) {
        return (await this.getAll()).find(c => c.id === id);
    },

    async search(query) {
        const customers = await this.getAll();
        const q = query.toLowerCase();
        return customers.filter(c => 
            c.name.toLowerCase().includes(q) || 
            c.email.toLowerCase().includes(q) || 
            c.phone.includes(q)
        );
    },

    async create(customerData) {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('customers').insert({
                organization_id: organizationService.getCurrentOrganizationId(),
                name: customerData.name,
                email: customerData.email || null,
                phone: customerData.phone,
                address: customerData.address || null,
                country: customerData.country || 'Ghana',
                is_active: true
            }).select('*').single();
            if (error) throw error;
            return mapCustomer(data);
        }

        this.init();
        const customers = await this.getAll();
        const newCustomer = {
            id: Date.now().toString(),
            ...customerData,
            totalPurchases: 0,
            loyaltyPoints: 0,
            createdAt: new Date().toISOString()
        };
        customers.push(newCustomer);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
        return newCustomer;
    },

    async update(id, customerData) {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('customers').update({
                name: customerData.name,
                email: customerData.email || null,
                phone: customerData.phone,
                address: customerData.address || null
            }).eq('id', id).select('*').single();
            if (error) throw error;
            return mapCustomer(data);
        }

        this.init();
        const customers = await this.getAll();
        const index = customers.findIndex(c => c.id === id);
        if (index !== -1) {
            customers[index] = { ...customers[index], ...customerData };
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
            return customers[index];
        }
        return null;
    },

    async delete(id) {
        const client = await getSupabaseClient();
        if (client) {
            const { error } = await client.from('customers').update({ is_active: false }).eq('id', id);
            if (error) throw error;
            return true;
        }

        this.init();
        const customers = (await this.getAll()).filter(c => c.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
        return true;
    },

    async addLoyaltyPoints(customerId, points) {
        const customer = await this.getById(customerId);
        if (customer) {
            customer.loyaltyPoints = (customer.loyaltyPoints || 0) + points;
            await this.update(customerId, { loyaltyPoints: customer.loyaltyPoints });
            return customer;
        }
        return null;
    }
};
