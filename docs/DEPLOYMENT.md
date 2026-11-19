# Hosted SaaS deployment

## Before deployment

1. Run [supabase-schema.sql](../database/supabase-schema.sql) in the Supabase SQL Editor.
2. Deploy the application onboarding and organization-aware service changes.
3. Run [supabase-saas-migration.sql](../database/supabase-saas-migration.sql).
   Re-run this migration after pulling updates so the owner/admin role and subscription-field protections are applied to the live database.
   Check the SQL notices for legacy rows that still need an explicit organization mapping before relying on hosted data. Do not assign those rows to an arbitrary organization.
   The migration also installs database-side plan checks for product, active staff, and monthly sale limits; these checks are authoritative even when a request bypasses the browser.
4. Run [supabase-branches-migration.sql](../database/supabase-branches-migration.sql) after the SaaS migration.
   This migration installs the atomic checkout RPC and organization-specific employee details table. Deploy the matching frontend/API changes in a coordinated release; checkout is unavailable until both the RPC and new client are in place.
   Legacy employee details are copied only when a staff account belongs to one active organization. Review and fill in employee details for accounts that belong to multiple organizations.
5. Create the first Supabase Auth user and promote it to an administrator.
6. Confirm that the first user can create an organization from [onboarding.html](../onboarding.html).
7. Test organization switching, create a second branch, switch branches, and verify branch stock and sales are separate.
8. Test product creation, customer creation, inventory movement, expense creation, and a POS sale.

## Vercel

The project is a static browser application and includes [vercel.json](../vercel.json). Deploy the repository directly from GitHub:

```powershell
npx vercel
```

No service-role key is required by the browser. Only the Supabase project URL and public publishable key belong in the frontend configuration.

The staff invitation endpoint runs as a Vercel serverless function in `api/`.
Configure these server-only environment variables in Vercel for each deployed
environment before using **User Management → Invite Staff**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL` (the exact public origin, such as `https://your-domain.com`)

Never place `SUPABASE_SERVICE_ROLE_KEY` in `assets/js/config/runtime.js`, a
browser setting, or a committed `.env` file. Staff invites also require the
SaaS and branches migrations to be applied, and Supabase Auth email invitations
to be configured for the `reset-password` redirect.

## Custom domain

After deployment, add the customer-facing domain in Vercel and in Supabase:

- Authentication → URL Configuration → Site URL
- Authentication → URL Configuration → Redirect URLs

Add the production domain and the reset-password callback URL:

```text
https://your-domain.com/reset-password.html
```

## Release checklist

- HTTPS is active.
- Supabase Auth email confirmation is configured.
- RLS is enabled and both the SaaS and branch migrations have been applied.
- Anonymous users cannot read business tables.
- Two different organizations cannot see each other's records.
- Staff can access only branches assigned to them.
- Password reset works on the production domain.
- No service-role key is committed.
- Vercel invitation environment variables are set server-side only.
- Database-side plan enforcement is installed by the latest SaaS migration. Payment processing and subscription webhooks are still separate work; plan/status changes must come from a trusted billing workflow.
- A backup and support contact are documented.
