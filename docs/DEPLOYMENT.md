# Hosted SaaS deployment

## Before deployment

1. Run [supabase-schema.sql](../database/supabase-schema.sql) in the Supabase SQL Editor.
2. Deploy the application onboarding and organization-aware service changes.
3. Run [supabase-saas-migration.sql](../database/supabase-saas-migration.sql).
   Re-run this migration after pulling updates so the owner/admin role and subscription-field protections are applied to the live database.
4. Create the first Supabase Auth user and promote it to an administrator.
5. Confirm that the first user can create an organization from [onboarding.html](../onboarding.html).
6. Test product creation, customer creation, inventory movement, expense creation, and a POS sale.

## Vercel

The project is a static browser application and includes [vercel.json](../vercel.json). Deploy the repository directly from GitHub:

```powershell
npx vercel
```

No service-role key is required by the browser. Only the Supabase project URL and public publishable key belong in the frontend configuration.

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
- RLS is enabled and the SaaS migration has been applied.
- Anonymous users cannot read business tables.
- Two different organizations cannot see each other's records.
- Password reset works on the production domain.
- No service-role key is committed.
- A backup and support contact are documented.
