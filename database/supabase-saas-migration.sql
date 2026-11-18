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
    USING (public.is_organization_member(id));
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
