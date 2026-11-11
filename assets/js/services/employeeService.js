import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService } from './organizationService.js';
import { subscriptionService } from './subscriptionService.js';

function mapEmployee(row, profile = {}) {
    return {
        id: row.id,
        employeeId: row.employee_id,
        name: profile.full_name || profile.email || 'Employee',
        email: profile.email || '',
        phone: profile.phone || '',
        role: profile.role || 'cashier',
        department: row.department,
        salary: Number(row.salary) || 0,
        hireDate: row.hire_date,
        status: row.termination_date ? 'inactive' : 'active'
    };
}

export const employeeService = {
    init() {
        const employees = localStorage.getItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES);
        if (!employees) {
            const defaultEmployees = [
                {
                    id: '1',
                    name: 'Joe Tech Admin',
                    email: 'admin@joetech.com',
                    phone: '+1 555-0301',
                    role: 'admin',
                    department: 'Management',
                    salary: 5000,
                    hireDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'active'
                },
                {
                    id: '2',
                    name: 'Sarah Cashier',
                    email: 'cashier@joetech.com',
                    phone: '+1 555-0302',
                    role: 'cashier',
                    department: 'Sales',
                    salary: 2500,
                    hireDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'active'
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES, JSON.stringify(defaultEmployees));
        }
    },

    async getAll() {
        const client = await getSupabaseClient();
        if (client) {
            const { data: employees, error } = await client.from('employees').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            const ids = (employees || []).map(employee => employee.id);
            const { data: profiles, error: profileError } = ids.length
                ? await client.from('profiles').select('id, email, full_name, phone, role').in('id', ids)
                : { data: [], error: null };
            if (profileError) throw profileError;
            const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));
            return (employees || []).map(employee => mapEmployee(employee, profileMap.get(employee.id)));
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES) || '[]');
    },

    async getById(id) {
        return (await this.getAll()).find(e => e.id === id);
    },

    async create(employeeData) {
        const client = await getSupabaseClient();
        if (client) {
            await subscriptionService.assertCanCreate('user');
            const organizationId = organizationService.getCurrentOrganizationId();
            const { data: profile, error: profileError } = await client.from('profiles')
                .select('id, email, full_name, phone, role')
                .eq('email', employeeData.email)
                .maybeSingle();
            if (profileError) throw profileError;
            if (!profile) throw new Error('Create this employee in Supabase Authentication first, then try again.');

            const { error: memberError } = await client.from('organization_members').upsert({
                organization_id: organizationId,
                user_id: profile.id,
                role: employeeData.role || 'cashier',
                is_active: true
            }, { onConflict: 'organization_id,user_id' });
            if (memberError) throw memberError;

            const { data, error } = await client.from('employees').upsert({
                id: profile.id,
                organization_id: organizationId,
                employee_id: employeeData.employeeId || `EMP-${Date.now()}`,
                department: employeeData.department,
                position: employeeData.role,
                salary: Number(employeeData.salary),
                hire_date: employeeData.hireDate || new Date().toISOString().slice(0, 10)
            }).select('*').single();
            if (error) throw error;
            return mapEmployee(data, profile);
        }
        this.init();
        const employees = this.getAll();
        const newEmployee = {
            id: Date.now().toString(),
            ...employeeData,
            status: 'active',
            hireDate: new Date().toISOString()
        };
        employees.push(newEmployee);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        return newEmployee;
    },

    async update(id, employeeData) {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.from('employees').update({
                department: employeeData.department,
                position: employeeData.role,
                salary: Number(employeeData.salary)
            }).eq('id', id).select('*').single();
            if (error) throw error;
            const { error: memberError } = await client.from('organization_members')
                .update({ role: employeeData.role, is_active: true })
                .eq('organization_id', organizationService.getCurrentOrganizationId())
                .eq('user_id', id);
            if (memberError) throw memberError;
            return mapEmployee(data, { name: employeeData.name, email: employeeData.email, phone: employeeData.phone, role: employeeData.role });
        }
        this.init();
        const employees = this.getAll();
        const index = employees.findIndex(e => e.id === id);
        if (index !== -1) {
            employees[index] = { ...employees[index], ...employeeData };
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
            return employees[index];
        }
        return null;
    },

    async delete(id) {
        const client = await getSupabaseClient();
        if (client) {
            const { error } = await client.from('organization_members').update({ is_active: false })
                .eq('organization_id', organizationService.getCurrentOrganizationId())
                .eq('user_id', id);
            if (error) throw error;
            await client.from('employees').update({ termination_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
            return true;
        }
        this.init();
        const employees = this.getAll().filter(e => e.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        return true;
    }
};
