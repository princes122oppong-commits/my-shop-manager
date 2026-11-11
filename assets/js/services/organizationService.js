import { getSupabaseClient } from './supabase.js';

function slugify(value) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export const organizationService = {
    async getMyOrganizations() {
        const client = await getSupabaseClient();
        if (!client) return { available: false, organizations: [] };

        const { data: userData } = await client.auth.getUser();
        if (!userData?.user) return { available: true, organizations: [] };

        const { data, error } = await client
            .from('organization_members')
            .select('organization_id, role, organizations(id, name, slug, plan, subscription_status)')
            .eq('user_id', userData.user.id)
            .eq('is_active', true);

        if (error) {
            // The tenancy migration may not have been installed yet.
            if (error.code === '42P01' || error.code === 'PGRST205') return { available: false, organizations: [] };
            throw error;
        }

        return {
            available: true,
            organizations: (data || []).map(item => ({ ...item.organizations, role: item.role }))
        };
    },

    async createOrganization(name) {
        const client = await getSupabaseClient();
        if (!client) throw new Error('Supabase is not configured.');
        const { data: userData } = await client.auth.getUser();
        if (!userData?.user) throw new Error('You must be signed in to create a store.');

        const baseSlug = slugify(name) || `store-${Date.now()}`;
        const { data: organization, error: organizationError } = await client
            .from('organizations')
            .insert({ name: name.trim(), slug: baseSlug, owner_id: userData.user.id })
            .select('*')
            .single();
        if (organizationError) throw organizationError;

        const { error: memberError } = await client.from('organization_members').insert({
            organization_id: organization.id,
            user_id: userData.user.id,
            role: 'owner'
        });
        if (memberError) throw memberError;

        localStorage.setItem('joetech_current_organization', JSON.stringify(organization));
        return organization;
    },

    setCurrentOrganization(organization) {
        localStorage.setItem('joetech_current_organization', JSON.stringify(organization));
    },

    getCurrentOrganization() {
        return JSON.parse(localStorage.getItem('joetech_current_organization') || 'null');
    },

    getCurrentOrganizationId() {
        return this.getCurrentOrganization()?.id || null;
    }
};
