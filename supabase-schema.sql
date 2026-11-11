-- Joetech Store Manager - Enterprise Edition
-- Supabase Database Schema
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- AUTHENTICATION & USER MANAGEMENT
-- ============================================

-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'cashier',
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'cashier', 'inventory_officer', 'viewer'))
);

-- Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    user_name TEXT NOT NULL,
    user_email TEXT,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PRODUCT MANAGEMENT
-- ============================================

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#4f46e5',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Brands
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    website TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Units of measurement
CREATE TABLE IF NOT EXISTS public.units (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    abbreviation TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE,
    category_id UUID REFERENCES public.categories(id),
    brand_id UUID REFERENCES public.brands(id),
    unit_id UUID REFERENCES public.units(id),
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    max_stock INTEGER,
    weight DECIMAL(10,2),
    dimensions TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product variants
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE,
    price DECIMAL(10,2) NOT NULL,
    cost DECIMAL(10,2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    attributes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INVENTORY MANAGEMENT
-- ============================================

-- Warehouses
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT,
    manager_id UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Product inventory by warehouse
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id),
    stock INTEGER NOT NULL DEFAULT 0,
    reserved INTEGER NOT NULL DEFAULT 0,
    available INTEGER GENERATED ALWAYS AS (stock - reserved) STORED,
    last_restocked TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(product_id, warehouse_id)
);

-- Inventory movements
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'TRANSFER', 'ADJUST', 'RETURN')),
    quantity INTEGER NOT NULL,
    reason TEXT,
    reference_id UUID,
    reference_type TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CUSTOMERS
-- ============================================

-- Customer groups
CREATE TABLE IF NOT EXISTS public.customer_groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    address TEXT,
    city TEXT,
    country TEXT DEFAULT 'Ghana',
    date_of_birth DATE,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    group_id UUID REFERENCES public.customer_groups(id),
    loyalty_points INTEGER DEFAULT 0,
    total_purchases DECIMAL(12,2) DEFAULT 0,
    total_visits INTEGER DEFAULT 0,
    last_visit TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer wallets
CREATE TABLE IF NOT EXISTS public.customer_wallets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    balance DECIMAL(10,2) DEFAULT 0,
    currency TEXT DEFAULT 'GHS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id)
);

-- Wallet transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    wallet_id UUID REFERENCES public.customer_wallets(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    amount DECIMAL(10,2) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    reference_id UUID,
    reference_type TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SUPPLIERS
-- ============================================

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    address TEXT,
    contact_person TEXT,
    website TEXT,
    tax_id TEXT,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    total_orders INTEGER DEFAULT 0,
    total_purchases DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SALES
-- ============================================

-- Sales orders
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sale_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    user_id UUID REFERENCES auth.users(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    cashier_name TEXT NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'credit_card', 'mobile_transfer', 'check', 'wallet')),
    payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('pending', 'paid', 'partial', 'refunded')),
    amount_tendered DECIMAL(10,2),
    change_amount DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sale items
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    product_name TEXT NOT NULL,
    product_sku TEXT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL,
    discount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales returns
CREATE TABLE IF NOT EXISTS public.sales_returns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sale_id UUID REFERENCES public.sales(id),
    return_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    reason TEXT,
    total_refund DECIMAL(10,2) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    processed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PURCHASING
-- ============================================

-- Purchase orders
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id UUID REFERENCES public.suppliers(id),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'ordered', 'received', 'cancelled')),
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    expected_delivery DATE,
    notes TEXT,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Purchase order items
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- EXPENSES
-- ============================================

-- Expense categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#ef4444',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category_id UUID REFERENCES public.expense_categories(id),
    description TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT NOT NULL,
    reference_number TEXT,
    receipt_url TEXT,
    expense_date DATE NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- EMPLOYEES
-- ============================================

-- Employees (extends profiles for HR data)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    employee_id TEXT UNIQUE NOT NULL,
    department TEXT NOT NULL,
    position TEXT NOT NULL,
    salary DECIMAL(10,2) NOT NULL,
    hire_date DATE NOT NULL,
    termination_date DATE,
    emergency_contact TEXT,
    emergency_phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Attendance
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID REFERENCES auth.users(id),
    date DATE NOT NULL,
    check_in TIMESTAMP WITH TIME ZONE,
    check_out TIMESTAMP WITH TIME ZONE,
    break_duration INTEGER DEFAULT 0,
    total_hours DECIMAL(4,2),
    status TEXT DEFAULT 'present' CHECK (status IN ('present', 'absent', 'late', 'leave')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- ============================================
-- NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PROMOTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.promotions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    min_purchase DECIMAL(10,2) DEFAULT 0,
    max_discount DECIMAL(10,2),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coupon codes
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    promotion_id UUID REFERENCES public.promotions(id),
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    min_purchase DECIMAL(10,2) DEFAULT 0,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    used_by UUID[],
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS public.settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    type TEXT DEFAULT 'text',
    description TEXT,
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- BRANCHES (Multi-location support)
-- ============================================

CREATE TABLE IF NOT EXISTS public.branches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    phone TEXT,
    email TEXT,
    manager_id UUID REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User branches (many-to-many)
CREATE TABLE IF NOT EXISTS public.user_branches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, branch_id)
);

-- ============================================
-- REPORTS & ANALYTICS VIEWS
-- ============================================

-- Daily sales summary view
CREATE OR REPLACE VIEW public.daily_sales_summary AS
SELECT 
    DATE(created_at) as sale_date,
    COUNT(*) as total_transactions,
    SUM(subtotal) as total_subtotal,
    SUM(tax_amount) as total_tax,
    SUM(discount_amount) as total_discount,
    SUM(total) as total_revenue,
    AVG(total) as average_sale,
    COUNT(DISTINCT customer_id) as unique_customers
FROM public.sales
GROUP BY DATE(created_at)
ORDER BY sale_date DESC;

-- Product performance view
CREATE OR REPLACE VIEW public.product_performance AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.category_id,
    c.name as category_name,
    COUNT(si.id) as times_sold,
    SUM(si.quantity) as total_quantity_sold,
    SUM(si.total) as total_revenue,
    SUM(si.cost_price * si.quantity) as total_cost,
    SUM(si.total) - SUM(si.cost_price * si.quantity) as gross_profit
FROM public.products p
LEFT JOIN public.categories c ON p.category_id = c.id
LEFT JOIN public.sale_items si ON p.id = si.product_id
GROUP BY p.id, p.name, p.category_id, c.name
ORDER BY total_revenue DESC;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON public.inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = true
          AND role = ANY (allowed_roles)
    );
$$;

DROP POLICY IF EXISTS "Allow public read access to products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated users to manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Managers can manage products" ON public.products;
DROP POLICY IF EXISTS "Allow users to view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow admins to manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated users to view sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated users to create sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;
DROP POLICY IF EXISTS "Sales staff can create sales" ON public.sales;
DROP POLICY IF EXISTS "Managers can update sales" ON public.sales;
DROP POLICY IF EXISTS "Managers can delete sales" ON public.sales;
DROP POLICY IF EXISTS "Allow authenticated users to create sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated users can view sale items" ON public.sale_items;
DROP POLICY IF EXISTS "Sales staff can create sale items" ON public.sale_items;

CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Managers can manage products" ON public.products FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['admin', 'manager', 'inventory_officer']))
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'inventory_officer']));
CREATE POLICY "Allow users to view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Allow users to create their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow users to update their own profile" ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
CREATE POLICY "Allow admins to manage all profiles" ON public.profiles FOR ALL USING (
    public.is_admin()
);
CREATE POLICY "Authenticated users can view sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales staff can create sales" ON public.sales FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cashier']));
CREATE POLICY "Managers can update sales" ON public.sales FOR UPDATE TO authenticated
    USING (public.has_any_role(ARRAY['admin', 'manager']))
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager']));
CREATE POLICY "Managers can delete sales" ON public.sales FOR DELETE TO authenticated
    USING (public.has_any_role(ARRAY['admin', 'manager']));
CREATE POLICY "Authenticated users can view sale items" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales staff can create sale items" ON public.sale_items FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cashier']));

-- Default access for operational tables. Signed-in staff may read operational
-- data, while writes are restricted to managers and administrators.
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'audit_logs', 'categories', 'brands', 'units', 'inventory',
        'inventory_movements', 'customers', 'suppliers', 'expenses', 'employees',
        'notifications', 'product_variants', 'warehouses', 'customer_groups', 'customer_wallets',
        'wallet_transactions', 'sales_returns', 'purchase_orders',
        'purchase_order_items', 'expense_categories', 'attendance', 'promotions',
        'coupons', 'settings', 'branches', 'user_branches'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can access %s" ON public.%I', table_name, table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Authenticated users can view %s" ON public.%I', table_name, table_name);
        EXECUTE format('DROP POLICY IF EXISTS "Managers can manage %s" ON public.%I', table_name, table_name);
        EXECUTE format('CREATE POLICY "Authenticated users can view %s" ON public.%I FOR SELECT TO authenticated USING (true)', table_name, table_name);
        EXECUTE format('CREATE POLICY "Managers can manage %s" ON public.%I FOR ALL TO authenticated USING (public.has_any_role(ARRAY[''admin'', ''manager''])) WITH CHECK (public.has_any_role(ARRAY[''admin'', ''manager'']))', table_name, table_name);
    END LOOP;
END $$;

-- Operational role exceptions used by the inventory and checkout screens.
DROP POLICY IF EXISTS "Inventory staff can manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Inventory staff can record movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Cashiers can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Cashiers can update customers" ON public.customers;
CREATE POLICY "Inventory staff can manage inventory" ON public.inventory FOR ALL TO authenticated
    USING (public.has_any_role(ARRAY['admin', 'manager', 'inventory_officer']))
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'inventory_officer']));
CREATE POLICY "Inventory staff can record movements" ON public.inventory_movements FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'inventory_officer']));
CREATE POLICY "Cashiers can manage customers" ON public.customers FOR INSERT TO authenticated
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cashier']));
CREATE POLICY "Cashiers can update customers" ON public.customers FOR UPDATE TO authenticated
    USING (public.has_any_role(ARRAY['admin', 'manager', 'cashier']))
    WITH CHECK (public.has_any_role(ARRAY['admin', 'manager', 'cashier']));

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Create a profile automatically when a Supabase Auth user signs up. This runs
-- with controlled database privileges and also works when email confirmation is enabled.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(COALESCE(NEW.email, 'User'), '@', 1)),
        'cashier'
    )
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Update inventory on sale
CREATE OR REPLACE FUNCTION public.update_inventory_on_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.warehouse_id IS NOT NULL THEN
        UPDATE public.inventory
        SET stock = stock - NEW.quantity,
            updated_at = NOW()
        WHERE product_id = NEW.product_id
          AND warehouse_id = NEW.warehouse_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No inventory record exists for product % in warehouse %', NEW.product_id, NEW.warehouse_id;
        END IF;
    ELSE
        UPDATE public.products
        SET stock = stock - NEW.quantity,
            updated_at = NOW()
        WHERE id = NEW.product_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for sale items
DROP TRIGGER IF EXISTS trigger_update_inventory ON public.sale_items;
CREATE TRIGGER trigger_update_inventory
    AFTER INSERT ON public.sale_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_inventory_on_sale();

-- Update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- SEED DATA
-- ============================================

-- Insert default settings
INSERT INTO public.settings (key, value, type, description) VALUES
    ('store_name', 'JoeTech Store', 'text', 'Store name'),
    ('currency', 'GHS', 'text', 'Currency code'),
    ('tax_rate', '12.5', 'number', 'Tax rate percentage'),
    ('low_stock_threshold', '10', 'number', 'Low stock alert threshold'),
    ('theme', 'light', 'text', 'UI theme'),
    ('enable_2fa', 'false', 'boolean', 'Enable two-factor authentication'),
    ('enable_email_notifications', 'true', 'boolean', 'Enable email notifications'),
    ('enable_sms_notifications', 'false', 'boolean', 'Enable SMS notifications')
ON CONFLICT (key) DO NOTHING;

-- Insert default categories
INSERT INTO public.categories (name, description, color) VALUES
    ('Smartphones', 'Mobile phones and accessories', '#3b82f6'),
    ('Laptops', 'Notebooks and laptops', '#10b981'),
    ('Accessories', 'Various tech accessories', '#f59e0b'),
    ('Audio', 'Headphones, speakers, and audio devices', '#ef4444'),
    ('Wearables', 'Smart watches and fitness trackers', '#8b5cf6')
ON CONFLICT (name) DO NOTHING;

-- Insert default units
INSERT INTO public.units (name, abbreviation) VALUES
    ('Piece', 'pcs'),
    ('Box', 'box'),
    ('Dozen', 'dz'),
    ('Pair', 'pr'),
    ('Kilogram', 'kg'),
    ('Liter', 'L')
ON CONFLICT (name) DO NOTHING;

-- Insert default expense categories
INSERT INTO public.expense_categories (name, description, color) VALUES
    ('Rent', 'Monthly rent payments', '#ef4444'),
    ('Utilities', 'Electricity, water, internet', '#f59e0b'),
    ('Salaries', 'Employee salaries and wages', '#3b82f6'),
    ('Supplies', 'Office and store supplies', '#10b981'),
    ('Marketing', 'Advertising and marketing expenses', '#8b5cf6'),
    ('Maintenance', 'Equipment and facility maintenance', '#06b6d4'),
    ('Transportation', 'Delivery and transportation costs', '#f97316'),
    ('Other', 'Other miscellaneous expenses', '#6b7280')
ON CONFLICT (name) DO NOTHING;

-- Insert default customer group
INSERT INTO public.customer_groups (name, discount_percentage, description) VALUES
    ('Regular', 0, 'Default customer group'),
    ('Silver', 5, 'Silver VIP customers'),
    ('Gold', 10, 'Gold VIP customers'),
    ('Platinum', 15, 'Platinum VIP customers')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Joetech Store Manager database schema created successfully!';
    RAISE NOTICE 'You can now connect your frontend to Supabase.';
END $$;
