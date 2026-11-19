-- JoeTech Store Manager - multi-branch migration
-- Run after supabase-saas-migration.sql. This adds real branch-scoped stock,
-- sales, purchasing, staff, attendance and expense data with RLS enforcement.

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_branches ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Catalog identifiers are unique within one organization, not globally across
-- unrelated stores that happen to use the same SKU or category names.
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_name_key;
ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_name_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_barcode_key;
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_number_key;
ALTER TABLE public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_return_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_org_name ON public.categories(organization_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_org_name ON public.brands(organization_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_units_org_name ON public.units(organization_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_sku ON public.products(organization_id, sku);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_org_barcode ON public.products(organization_id, barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_org_sale_number ON public.sales(organization_id, sale_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_org_return_number ON public.sales_returns(organization_id, return_number);

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'warehouses', 'inventory', 'inventory_movements', 'sales', 'sale_items',
        'sales_returns', 'purchase_orders', 'purchase_order_items', 'expenses', 'employees', 'attendance'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL', table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(branch_id)', 'idx_' || table_name || '_branch', table_name);
    END LOOP;
END $$;

-- Every existing organization starts with a Main Store. Existing members get
-- assigned there, preserving their access while new branches can be isolated.
INSERT INTO public.branches (organization_id, name, is_active)
SELECT org.id, 'Main Store', true
FROM public.organizations org
WHERE NOT EXISTS (SELECT 1 FROM public.branches branch WHERE branch.organization_id = org.id);

INSERT INTO public.user_branches (organization_id, user_id, branch_id, is_primary)
SELECT member.organization_id, member.user_id, branch.id, true
FROM public.organization_members member
JOIN public.branches branch ON branch.organization_id = member.organization_id
WHERE member.is_active = true
  AND NOT EXISTS (
      SELECT 1 FROM public.user_branches assigned
      WHERE assigned.organization_id = member.organization_id
        AND assigned.user_id = member.user_id
        AND assigned.branch_id = branch.id
  );

-- Backfill existing location-based records into each organization's Main Store.
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'warehouses', 'inventory', 'inventory_movements', 'sales', 'sale_items',
        'sales_returns', 'purchase_orders', 'purchase_order_items', 'expenses', 'employees', 'attendance'
    ] LOOP
        EXECUTE format(
            'UPDATE public.%I record SET branch_id = branch.id FROM public.branches branch WHERE record.organization_id = branch.organization_id AND branch.name = ''Main Store'' AND record.branch_id IS NULL',
            table_name
        );
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.can_access_branch(target_organization_id UUID, target_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT target_branch_id IS NOT NULL
       AND public.is_organization_member(target_organization_id)
       AND EXISTS (
           SELECT 1 FROM public.branches branch
            WHERE branch.id = target_branch_id
              AND branch.organization_id = target_organization_id
              AND branch.is_active = true
       )
       AND (
           public.is_organization_admin(target_organization_id)
           OR public.has_organization_role(target_organization_id, ARRAY['manager'])
           OR EXISTS (
               SELECT 1 FROM public.user_branches assignment
               WHERE assignment.organization_id = target_organization_id
                 AND assignment.branch_id = target_branch_id
                 AND assignment.user_id = auth.uid()
           )
       );
$$;

CREATE OR REPLACE FUNCTION public.can_view_organization_staff_profile(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.organization_members manager
          JOIN public.organization_members staff USING (organization_id)
         WHERE manager.user_id = auth.uid()
           AND manager.is_active = true
           AND manager.role IN ('owner', 'admin', 'manager')
           AND staff.user_id = target_user_id
           AND staff.is_active = true
    );
$$;

DROP POLICY IF EXISTS "Organization managers can view staff profiles" ON public.profiles;
CREATE POLICY "Organization managers can view staff profiles" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.can_view_organization_staff_profile(id));

-- Catalog entries stay shared by the organization; physical stock is held per
-- branch so changing outlets cannot display or sell another branch's stock.
CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (branch_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_org ON public.branch_inventory(organization_id);
CREATE INDEX IF NOT EXISTS idx_branch_inventory_branch ON public.branch_inventory(branch_id);

INSERT INTO public.branch_inventory (organization_id, branch_id, product_id, stock)
SELECT product.organization_id, branch.id, product.id, GREATEST(product.stock, 0)
FROM public.products product
JOIN public.branches branch ON branch.organization_id = product.organization_id AND branch.name = 'Main Store'
ON CONFLICT (branch_id, product_id) DO NOTHING;

ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assigned branch members can view stock" ON public.branch_inventory;
DROP POLICY IF EXISTS "Inventory roles can manage branch stock" ON public.branch_inventory;
CREATE POLICY "Assigned branch members can view stock" ON public.branch_inventory
    FOR SELECT TO authenticated USING (public.can_access_branch(organization_id, branch_id));
CREATE POLICY "Inventory roles can manage branch stock" ON public.branch_inventory
    FOR ALL TO authenticated
    USING (public.has_organization_role(organization_id, ARRAY['owner', 'admin', 'manager', 'inventory_officer']) AND public.can_access_branch(organization_id, branch_id))
    WITH CHECK (public.has_organization_role(organization_id, ARRAY['owner', 'admin', 'manager', 'inventory_officer']) AND public.can_access_branch(organization_id, branch_id));

-- Legacy stock-only checkout helper. New clients use
-- create_sale_with_inventory below; this helper is revoked from browser roles.
CREATE OR REPLACE FUNCTION public.record_sale_inventory(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_organization_id UUID;
    target_branch_id UUID;
    sale_item RECORD;
    affected_rows INTEGER;
BEGIN
    SELECT organization_id, branch_id
      INTO target_organization_id, target_branch_id
      FROM public.sales
     WHERE id = p_sale_id
     FOR UPDATE;

    IF NOT FOUND OR target_organization_id IS NULL OR target_branch_id IS NULL
       OR NOT public.has_organization_role(target_organization_id, ARRAY['owner', 'admin', 'manager', 'cashier'])
       OR NOT public.can_access_branch(target_organization_id, target_branch_id) THEN
        RAISE EXCEPTION 'You cannot complete this sale at the selected branch';
    END IF;

    -- The sale row lock serializes retries. A completed sale already has its
    -- ledger movements, so a duplicate RPC call must not deduct stock again.
    IF EXISTS (
        SELECT 1 FROM public.inventory_movements
         WHERE organization_id = target_organization_id
           AND reference_id = p_sale_id
           AND reference_type = 'sale'
    ) THEN
        RETURN;
    END IF;

    FOR sale_item IN
        SELECT product_id, product_name, quantity
          FROM public.sale_items
         WHERE sale_id = p_sale_id
    LOOP
        UPDATE public.branch_inventory
           SET stock = stock - sale_item.quantity, updated_at = NOW()
         WHERE organization_id = target_organization_id
           AND branch_id = target_branch_id
           AND product_id = sale_item.product_id
           AND stock >= sale_item.quantity;
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        IF affected_rows <> 1 THEN
            RAISE EXCEPTION 'Insufficient branch stock for %', sale_item.product_name;
        END IF;

        INSERT INTO public.inventory_movements (
            organization_id, branch_id, product_id, type, quantity,
            reason, reference_id, reference_type, user_id
        ) VALUES (
            target_organization_id, target_branch_id, sale_item.product_id,
            'OUT', sale_item.quantity, 'Sale ' || p_sale_id::TEXT,
            p_sale_id, 'sale', auth.uid()
        );
    END LOOP;
END;
$$;

-- Create a sale, its line items, stock deductions, and ledger movements in a
-- single transaction. A stable caller-generated ID makes network retries safe.
CREATE OR REPLACE FUNCTION public.create_sale_with_inventory(
    p_sale_id UUID,
    p_sale_number TEXT,
    p_organization_id UUID,
    p_branch_id UUID,
    p_customer_name TEXT,
    p_cashier_name TEXT,
    p_tax_rate NUMERIC,
    p_payment_method TEXT,
    p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_org UUID;
    v_existing_branch UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_product_name TEXT;
    v_product_sku TEXT;
    v_unit_price NUMERIC;
    v_cost_price NUMERIC;
    v_subtotal NUMERIC := 0;
    v_tax NUMERIC;
    v_total NUMERIC;
    v_rows INTEGER;
BEGIN
    IF p_sale_id IS NULL OR NULLIF(BTRIM(p_sale_number), '') IS NULL
       OR p_tax_rate IS NULL OR p_tax_rate < 0 OR p_tax_rate > 1
       OR p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
       OR p_payment_method IS NULL
       OR p_payment_method NOT IN ('cash', 'credit_card', 'mobile_transfer', 'check', 'wallet') THEN
        RAISE EXCEPTION 'Sale details are invalid';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'A sale needs at least one item';
    END IF;

    IF NOT public.has_organization_role(p_organization_id, ARRAY['owner', 'admin', 'manager', 'cashier'])
       OR NOT public.can_access_branch(p_organization_id, p_branch_id) THEN
        RAISE EXCEPTION 'You cannot complete a sale at the selected branch';
    END IF;

    SELECT organization_id, branch_id INTO v_existing_org, v_existing_branch
      FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF FOUND THEN
        IF v_existing_org <> p_organization_id OR v_existing_branch <> p_branch_id THEN
            RAISE EXCEPTION 'Sale identifier is already used by another store or branch';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.inventory_movements
             WHERE organization_id = p_organization_id
               AND reference_id = p_sale_id AND reference_type = 'sale'
        ) THEN
            RETURN p_sale_id;
        END IF;
        RAISE EXCEPTION 'This sale exists but has no completed inventory ledger';
    END IF;

    -- Derive prices from the catalog and lock those rows until checkout ends.
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS rows(value) LOOP
        IF jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'Sale items must be objects';
        END IF;
        v_product_id := NULLIF(v_item ->> 'productId', '')::UUID;
        v_quantity := NULLIF(v_item ->> 'quantity', '')::INTEGER;
        IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Each sale item needs a product and a positive whole quantity';
        END IF;
        SELECT product.price INTO v_unit_price
          FROM public.products AS product
         WHERE product.id = v_product_id
           AND product.organization_id = p_organization_id
           AND product.is_active = true
         FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A selected product is unavailable in this store';
        END IF;
        v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    END LOOP;

    v_tax := ROUND(v_subtotal * p_tax_rate, 2);
    v_total := v_subtotal + v_tax;
    INSERT INTO public.sales (
        id, organization_id, branch_id, sale_number, customer_name, user_id,
        cashier_name, subtotal, tax_amount, total, payment_method, payment_status
    ) VALUES (
        p_sale_id, p_organization_id, p_branch_id, BTRIM(p_sale_number),
        COALESCE(NULLIF(BTRIM(p_customer_name), ''), 'Walk-in Customer'), auth.uid(),
        COALESCE(NULLIF(BTRIM(p_cashier_name), ''), 'Cashier'), v_subtotal,
        v_tax, v_total, p_payment_method, 'paid'
    );

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS rows(value) LOOP
        v_product_id := NULLIF(v_item ->> 'productId', '')::UUID;
        v_quantity := NULLIF(v_item ->> 'quantity', '')::INTEGER;
        SELECT product.name, product.sku, product.price, product.cost
          INTO v_product_name, v_product_sku, v_unit_price, v_cost_price
          FROM public.products AS product
         WHERE product.id = v_product_id
           AND product.organization_id = p_organization_id
           AND product.is_active = true;

        UPDATE public.branch_inventory AS stock
           SET stock = stock.stock - v_quantity, updated_at = NOW()
         WHERE stock.organization_id = p_organization_id
           AND stock.branch_id = p_branch_id
           AND stock.product_id = v_product_id
           AND stock.stock >= v_quantity;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows <> 1 THEN
            RAISE EXCEPTION 'Insufficient branch stock for %', v_product_name;
        END IF;

        INSERT INTO public.sale_items (
            organization_id, branch_id, sale_id, product_id, product_name,
            product_sku, quantity, unit_price, cost_price, total
        ) VALUES (
            p_organization_id, p_branch_id, p_sale_id, v_product_id, v_product_name,
            v_product_sku, v_quantity, v_unit_price, v_cost_price, v_unit_price * v_quantity
        );
        INSERT INTO public.inventory_movements (
            organization_id, branch_id, product_id, type, quantity,
            reason, reference_id, reference_type, user_id
        ) VALUES (
            p_organization_id, p_branch_id, v_product_id, 'OUT', v_quantity,
            'Sale ' || p_sale_id::TEXT, p_sale_id, 'sale', auth.uid()
        );
    END LOOP;

    RETURN p_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_with_inventory(UUID, TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sale_with_inventory(UUID, TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale_with_inventory(UUID, TEXT, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO authenticated;

-- Hosted checkout must go through the transaction above, not separate REST writes.
DROP POLICY IF EXISTS "Sales staff can manage sales" ON public.sales;
DROP POLICY IF EXISTS "Sales staff can manage sale_items" ON public.sale_items;
-- Stock adjustments update the branch balance and its movement ledger in one
-- transaction, so neither write can succeed on its own.
CREATE OR REPLACE FUNCTION public.adjust_branch_inventory(
    p_organization_id UUID,
    p_branch_id UUID,
    p_product_id UUID,
    p_type TEXT,
    p_quantity INTEGER,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    movement_id UUID;
    affected_rows INTEGER;
BEGIN
    IF p_type NOT IN ('IN', 'OUT') OR p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Stock adjustment type must be IN or OUT and quantity must be positive';
    END IF;

    IF NOT public.has_organization_role(p_organization_id, ARRAY['owner', 'admin', 'manager', 'inventory_officer'])
       OR NOT public.can_access_branch(p_organization_id, p_branch_id)
       OR NOT EXISTS (
           SELECT 1 FROM public.products product
            WHERE product.id = p_product_id
              AND product.organization_id = p_organization_id
              AND product.is_active = true
       ) THEN
        RAISE EXCEPTION 'You cannot adjust inventory for this product at the selected branch';
    END IF;

    IF p_type = 'IN' THEN
        INSERT INTO public.branch_inventory (organization_id, branch_id, product_id, stock, updated_at)
        VALUES (p_organization_id, p_branch_id, p_product_id, p_quantity, NOW())
        ON CONFLICT (branch_id, product_id)
        DO UPDATE SET stock = public.branch_inventory.stock + EXCLUDED.stock, updated_at = NOW();
    ELSE
        UPDATE public.branch_inventory
           SET stock = stock - p_quantity, updated_at = NOW()
         WHERE organization_id = p_organization_id
           AND branch_id = p_branch_id
           AND product_id = p_product_id
           AND stock >= p_quantity;
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        IF affected_rows <> 1 THEN
            RAISE EXCEPTION 'Insufficient branch stock';
        END IF;
    END IF;

    INSERT INTO public.inventory_movements (
        organization_id, branch_id, product_id, type, quantity, reason, user_id
    ) VALUES (
        p_organization_id, p_branch_id, p_product_id, p_type, p_quantity,
        NULLIF(BTRIM(p_reason), ''), auth.uid()
    ) RETURNING id INTO movement_id;

    RETURN movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_branch_inventory(UUID, UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_branch_inventory(UUID, UUID, UUID, TEXT, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_branch_inventory(UUID, UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_sale_inventory(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_sale_inventory(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.record_sale_inventory(UUID) FROM authenticated;

-- Branch records are visible to admins/managers and to staff assigned there.
DROP POLICY IF EXISTS "Branch access is limited to assigned locations" ON public.branches;
CREATE POLICY "Branch access is limited to assigned locations" ON public.branches
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (public.can_access_branch(organization_id, id));

-- Preserve the existing role-based write policies and add a restrictive
-- location check so a client cannot switch branch_id to another outlet.
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'warehouses', 'inventory', 'inventory_movements', 'sales', 'sale_items',
        'sales_returns', 'purchase_orders', 'purchase_order_items', 'expenses', 'attendance'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Branch access is limited on %s" ON public.%I', table_name, table_name);
        EXECUTE format(
            'CREATE POLICY "Branch access is limited on %s" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.can_access_branch(organization_id, branch_id)) WITH CHECK (public.can_access_branch(organization_id, branch_id))',
            table_name, table_name
        );
    END LOOP;
END $$;

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;

-- Employee HR details belong to a membership in one organization. Auth user
-- profiles remain global, while department, salary, and employee number can
-- vary between organizations using the same login.
CREATE TABLE IF NOT EXISTS public.organization_employee_details (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    employee_id TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'General',
    position TEXT NOT NULL DEFAULT 'cashier',
    salary NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (salary >= 0),
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    termination_date DATE,
    emergency_contact TEXT,
    emergency_phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, user_id),
    UNIQUE (organization_id, employee_id),
    FOREIGN KEY (organization_id, user_id)
        REFERENCES public.organization_members(organization_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_employee_details_branch
    ON public.organization_employee_details(organization_id, branch_id);

-- Copy legacy details only when the user belongs to exactly one active
-- organization. Ambiguous cross-store salary/department data needs review.
INSERT INTO public.organization_employee_details (
    organization_id, user_id, branch_id, employee_id, department, position,
    salary, hire_date, termination_date, emergency_contact, emergency_phone,
    address, created_at, updated_at
)
SELECT member.organization_id, employee.id,
       CASE WHEN EXISTS (
           SELECT 1 FROM public.branches branch
            WHERE branch.id = employee.branch_id
              AND branch.organization_id = member.organization_id
       ) THEN employee.branch_id ELSE assignment.branch_id END,
       employee.employee_id, employee.department, employee.position,
       employee.salary, employee.hire_date, employee.termination_date,
       employee.emergency_contact, employee.emergency_phone, employee.address,
       employee.created_at, employee.updated_at
  FROM public.employees employee
  JOIN public.organization_members member
    ON member.user_id = employee.id AND member.is_active = true
  LEFT JOIN LATERAL (
      SELECT user_branch.branch_id
        FROM public.user_branches user_branch
       WHERE user_branch.organization_id = member.organization_id
         AND user_branch.user_id = member.user_id
       ORDER BY user_branch.is_primary DESC, user_branch.created_at
       LIMIT 1
  ) assignment ON true
 WHERE (
       SELECT count(*) FROM public.organization_members membership_count
        WHERE membership_count.user_id = employee.id AND membership_count.is_active = true
  ) = 1
ON CONFLICT (organization_id, user_id) DO NOTHING;

ALTER TABLE public.organization_employee_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Organization members can view employee details" ON public.organization_employee_details;
DROP POLICY IF EXISTS "Managers can manage employee details" ON public.organization_employee_details;
CREATE POLICY "Organization members can view employee details" ON public.organization_employee_details
    FOR SELECT TO authenticated
    USING (
        (
            public.has_organization_role(organization_id, ARRAY['owner', 'admin', 'manager'])
            OR user_id = auth.uid()
        )
        AND (branch_id IS NULL OR public.can_access_branch(organization_id, branch_id))
    );
CREATE POLICY "Managers can manage employee details" ON public.organization_employee_details
    FOR ALL TO authenticated
    USING (
        public.has_organization_role(organization_id, ARRAY['owner', 'admin', 'manager'])
        AND (branch_id IS NULL OR public.can_access_branch(organization_id, branch_id))
    )
    WITH CHECK (
        public.has_organization_role(organization_id, ARRAY['owner', 'admin', 'manager'])
        AND (branch_id IS NULL OR public.can_access_branch(organization_id, branch_id))
    );

NOTIFY pgrst, 'reload schema';


