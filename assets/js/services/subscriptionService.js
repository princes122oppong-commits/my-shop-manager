import { getSupabaseClient } from './supabase.js';
import { organizationService } from './organizationService.js';

export const SUBSCRIPTION_PLANS = {
    trial: { name: 'Free Trial', price: 0, maxProducts: 100, maxUsers: 2, maxMonthlySales: 100 },
    starter: { name: 'Starter', price: 19, maxProducts: 500, maxUsers: 3, maxMonthlySales: 1000 },
    professional: { name: 'Professional', price: 49, maxProducts: 5000, maxUsers: 15, maxMonthlySales: 10000 },
    enterprise: { name: 'Enterprise', price: 99, maxProducts: Infinity, maxUsers: Infinity, maxMonthlySales: Infinity }
};

export const subscriptionService = {
    async getCurrentPlan() {
        const localOrganization = organizationService.getCurrentOrganization();
        const client = await getSupabaseClient();
        if (client && localOrganization?.id) {
            const { data, error } = await client.from('organizations')
                .select('id, name, plan, subscription_status, trial_ends_at')
                .eq('id', localOrganization.id)
                .single();
            if (error) throw error;
            const plan = SUBSCRIPTION_PLANS[data.plan] || SUBSCRIPTION_PLANS.trial;
            return { ...data, ...plan, planKey: data.plan };
        }

        const planKey = localOrganization?.plan || 'trial';
        return { ...SUBSCRIPTION_PLANS[planKey], planKey, subscription_status: 'trialing' };
    },

    async getUsage() {
        const client = await getSupabaseClient();
        const organizationId = organizationService.getCurrentOrganizationId();
        if (!client || !organizationId) return { products: 0, users: 0, monthlySales: 0 };

        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const [products, users, sales] = await Promise.all([
            client.from('products').select('id', { count: 'exact', head: true }),
            client.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true),
            client.from('sales').select('id', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString())
        ]);
        for (const result of [products, users, sales]) if (result.error) throw result.error;
        return { products: products.count || 0, users: users.count || 0, monthlySales: sales.count || 0 };
    },

    async assertCanCreate(resource) {
        const [plan, usage] = await Promise.all([this.getCurrentPlan(), this.getUsage()]);
        const limits = { product: ['products', 'maxProducts'], user: ['users', 'maxUsers'], sale: ['monthlySales', 'maxMonthlySales'] };
        const pair = limits[resource];
        if (pair && usage[pair[0]] >= plan[pair[1]]) {
            throw new Error(`Your ${plan.name} plan has reached its ${resource} limit. Upgrade to continue.`);
        }
        return true;
    }
};
