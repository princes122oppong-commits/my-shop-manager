import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService, branchService } from './organizationService.js';
import { subscriptionService } from './subscriptionService.js';

function mapEmployee(row, profile = {}) {
    return {
        id: row.user_id || row.id,
        employeeId: row.employee_id,
        name: profile.full_name || profile.email || 'Employee',
        email: profile.email || '',
        phone: profile.phone || '',
        role: profile.role || 'cashier',
        department: row.department,
        salary: Number(row.salary) || 0,
        branchId: row.branch_id || null,
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
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) return [];
            const { data: members, error: memberError } = await client.from('organization_members')
                .select('user_id, role').eq('organization_id', organizationId).eq('is_active', true).order('created_at');
            if (memberError) throw memberError;
            const ids = (members || []).map(member => member.user_id);
            if (!ids.length) return [];
            const [{ data: profiles, error: profileError }, { data: employees, error: employeeError }] = await Promise.all([
                client.from('profiles').select('id, email, full_name, phone, role').in('id', ids),
                client.from('organization_employee_details').select('*').eq('organization_id', organizationId).in('user_id', ids)
            ]);
            if (profileError) throw profileError;
            if (employeeError) throw employeeError;
            const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));
            const employeeMap = new Map((employees || []).map(employee => [employee.user_id, employee]));
            return (members || []).map(member => {
                const profile = profileMap.get(member.user_id) || {};
                const employee = employeeMap.get(member.user_id) || { id: member.user_id };
                return { ...mapEmployee(employee, profile), role: member.role };
            });
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
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) throw new Error('Select a store before managing staff.');
            await subscriptionService.assertCanCreate('user');
            const branchId = branchService.getCurrentBranchId();
            if (!branchId) throw new Error('Select an active branch before adding staff.');
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

            const { data, error } = await client.from('organization_employee_details').upsert({
                organization_id: organizationId,
                user_id: profile.id,
                branch_id: branchId,
                employee_id: employeeData.employeeId || `EMP-${Date.now()}`,
                department: employeeData.department,
                position: employeeData.role,
                salary: Number(employeeData.salary),
                hire_date: employeeData.hireDate || new Date().toISOString().slice(0, 10)
            }, { onConflict: 'organization_id,user_id' }).select('*').single();
            if (error) throw error;
            const { error: branchError } = await client.from('user_branches').upsert({
                organization_id: organizationId, user_id: profile.id,
                branch_id: branchId, is_primary: true
            }, { onConflict: 'user_id,branch_id' });
            if (branchError) throw branchError;
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
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) throw new Error('Select a store before updating staff.');
            const { data: authData } = await client.auth.getUser();
            if (authData?.user?.id === id) throw new Error('You cannot change your own store role here.');
            const { data: member, error: memberError } = await client.from('organization_members')
                .update({ role: employeeData.role, is_active: true })
                .eq('organization_id', organizationId).eq('user_id', id).select('user_id, role').single();
            if (memberError) throw memberError;
            const { data: existingDetails, error: detailsError } = await client.from('organization_employee_details')
                .select('*').eq('organization_id', organizationId).eq('user_id', id).maybeSingle();
            if (detailsError) throw detailsError;
            const { data, error } = await client.from('organization_employee_details').upsert({
                organization_id: organizationId,
                user_id: id,
                branch_id: existingDetails?.branch_id || branchService.getCurrentBranchId(),
                employee_id: employeeData.employeeId || existingDetails?.employee_id || `EMP-${Date.now()}`,
                department: employeeData.department,
                position: employeeData.role,
                salary: Number(employeeData.salary),
                hire_date: employeeData.hireDate || existingDetails?.hire_date || new Date().toISOString().slice(0, 10)
            }, { onConflict: 'organization_id,user_id' }).select('*').single();
            if (error) throw error;
            return { ...mapEmployee(data || { id }, { name: employeeData.name, email: employeeData.email, phone: employeeData.phone, role: member.role }), role: member.role };
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
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) throw new Error('Select a store before removing staff.');
            const { data: authData } = await client.auth.getUser();
            if (authData?.user?.id === id) throw new Error('You cannot remove your own store access.');
            const { error } = await client.from('organization_members').update({ is_active: false })
                .eq('organization_id', organizationId)
                .eq('user_id', id);
            if (error) throw error;
            const { error: employeeError } = await client.from('organization_employee_details').update({ termination_date: new Date().toISOString().slice(0, 10) })
                .eq('organization_id', organizationId).eq('user_id', id);
            if (employeeError) throw employeeError;
            return true;
        }
        this.init();
        const employees = this.getAll().filter(e => e.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        return true;
    }
};
