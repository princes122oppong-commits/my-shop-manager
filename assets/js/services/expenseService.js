import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService, branchService } from './organizationService.js';

function mapExpense(row) {
    return {
        id: row.id,
        category: row.expense_categories?.name || row.category || '',
        categoryId: row.category_id || null,
        description: row.description,
        amount: Number(row.amount) || 0,
        paymentMethod: row.payment_method || '',
        receipt: row.reference_number || '',
        date: row.expense_date || row.created_at,
        status: row.status || 'pending',
        createdAt: row.created_at
    };
}

async function resolveCategoryId(client, category) {
    const { data } = await client.from('expense_categories').select('id').eq('name', category).maybeSingle();
    if (data?.id) return data.id;
    const { data: created, error } = await client.from('expense_categories').insert({
        name: category,
        organization_id: organizationService.getCurrentOrganizationId()
    }).select('id').single();
    if (error) throw error;
    return created.id;
}

export const expenseService = {
    init() {
        const expenses = localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXPENSES);
        if (!expenses) {
            const defaultExpenses = [
                {
                    id: '1',
                    category: 'Rent',
                    amount: 2000,
                    description: 'Monthly store rent',
                    date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    paymentMethod: 'Bank Transfer',
                    receipt: 'RENT-001',
                    status: 'paid'
                },
                {
                    id: '2',
                    category: 'Utilities',
                    amount: 350,
                    description: 'Electricity and water bill',
                    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    paymentMethod: 'Cash',
                    receipt: 'UTIL-001',
                    status: 'paid'
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXPENSES, JSON.stringify(defaultExpenses));
        }
    },

    async getAll() {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('expenses').select('*, expense_categories(name)').eq('branch_id', branchService.getCurrentBranchId()).order('expense_date', { ascending: false });
            if (error) throw error;
            return (data || []).map(mapExpense);
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EXPENSES) || '[]');
    },

    async getById(id) {
        return (await this.getAll()).find(e => e.id === id);
    },

    async create(expenseData) {
        const client = await getSupabaseClient();
        if (client) {
            const { data: userData } = await client.auth.getUser();
            const { data, error } = await client.from('expenses').insert({
                organization_id: organizationService.getCurrentOrganizationId(),
                branch_id: branchService.getCurrentBranchId(),
                category_id: await resolveCategoryId(client, expenseData.category),
                description: expenseData.description,
                amount: Number(expenseData.amount),
                payment_method: expenseData.paymentMethod,
                reference_number: expenseData.receipt || null,
                expense_date: expenseData.date,
                status: expenseData.status || 'paid',
                created_by: userData?.user?.id || null
            }).select('*, expense_categories(name)').single();
            if (error) throw error;
            return mapExpense(data);
        }

        this.init();
        const expenses = await this.getAll();
        const newExpense = {
            id: Date.now().toString(),
            ...expenseData,
            createdAt: new Date().toISOString()
        };
        expenses.unshift(newExpense);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
        return newExpense;
    },

    async update(id, expenseData) {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('expenses').update({
                category_id: await resolveCategoryId(client, expenseData.category),
                description: expenseData.description,
                amount: Number(expenseData.amount),
                payment_method: expenseData.paymentMethod,
                reference_number: expenseData.receipt || null,
                expense_date: expenseData.date,
                status: expenseData.status || 'paid'
            }).eq('id', id).select('*, expense_categories(name)').single();
            if (error) throw error;
            return mapExpense(data);
        }

        this.init();
        const expenses = await this.getAll();
        const index = expenses.findIndex(e => e.id === id);
        if (index !== -1) {
            expenses[index] = { ...expenses[index], ...expenseData };
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
            return expenses[index];
        }
        return null;
    },

    async delete(id) {
        const client = await getSupabaseClient();
        if (client) {
            const { error } = await client.from('expenses').delete().eq('id', id);
            if (error) throw error;
            return true;
        }

        this.init();
        const expenses = (await this.getAll()).filter(e => e.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
        return true;
    },

    async getByDateRange(startDate, endDate) {
        const expenses = await this.getAll();
        return expenses.filter(e => {
            const date = new Date(e.date);
            return date >= new Date(startDate) && date <= new Date(endDate);
        });
    },

    async getTotalByCategory() {
        const expenses = await this.getAll();
        const totals = {};
        expenses.forEach(e => {
            totals[e.category] = (totals[e.category] || 0) + parseFloat(e.amount);
        });
        return totals;
    }
};
