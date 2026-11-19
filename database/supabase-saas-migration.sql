-- JoeTech Store Manager - SaaS tenancy migration
-- Run after supabase-schema.sql and before enabling customer onboarding.

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'starter', 'professional', 'enterprise')),
    subscription_status TEXT NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled')),
    trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'admin', 'manager', 'cashier', 'inventory_officer', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org ON public.organization_members(organization_id);

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

DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
CREATE POLICY "Allow users to update their own profile" ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'audit_logs', 'categories', 'brands', 'units', 'products', 'product_variants',
        'warehouses', 'inventory', 'inventory_movements', 'customer_groups', 'customers',
        'customer_wallets', 'wallet_transactions', 'suppliers', 'sales', 'sale_items',
        'sales_returns', 'purchase_orders', 'purchase_order_items', 'expense_categories',
        'expenses', 'employees', 'attendance', 'notifications', 'promotions', 'coupons',
        'settings', 'branches', 'user_branches'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE', table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)', 'idx_' || table_name || '_organization', table_name);
    END LOOP;
END $$;

-- organization_id remains nullable until legacy rows have been explicitly
-- mapped to their owner. Report unmapped data during migration instead of
-- silently assigning it to the first organization a user happens to join.
DO $$
DECLARE
    table_name TEXT;
    orphan_count BIGINT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'audit_logs', 'categories', 'brands', 'units', 'products', 'product_variants',
        'warehouses', 'inventory', 'inventory_movements', 'customer_groups', 'customers',
        'customer_wallets', 'wallet_transactions', 'suppliers', 'sales', 'sale_items',
        'sales_returns', 'purchase_orders', 'purchase_order_items', 'expense_categories',
        'expenses', 'employees', 'attendance', 'notifications', 'promotions', 'coupons',
        'settings', 'branches', 'user_branches'
    ] LOOP
        EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', table_name)
            INTO orphan_count;
        IF orphan_count > 0 THEN
            RAISE NOTICE 'Tenant migration: % rows in public.% still need an explicit organization mapping', orphan_count, table_name;
        END IF;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_organization_member(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = target_organization_id
          AND user_id = auth.uid()
          AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_organization_admin(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = target_organization_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role IN ('owner', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.has_organization_role(target_organization_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE organization_id = target_organization_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role = ANY(allowed_roles)
    );
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.uid() = OLD.id
       AND NEW.role IS DISTINCT FROM OLD.role
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Only an administrator can change a profile role';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trigger_prevent_profile_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_role_escalation();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Organization admins can update organizations" ON public.organizations;
CREATE POLICY "Members can view organizations" ON public.organizations FOR SELECT TO authenticated
    USING (public.is_organization_member(id) OR owner_id = auth.uid());
CREATE POLICY "Users can create organizations" ON public.organizations FOR INSERT TO authenticated
    WITH CHECK (
        owner_id = auth.uid()
        AND plan = 'trial'
        AND subscription_status = 'trialing'
        AND trial_ends_at > NOW()
        AND trial_ends_at <= NOW() + INTERVAL '14 days'
    );
CREATE POLICY "Organization admins can update organizations" ON public.organizations FOR UPDATE TO authenticated
    USING (public.is_organization_admin(id))
    WITH CHECK (public.is_organization_admin(id));

DROP POLICY IF EXISTS "Members can view memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Users can join organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Organization admins can manage memberships" ON public.organization_members;
CREATE POLICY "Members can view memberships" ON public.organization_members FOR SELECT TO authenticated
    USING (public.is_organization_member(organization_id));
CREATE POLICY "Users can join organizations" ON public.organization_members FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND (
            public.is_organization_member(organization_id)
            OR EXISTS (
                SELECT 1 FROM public.organizations
                WHERE id = organization_id AND owner_id = auth.uid()
            )
        )
    );
CREATE POLICY "Organization admins can manage memberships" ON public.organization_members FOR ALL TO authenticated
    USING (public.is_organization_admin(organization_id))
    WITH CHECK (public.is_organization_admin(organization_id));

CREATE OR REPLACE FUNCTION public.protect_organization_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'owner' AND NOT EXISTS (
            SELECT 1 FROM public.organizations organization
             WHERE organization.id = NEW.organization_id
               AND organization.owner_id = NEW.user_id
               AND NEW.user_id = auth.uid()
        ) THEN
            RAISE EXCEPTION 'Only the authenticated organization owner can create the initial owner membership';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.role = 'owner' THEN
            RAISE EXCEPTION 'The organization owner membership cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.role = 'owner' AND OLD.role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Only trusted ownership operations can assign the owner role';
    END IF;
    IF OLD.role = 'owner' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
        RAISE EXCEPTION 'The organization owner membership cannot be changed or deactivated';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_protect_organization_owner_membership ON public.organization_members;
CREATE TRIGGER trigger_protect_organization_owner_membership
    BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.protect_organization_owner_membership();

-- Subscription and ownership fields are controlled by trusted server-side
-- billing operations. Browser clients can create only the standard trial.
CREATE OR REPLACE FUNCTION public.protect_organization_billing_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.owner_id IS DISTINCT FROM auth.uid()
           OR NEW.plan IS DISTINCT FROM 'trial'
           OR NEW.subscription_status IS DISTINCT FROM 'trialing'
           OR NEW.trial_ends_at IS NULL
           OR NEW.trial_ends_at <= NOW()
           OR NEW.trial_ends_at > NOW() + INTERVAL '14 days' THEN
            RAISE EXCEPTION 'Organizations must be created with the standard trial';
        END IF;
    ELSIF NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
        RAISE EXCEPTION 'Only trusted billing operations can change organization ownership or subscription fields';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_protect_organization_billing_fields ON public.organizations;
CREATE TRIGGER trigger_protect_organization_billing_fields
    BEFORE INSERT OR UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.protect_organization_billing_fields();

-- Replace broad policies with organization-scoped access and role-aware writes.
DO $$
DECLARE
    table_name TEXT;
    policy_record RECORD;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'audit_logs', 'categories', 'brands', 'units', 'products', 'product_variants',
        'warehouses', 'inventory', 'inventory_movements', 'customer_groups', 'customers',
        'customer_wallets', 'wallet_transactions', 'suppliers', 'sales', 'sale_items',
        'sales_returns', 'purchase_orders', 'purchase_order_items', 'expense_categories',
        'expenses', 'employees', 'attendance', 'notifications', 'promotions', 'coupons',
        'settings', 'branches', 'user_branches'
    ] LOOP
        FOR policy_record IN
            SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = table_name
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, table_name);
        END LOOP;

        EXECUTE format('CREATE POLICY "Tenant members can view %s" ON public.%I FOR SELECT TO authenticated USING (public.is_organization_member(organization_id))', table_name, table_name);
    END LOOP;
END $$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'audit_logs', 'categories', 'brands', 'units', 'product_variants',
        'warehouses', 'customer_groups', 'suppliers', 'sales_returns',
        'purchase_orders', 'purchase_order_items', 'expense_categories',
        'expenses', 'employees', 'attendance', 'promotions', 'coupons',
        'settings', 'branches', 'user_branches'
    ] LOOP
        EXECUTE format('CREATE POLICY "Managers can manage %s" ON public.%I FOR ALL TO authenticated USING (public.has_organization_role(organization_id, ARRAY[''owner'', ''admin'', ''manager''])) WITH CHECK (public.has_organization_role(organization_id, ARRAY[''owner'', ''admin'', ''manager'']))', table_name, table_name);
    END LOOP;
END $$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['products', 'inventory', 'inventory_movements'] LOOP
        EXECUTE format('CREATE POLICY "Inventory officers can manage %s" ON public.%I FOR ALL TO authenticated USING (public.has_organization_role(organization_id, ARRAY[''owner'', ''admin'', ''manager'', ''inventory_officer''])) WITH CHECK (public.has_organization_role(organization_id, ARRAY[''owner'', ''admin'', ''manager'', ''inventory_officer'']))', table_name, table_name);
    END LOOP;
END $$;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['customers', 'customer_wallets', 'wallet_transactions', 'sales', 'sale_items', 'notifications'] LOOP
        EXECUTE format('CREATE POLICY "Sales staff can manage %s" ON public.%I FOR ALL TO authenticated USING (public.has_organization_role(organization_id, ARRAY[''owner'', ''admin'', ''manager'', ''cashier''])) WITH CHECK (public.has_organization_role(organization_id, ARRAY[''owner'', ''admin'', ''manager'', ''cashier'']))', table_name, table_name);
    END LOOP;
END $$;

-- Audit events are append-only for browser users. The RPC records the
-- authenticated actor and verifies organization membership server-side.
DROP POLICY IF EXISTS "Managers can manage audit_logs" ON public.audit_logs;
CREATE OR REPLACE FUNCTION public.record_audit_event(
    p_organization_id UUID,
    p_action TEXT,
    p_details TEXT,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    event_id UUID;
    actor_name TEXT;
    actor_email TEXT;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_organization_member(p_organization_id) THEN
        RAISE EXCEPTION 'You cannot record audit events for this store';
    END IF;
    IF NULLIF(BTRIM(p_action), '') IS NULL OR NULLIF(BTRIM(p_details), '') IS NULL THEN
        RAISE EXCEPTION 'Audit event action and details are required';
    END IF;

    actor_email := auth.jwt() ->> 'email';
    SELECT NULLIF(BTRIM(full_name), '') INTO actor_name FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.audit_logs (
        organization_id, user_id, user_name, user_email, action, details, metadata
    ) VALUES (
        p_organization_id, auth.uid(), COALESCE(actor_name, actor_email, 'User'), actor_email,
        LEFT(BTRIM(p_action), 120), LEFT(BTRIM(p_details), 2000), p_metadata
    ) RETURNING id INTO event_id;
    RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_audit_event(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_audit_event(UUID, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_audit_event(UUID, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_organization_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON public.organizations;
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.update_organization_updated_at();

-- Enforce plan limits in the database as well as in the browser. Locking the
-- organization row serializes quota checks, so concurrent requests cannot
-- create more than the allowed number of products, staff, or monthly sales.
CREATE OR REPLACE FUNCTION public.enforce_organization_plan_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    target_organization_id UUID;
    organization_plan TEXT;
    current_status TEXT;
    trial_end TIMESTAMPTZ;
    plan_limit BIGINT;
    current_usage BIGINT;
    month_start TIMESTAMPTZ;
BEGIN
    target_organization_id := NEW.organization_id;
    IF target_organization_id IS NULL THEN
        RAISE EXCEPTION 'A store organization is required for this record'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT plan, subscription_status, trial_ends_at
      INTO organization_plan, current_status, trial_end
      FROM public.organizations
     WHERE id = target_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected store does not exist'
            USING ERRCODE = 'P0001';
    END IF;

    IF current_status <> 'active'
       AND NOT (current_status = 'trialing' AND trial_end > NOW()) THEN
        RAISE EXCEPTION 'This store subscription is not active. Update the subscription to continue.'
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_TABLE_NAME = 'sales' THEN
        IF TG_OP = 'UPDATE' AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'The recorded sale date cannot be changed'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF organization_plan = 'enterprise' THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'products' THEN
        plan_limit := CASE organization_plan
            WHEN 'trial' THEN 100
            WHEN 'starter' THEN 500
            WHEN 'professional' THEN 5000
            ELSE 0
        END;
        SELECT count(*) INTO current_usage
          FROM public.products
         WHERE organization_id = target_organization_id
           AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

    ELSIF TG_TABLE_NAME = 'sales' THEN
        plan_limit := CASE organization_plan
            WHEN 'trial' THEN 100
            WHEN 'starter' THEN 1000
            WHEN 'professional' THEN 10000
            ELSE 0
        END;
        month_start := date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
        SELECT count(*) INTO current_usage
          FROM public.sales
         WHERE organization_id = target_organization_id
           AND created_at >= month_start
           AND (TG_OP <> 'UPDATE' OR id <> NEW.id);

    ELSIF TG_TABLE_NAME = 'organization_members' THEN
        IF NOT NEW.is_active THEN
            RETURN NEW;
        END IF;
        plan_limit := CASE organization_plan
            WHEN 'trial' THEN 2
            WHEN 'starter' THEN 3
            WHEN 'professional' THEN 15
            ELSE 0
        END;
        SELECT count(*) INTO current_usage
          FROM public.organization_members
         WHERE organization_id = target_organization_id
           AND is_active = true
           AND (TG_OP <> 'UPDATE' OR id <> NEW.id);
    ELSE
        RETURN NEW;
    END IF;

    IF current_usage >= plan_limit THEN
        RAISE EXCEPTION 'The % plan limit has been reached for this store', organization_plan
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_organization_plan_limits() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_organization_plan_limits() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_organization_plan_limits() FROM authenticated;

DROP TRIGGER IF EXISTS enforce_product_plan_limit ON public.products;
CREATE TRIGGER enforce_product_plan_limit
    BEFORE INSERT OR UPDATE OF organization_id ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_plan_limits();

DROP TRIGGER IF EXISTS enforce_sales_plan_limit ON public.sales;
CREATE TRIGGER enforce_sales_plan_limit
    BEFORE INSERT OR UPDATE OF organization_id, created_at ON public.sales
    FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_plan_limits();

DROP TRIGGER IF EXISTS enforce_organization_member_plan_limit ON public.organization_members;
CREATE TRIGGER enforce_organization_member_plan_limit
    BEFORE INSERT OR UPDATE OF is_active, organization_id ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_plan_limits();

NOTIFY pgrst, 'reload schema';
