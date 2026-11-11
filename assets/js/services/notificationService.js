import CONSTANTS from '../config/constants.js';

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

    getAll() {
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS) || '[]');
    },

    getUnread() {
        return this.getAll().filter(n => !n.read);
    },

    create(notification) {
        this.init();
        const notifications = this.getAll();
        notifications.unshift({
            id: Date.now().toString(),
            ...notification,
            date: new Date().toISOString(),
            read: false
        });
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    },

    markAsRead(id) {
        this.init();
        const notifications = this.getAll();
        const notification = notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
        }
    },

    markAllAsRead() {
        this.init();
        const notifications = this.getAll();
        notifications.forEach(n => n.read = true);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    },

    delete(id) {
        this.init();
        const notifications = this.getAll().filter(n => n.id !== id);
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