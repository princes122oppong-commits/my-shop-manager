import CONSTANTS from '../config/constants.js';

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

    getAll() {
        this.init();
        return JSON.parse(localStorage.getItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES) || '[]');
    },

    getById(id) {
        return this.getAll().find(e => e.id === id);
    },

    create(employeeData) {
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

    update(id, employeeData) {
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

    delete(id) {
        this.init();
        const employees = this.getAll().filter(e => e.id !== id);
        localStorage.setItem(CONSTANTS.STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        return true;
    }
};