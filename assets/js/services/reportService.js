import CONSTANTS from '../config/constants.js';
import { formatCurrency } from '../utils/currency.js';
import { productService } from './productService.js';
import { salesService } from './salesService.js';
import { expenseService } from './expenseService.js';

export const reportService = {
    async getDashboardStats() {
        const [sales, products] = await Promise.all([salesService.getAll(), productService.getAll()]);

        const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
        const totalSalesCount = sales.length;
        const totalProducts = products.length;
        const lowStockCount = products.filter(p => p.stock <= p.minStock).length;

        // Calculate top products
        const productSales = {};
        sales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
                }
                productSales[item.productId].quantity += item.quantity;
                productSales[item.productId].revenue += item.price * item.quantity;
            });
        });

        const topProducts = Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        return {
            totalRevenue,
            totalSalesCount,
            totalProducts,
            lowStockCount,
            topProducts
        };
    },

    async getSalesReport(startDate, endDate) {
        const sales = await salesService.getAll();
        if (!startDate || !endDate) return sales;
        return sales.filter(sale => {
            const date = new Date(sale.date);
            return date >= new Date(startDate) && date <= new Date(`${endDate}T23:59:59`);
        });
    },

    async getTopProducts(limit = 10) {
        const sales = await salesService.getAll();
        const productSales = {};
        
        sales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productSales[item.productId]) {
                    productSales[item.productId] = { name: item.name, quantity: 0, revenue: 0 };
                }
                productSales[item.productId].quantity += item.quantity;
                productSales[item.productId].revenue += item.price * item.quantity;
            });
        });

        return Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);
    },

    async getSalesByDateRange(startDate, endDate) {
        const sales = await salesService.getAll();
        return sales.filter(sale => {
            const date = new Date(sale.date);
            return date >= new Date(startDate) && date <= new Date(endDate);
        });
    },

    async getProfitLoss() {
        const [sales, expenses, products] = await Promise.all([
            salesService.getAll(),
            expenseService.getAll(),
            productService.getAll()
        ]);
        
        const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
        const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        
        // Calculate COGS (Cost of Goods Sold)
        let totalCost = 0;
        sales.forEach(sale => {
            sale.items.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                const hasCostSnapshot = item.cost !== undefined && item.cost !== null && Number.isFinite(Number(item.cost));
                const unitCost = hasCostSnapshot
                    ? Number(item.cost)
                    : Number(product?.cost || 0);
                totalCost += unitCost * Number(item.quantity || 0);
            });
        });

        const grossProfit = totalRevenue - totalCost;
        const netProfit = grossProfit - totalExpenses;

        return {
            totalRevenue,
            totalCost,
            grossProfit,
            totalExpenses,
            netProfit
        };
    },

    async getInventoryValue() {
        const products = await productService.getAll();
        const totalValue = products.reduce((sum, p) => sum + (p.cost * p.stock), 0);
        const totalRetailValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
        return {
            costValue: totalValue,
            retailValue: totalRetailValue
        };
    },

    async getLowStockProducts() {
        const products = await productService.getAll();
        return products.filter(p => p.stock <= p.minStock);
    },

    async getDailySales(date) {
        const sales = await salesService.getAll();
        const targetDate = new Date(date).toDateString();
        return sales.filter(sale => new Date(sale.date).toDateString() === targetDate);
    },

    async getExpenseReport(startDate, endDate) {
        const expenses = await expenseService.getAll();
        if (!startDate || !endDate) return expenses;
        return expenses.filter(e => {
            const date = new Date(e.date);
            return date >= new Date(startDate) && date <= new Date(endDate);
        });
    }
};
