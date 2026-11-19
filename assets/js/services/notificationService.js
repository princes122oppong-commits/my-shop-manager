import CONSTANTS from '../config/constants.js';
import { getSupabaseClient } from './supabase.js';
import { organizationService } from './organizationService.js';

export const notificationService = {
    init() {
        const notifications = localStorage.getItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS);
        if (!notifications) {
            const defaultNotifications = [
                {
                    id: '1',
                    type: 'low_stock',
                    title: 'Low Stock Alert',
                    message: 'iPhone 15 Pro Max is running low (3 units left)',
                    date: new Date().toISOString(),
                    read: false
                },
                {
                    id: '2',
                    type: 'new_order',
                    title: 'New Sale Completed',
                    message: 'Sale S-1002 completed for $431.92',
                    date: new Date(Date.now() - 3600000).toISOString(),
                    read: false
                }
            ];
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(defaultNotifications));
        }
    },

    async getAll() {
        const client = await getSupabaseClient();
        if (client) {
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) return [];
            const { data, error } = await client.from('notifications')
                .select('*').eq('organization_id', organizationId).order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).map(item => ({
                id: item.id,
                type: item.type,
                title: item.title,
                message: item.message,
                data: item.data,
                date: item.created_at,
                read: item.is_read
            }));
        }
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS) || '[]');
    },

    async getUnread() {
        return (await this.getAll()).filter(n => !n.read);
    },

    async create(notification) {
        const client = await getSupabaseClient();
        if (client) {
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) throw new Error('Select a store before creating notifications.');
            const { data: userData } = await client.auth.getUser();
            const { error } = await client.from('notifications').insert({
                organization_id: organizationId,
                user_id: userData?.user?.id || null,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                data: notification.data || null,
                is_read: false
            });
            if (error) throw error;
            return;
        }
        this.init();
        const notifications = await this.getAll();
        notifications.unshift({
            id: Date.now().toString(),
            ...notification,
            date: new Date().toISOString(),
            read: false
        });
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    },

    async markAsRead(id) {
        const client = await getSupabaseClient();
        if (client) {
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) return;
            const { error } = await client.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', id);
            if (error) throw error;
            return;
        }
        this.init();
        const notifications = await this.getAll();
        const notification = notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
        }
    },

    async markAllAsRead() {
        const client = await getSupabaseClient();
        if (client) {
            const { data: userData } = await client.auth.getUser();
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) return;
            const { error } = await client.from('notifications').update({ is_read: true, read_at: new Date().toISOString() })
                .eq('organization_id', organizationId)
                .eq('user_id', userData?.user?.id || '00000000-0000-0000-0000-000000000000');
            if (error) throw error;
            return;
        }
        this.init();
        const notifications = await this.getAll();
        notifications.forEach(n => n.read = true);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    },

    async delete(id) {
        const client = await getSupabaseClient();
        if (client) {
            const organizationId = organizationService.getCurrentOrganizationId();
            if (!organizationId) return;
            const { error } = await client.from('notifications').delete().eq('organization_id', organizationId).eq('id', id);
            if (error) throw error;
            return;
        }
        this.init();
        const notifications = (await this.getAll()).filter(n => n.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    },

    checkLowStock() {
        const products = JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.PRODUCTS) || '[]');
        const lowStockProducts = products.filter(p => p.stock <= p.minStock);
        
        lowStockProducts.forEach(product => {
            this.create({
                type: 'low_stock',
                title: 'Low Stock Alert',
                message: `${product.name} is running low (${product.stock} units left)`
            });
        });

        return lowStockProducts;
    }
};
