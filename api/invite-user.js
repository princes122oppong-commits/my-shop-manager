const ALLOWED_ROLES = new Set(['admin', 'manager', 'cashier', 'inventory_officer', 'viewer']);
const PLAN_LIMITS = {
    trial: 2,
    starter: 3,
    professional: 15,
    enterprise: Number.POSITIVE_INFINITY
};

function json(res, status, body) {
    res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
}

function readCount(response) {
    const range = response.headers.get('content-range') || '';
    const count = Number(range.split('/').pop());
    return Number.isFinite(count) ? count : 0;
}

async function supabaseRequest(url, key, path, options = {}) {
    const response = await fetch(`${url}${path}`, {
        ...options,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
        const error = new Error(body?.msg || body?.message || body?.error_description || `Supabase request failed (${response.status}).`);
        error.status = response.status;
        throw error;
    }
    return { body, response };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'Method not allowed.' });
    }

    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const appBaseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '');
    if (!supabaseUrl || !anonKey || !serviceKey || !appBaseUrl) {
        return json(res, 503, { error: 'Staff invitations are not configured on this deployment.' });
    }

    const authorization = req.headers.authorization || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json(res, 401, { error: 'Sign in before inviting staff.' });

    const { name, email, role, organizationId, branchId, department, salary, hireDate, employeeId } = req.body || {};
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (typeof name !== 'string' || !name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
        || typeof organizationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(organizationId)
        || typeof branchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(branchId)
        || !ALLOWED_ROLES.has(role)
        || !Number.isFinite(Number(salary)) || Number(salary) < 0) {
        return json(res, 400, { error: 'Enter a valid name, email, role, branch, and salary.' });
    }

    try {
        const userResult = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
        });
        if (!userResult.ok) return json(res, 401, { error: 'Your session has expired. Sign in again.' });
        const signedInUser = await userResult.json();

        const query = new URLSearchParams({
            select: 'role', organization_id: `eq.${organizationId}`, user_id: `eq.${signedInUser.id}`,
            is_active: 'eq.true', limit: '1'
        });
        const { body: memberships } = await supabaseRequest(supabaseUrl, serviceKey, `/rest/v1/organization_members?${query}`);
        const inviterRole = memberships?.[0]?.role;
        if (!['owner', 'admin'].includes(inviterRole)) {
            return json(res, 403, { error: 'Only a store owner or administrator can invite staff.' });
        }

        const branchQuery = new URLSearchParams({
            select: 'id', id: `eq.${branchId}`, organization_id: `eq.${organizationId}`, is_active: 'eq.true', limit: '1'
        });
        const { body: branches } = await supabaseRequest(supabaseUrl, serviceKey, `/rest/v1/branches?${branchQuery}`);
        if (!branches?.length) return json(res, 400, { error: 'The selected branch is not active in this store.' });

        const orgQuery = new URLSearchParams({ select: 'plan,subscription_status,trial_ends_at', id: `eq.${organizationId}`, limit: '1' });
        const { body: organizations } = await supabaseRequest(supabaseUrl, serviceKey, `/rest/v1/organizations?${orgQuery}`);
        const organization = organizations?.[0];
        if (!organization) return json(res, 404, { error: 'Store not found.' });
        const hasActiveSubscription = organization.subscription_status === 'active';
        const hasActiveTrial = organization.subscription_status === 'trialing'
            && organization.trial_ends_at
            && new Date(organization.trial_ends_at) > new Date();
        if (!hasActiveSubscription && !hasActiveTrial) {
            return json(res, 402, { error: 'This store subscription is inactive. Update the plan before inviting staff.' });
        }

        const memberCountQuery = new URLSearchParams({
            select: 'id', organization_id: `eq.${organizationId}`, is_active: 'eq.true', limit: '1'
        });
        const { response: memberResponse } = await supabaseRequest(supabaseUrl, serviceKey,
            `/rest/v1/organization_members?${memberCountQuery}`, { headers: { Prefer: 'count=exact' } });
        const limit = PLAN_LIMITS[organization.plan] ?? PLAN_LIMITS.trial;
        if (readCount(memberResponse) >= limit) {
            return json(res, 402, { error: 'This store has reached its active staff limit. Upgrade the plan to invite more staff.' });
        }

        // Check required schema before sending an invitation email. This gives
        // setup errors a clear response without issuing unusable invites.
        await supabaseRequest(supabaseUrl, serviceKey, '/rest/v1/organization_employee_details?select=id%2Corganization_id%2Cuser_id&limit=0');
        await supabaseRequest(supabaseUrl, serviceKey, '/rest/v1/user_branches?select=id%2Corganization_id%2Cuser_id%2Cbranch_id&limit=0');

        const profileQuery = new URLSearchParams({ select: 'id', email: `eq.${cleanEmail}`, limit: '1' });
        const { body: profiles } = await supabaseRequest(supabaseUrl, serviceKey, `/rest/v1/profiles?${profileQuery}`);
        let staffUser = profiles?.[0] || null;
        if (staffUser?.id === signedInUser.id) return json(res, 409, { error: 'You cannot invite yourself as a staff member.' });
        if (staffUser) {
            const existingMembershipQuery = new URLSearchParams({
                select: 'is_active', organization_id: `eq.${organizationId}`, user_id: `eq.${staffUser.id}`, limit: '1'
            });
            const { body: existingMemberships } = await supabaseRequest(supabaseUrl, serviceKey,
                `/rest/v1/organization_members?${existingMembershipQuery}`);
            if (existingMemberships?.[0]?.is_active) return json(res, 409, { error: 'This account is already a member of the selected store.' });
        }
        let invited = false;
        if (!staffUser) {
            const inviteUrl = `${supabaseUrl}/auth/v1/invite?redirect_to=${encodeURIComponent(`${appBaseUrl}/reset-password`)}`;
            const inviteResponse = await fetch(inviteUrl, {
                method: 'POST',
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cleanEmail, data: { full_name: name.trim() } })
            });
            const inviteBody = await inviteResponse.json().catch(() => ({}));
            if (!inviteResponse.ok) return json(res, 400, { error: inviteBody.msg || inviteBody.message || 'Supabase could not send the invitation.' });
            staffUser = inviteBody.user || inviteBody;
            invited = true;
        }

        if (!staffUser?.id) return json(res, 502, { error: 'Supabase did not return the invited user.' });
        const restHeaders = { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
        const restOptions = (body) => ({ method: 'POST', headers: restHeaders, body: JSON.stringify(body) });

        await supabaseRequest(supabaseUrl, serviceKey,
            '/rest/v1/organization_members?on_conflict=organization_id%2Cuser_id',
            restOptions({ organization_id: organizationId, user_id: staffUser.id, role, is_active: true }));
        const employeeQuery = new URLSearchParams({
            select: 'id,organization_id,user_id', organization_id: `eq.${organizationId}`,
            user_id: `eq.${staffUser.id}`, limit: '1'
        });
        const { body: existingEmployees } = await supabaseRequest(supabaseUrl, serviceKey,
            `/rest/v1/organization_employee_details?${employeeQuery}`);
        if (!existingEmployees?.length) {
            await supabaseRequest(supabaseUrl, serviceKey,
                '/rest/v1/organization_employee_details?on_conflict=organization_id%2Cuser_id',
                restOptions({
                user_id: staffUser.id, organization_id: organizationId, branch_id: branchId,
                employee_id: typeof employeeId === 'string' && employeeId.trim() ? employeeId.trim() : `EMP-${Date.now()}`,
                department: typeof department === 'string' && department.trim() ? department.trim() : 'General',
                position: role, salary: Number(salary),
                hire_date: /^\d{4}-\d{2}-\d{2}$/.test(hireDate || '') ? hireDate : new Date().toISOString().slice(0, 10)
                }));
        }
        await supabaseRequest(supabaseUrl, serviceKey,
            '/rest/v1/user_branches?on_conflict=user_id%2Cbranch_id',
            restOptions({ organization_id: organizationId, user_id: staffUser.id, branch_id: branchId, is_primary: true }));

        return json(res, 201, { success: true, invited, message: invited ? 'Invitation sent.' : 'Existing account added to this store.' });
    } catch (error) {
        console.error('Staff invitation failed:', error.message);
        return json(res, 500, { error: 'Could not complete the staff invitation. Check server configuration and migration status.' });
    }
}
