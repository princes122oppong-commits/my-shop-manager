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
            organizations: (data || []).filter(item => item.organizations).map(item => ({ ...item.organizations, role: item.role }))
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
        localStorage.removeItem(`joetech_current_branch:${organization.id}`);
        return organization;
    },

    setCurrentOrganization(organization) {
        localStorage.setItem('joetech_current_organization', JSON.stringify(organization));
    },

    async setActiveOrganization(organization) {
        this.setCurrentOrganization(organization);
        const user = JSON.parse(localStorage.getItem('joetech_current_user') || '{}');
        user.role = organization.role || user.role;
        localStorage.setItem('joetech_current_user', JSON.stringify(user));
        const branches = await branchService.getMyBranches();
        if (!branches.length) await branchService.ensureDefaultBranch();
        const refreshed = await branchService.getMyBranches();
        const savedBranch = refreshed.find(branch => branch.id === branchService.getCurrentBranchId());
        if (savedBranch) branchService.setCurrentBranch(savedBranch);
        else if (refreshed.length) branchService.setCurrentBranch(refreshed[0]);
    },

    getCurrentOrganization() {
        return JSON.parse(localStorage.getItem('joetech_current_organization') || 'null');
    },

    getCurrentOrganizationId() {
        return this.getCurrentOrganization()?.id || null;
    }
};

export const branchService = {
    storageKey() {
        return `joetech_current_branch:${organizationService.getCurrentOrganizationId() || 'demo'}`;
    },
    async getMyBranches() {
        const client = await getSupabaseClient();
        if (!client) return [{ id: 'default', name: 'Main Store', is_active: true, is_primary: true }];
        const { data, error } = await client.from('branches').select('id, name, address, city, phone, email, is_active').eq('organization_id', organizationService.getCurrentOrganizationId()).eq('is_active', true).order('created_at');
        if (error) {
            if (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703') return [];
            throw error;
        }
        return data || [];
    },
    async getAllBranches() {
        const client = await getSupabaseClient();
        if (!client) return this.getMyBranches();
        const { data, error } = await client.from('branches').select('id, name, address, city, phone, email, is_active, created_at').eq('organization_id', organizationService.getCurrentOrganizationId()).order('created_at');
        if (error) throw error;
        return data || [];
    },
    async ensureDefaultBranch() {
        const branches = await this.getMyBranches();
        if (branches.length) return branches[0];
        const client = await getSupabaseClient();
        if (!client) return { id: 'default', name: 'Main Store', is_active: true };
        const { data: userData } = await client.auth.getUser();
        const orgId = organizationService.getCurrentOrganizationId();
        const { data, error } = await client.from('branches').insert({ organization_id: orgId, name: 'Main Store', is_active: true, manager_id: userData?.user?.id }).select('*').single();
        if (error) {
            if (error.code === '42703' || error.code === '42P01' || error.code === 'PGRST205') return null;
            throw error;
        }
        if (userData?.user) await client.from('user_branches').upsert({ organization_id: orgId, user_id: userData.user.id, branch_id: data.id, is_primary: true }, { onConflict: 'user_id,branch_id' });
        this.setCurrentBranch(data);
        return data;
    },
    async createBranch(input) {
        const client = await getSupabaseClient();
        if (!client) throw new Error('Branch management requires Supabase.');
        const { data: userData } = await client.auth.getUser();
        const { data, error } = await client.from('branches').insert({
            organization_id: organizationService.getCurrentOrganizationId(),
            name: input.name.trim(), address: input.address || null, city: input.city || null,
            phone: input.phone || null, email: input.email || null,
            manager_id: userData?.user?.id || null, is_active: true
        }).select('*').single();
        if (error) throw error;
        if (userData?.user) {
            const { error: assignmentError } = await client.from('user_branches').upsert({ organization_id: organizationService.getCurrentOrganizationId(), user_id: userData.user.id, branch_id: data.id, is_primary: false }, { onConflict: 'user_id,branch_id' });
            if (assignmentError) throw assignmentError;
        }
        return data;
    },
    async getOrganizationMembers() {
        const client = await getSupabaseClient();
        if (!client) return [];
        const orgId = organizationService.getCurrentOrganizationId();
        const { data: members, error } = await client.from('organization_members').select('user_id, role, is_active').eq('organization_id', orgId).eq('is_active', true);
        if (error) throw error;
        const ids = (members || []).map(member => member.user_id);
        if (!ids.length) return [];
        const [{ data: profiles, error: profileError }, { data: assignments, error: assignmentError }] = await Promise.all([
            client.from('profiles').select('id, email, full_name').in('id', ids),
            client.from('user_branches').select('user_id, branch_id').eq('organization_id', orgId)
        ]);
        if (profileError) throw profileError;
        if (assignmentError) throw assignmentError;
        const profileMap = new Map((profiles || []).map(profile => [profile.id, profile]));
        const branchesByUser = new Map();
        (assignments || []).forEach(row => {
            const assigned = branchesByUser.get(row.user_id) || [];
            assigned.push(row.branch_id);
            branchesByUser.set(row.user_id, assigned);
        });
        return members.map(member => ({
            id: member.user_id, role: member.role,
            email: profileMap.get(member.user_id)?.email || '',
            name: profileMap.get(member.user_id)?.full_name || profileMap.get(member.user_id)?.email || 'Staff member',
            branchIds: branchesByUser.get(member.user_id) || []
        }));
    },
    async setBranchMembers(branchId, memberIds) {
        const client = await getSupabaseClient();
        if (!client) throw new Error('Branch staff assignments require Supabase.');
        const orgId = organizationService.getCurrentOrganizationId();
        const { data: existing, error: readError } = await client.from('user_branches').select('user_id').eq('organization_id', orgId).eq('branch_id', branchId);
        if (readError) throw readError;
        const selected = new Set(memberIds);
        const toRemove = (existing || []).filter(row => !selected.has(row.user_id)).map(row => row.user_id);
        if (toRemove.length) {
            const { data: otherAssignments, error: assignmentError } = await client.from('user_branches').select('user_id, branch_id').eq('organization_id', orgId).in('user_id', toRemove).neq('branch_id', branchId);
            if (assignmentError) throw assignmentError;
            const otherBranchIds = [...new Set((otherAssignments || []).map(row => row.branch_id))];
            const { data: activeBranches, error: branchError } = otherBranchIds.length
                ? await client.from('branches').select('id').in('id', otherBranchIds).eq('is_active', true)
                : { data: [], error: null };
            if (branchError) throw branchError;
            const remaining = new Set((otherAssignments || []).filter(row => (activeBranches || []).some(branch => branch.id === row.branch_id)).map(row => row.user_id));
            if (toRemove.some(userId => !remaining.has(userId))) throw new Error('Each staff member must remain assigned to at least one active branch.');
        }
        if (toRemove.length) {
            const { error } = await client.from('user_branches').delete().eq('organization_id', orgId).eq('branch_id', branchId).in('user_id', toRemove);
            if (error) throw error;
        }
        const toAdd = [...selected].map(userId => ({ organization_id: orgId, user_id: userId, branch_id: branchId, is_primary: false }));
        if (toAdd.length) {
            const { error } = await client.from('user_branches').upsert(toAdd, { onConflict: 'user_id,branch_id' });
            if (error) throw error;
        }
    },
    async setActive(id, isActive) {
        const client = await getSupabaseClient();
        if (!client) throw new Error('Branch management requires Supabase.');
        if (!isActive) {
            const branches = await this.getMyBranches();
            if (branches.length <= 1 && branches.some(branch => branch.id === id)) throw new Error('Keep at least one active branch for this business.');
        }
        const { error } = await client.from('branches').update({ is_active: isActive }).eq('id', id).eq('organization_id', organizationService.getCurrentOrganizationId());
        if (error) throw error;
        if (!isActive && this.getCurrentBranch()?.id === id) {
            const remaining = await this.getMyBranches();
            if (remaining.length) this.setCurrentBranch(remaining[0]);
            else localStorage.removeItem(this.storageKey());
        }
    },
    setCurrentBranch(branch) { localStorage.setItem(this.storageKey(), JSON.stringify(branch)); },
    getCurrentBranch() { try { return JSON.parse(localStorage.getItem(this.storageKey()) || 'null'); } catch { return null; } },
    getCurrentBranchId() { return this.getCurrentBranch()?.id || null; }
};
