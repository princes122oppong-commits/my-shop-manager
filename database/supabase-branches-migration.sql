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

-- Checkout runs as an atomic, server-side stock deduction. This gives cashier
-- roles checkout access without granting them arbitrary inventory edits.
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
     WHERE id = p_sale_id;

    IF target_organization_id IS NULL OR target_branch_id IS NULL
       OR NOT public.has_organization_role(target_organization_id, ARRAY['owner', 'admin', 'manager', 'cashier'])
       OR NOT public.can_access_branch(target_organization_id, target_branch_id) THEN
        RAISE EXCEPTION 'You cannot complete this sale at the selected branch';
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
GRANT EXECUTE ON FUNCTION public.record_sale_inventory(UUID) TO authenticated;

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


