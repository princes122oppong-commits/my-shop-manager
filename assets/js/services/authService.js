import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService } from './organizationService.js';

export const authService = {
    init() {
        const users = localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS);
        if (!users) {
            const defaultUsers = [
                {
                    id: '1',
                    email: 'admin@joetech.com',
                    password: 'admin',
                    name: 'Joe Tech Admin',
                    role: 'Administrator'
                },
                {
                    id: '2',
                    email: 'cashier@joetech.com',
                    password: 'cashier',
                    name: 'Sarah Cashier',
                    role: 'Cashier'
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(defaultUsers));
        }
    },

    async login(email, password) {
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) return { success: false, message: error.message };

            const { data: profile } = await client
                .from('profiles')
                .select('id, email, full_name, role, is_active')
                .eq('id', data.user.id)
                .maybeSingle();

            if (profile?.is_active === false) {
                await client.auth.signOut();
                return { success: false, message: 'This account is inactive.' };
            }

            const sessionUser = {
                id: data.user.id,
                email: data.user.email,
                name: profile?.full_name || data.user.user_metadata?.full_name || data.user.email,
                role: profile?.role || 'cashier'
            };
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER, JSON.stringify(sessionUser));
            const organizations = await organizationService.getMyOrganizations();
            if (organizations.available && organizations.organizations.length > 0) {
                const savedOrganizationId = organizationService.getCurrentOrganizationId();
                const currentOrganization = organizations.organizations.find(org => org.id === savedOrganizationId) || organizations.organizations[0];
                await organizationService.setActiveOrganization(currentOrganization);
                // In hosted mode, organization membership is the source of
                // truth for tenant permissions. Keep the profile role
                // separate so users cannot self-promote through profile edits.
                sessionUser.role = currentOrganization.role || sessionUser.role;
                localStorage.setItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER, JSON.stringify(sessionUser));
            }
            return { success: true, user: sessionUser };
        }

        this.init();
        const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS));
        const user = users.find(u => u.email === email && u.password === password);

        if (user) {
            const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER, JSON.stringify(sessionUser));
            return { success: true, user: sessionUser };
        }
        return { success: false, message: 'Invalid email or password' };
    },

    async register(input, email, password, role = 'cashier') {
        const values = typeof input === 'object'
            ? input
            : { name: input, email, password, role };
        const client = await getSupabaseClient();
        if (client) {
            const { data, error } = await client.auth.signUp({
                email: values.email,
                password: values.password,
                options: { data: { full_name: values.name } }
            });
            if (error) return { success: false, message: error.message };

            return { success: true, user: data.user, confirmationRequired: !data.session };
        }

        this.init();
        const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS));
        if (users.some(u => u.email === values.email)) {
            return { success: false, message: 'Email already exists' };
        }

        const newUser = {
            id: Date.now().toString(),
            name: values.name,
            email: values.email,
            password: values.password,
            role: values.role || 'cashier'
        };

        users.push(newUser);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(users));
        return { success: true, user: newUser };
    },

    async logout() {
        const client = await getSupabaseClient();
        if (client) await client.auth.signOut();
        localStorage.removeItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER);
    },

    getCurrentUser() {
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.CURRENT_USER));
    },

    async forgotPassword(email) {
        const client = await getSupabaseClient();
        if (client) {
            const { error } = await client.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            });
            return error ? { success: false, message: error.message } : { success: true };
        }

        this.init();
        const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS));
        const user = users.find(u => u.email === email);
        if (!user) {
            return { success: false, message: 'Email not found' };
        }
        // In a real app, send email. Here we just simulate success.
        return { success: true };
    },

    async resetPassword(email, newPassword) {
        const client = await getSupabaseClient();
        if (client) {
            const { error } = await client.auth.updateUser({ password: newPassword });
            return error ? { success: false, message: error.message } : { success: true };
        }

        this.init();
        const users = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.USERS));
        const userIndex = users.findIndex(u => u.email === email);
        if (userIndex === -1) {
            return { success: false, message: 'Email not found' };
        }
        users[userIndex].password = newPassword;
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.USERS, JSON.stringify(users));
        return { success: true };
    }
};
