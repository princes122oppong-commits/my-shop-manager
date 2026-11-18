# Supabase setup

## 1. Create the project

Create a Supabase project, then open **SQL Editor**.

## 2. Install the database

Copy the complete contents of [supabase-schema.sql](../database/supabase-schema.sql) into the SQL Editor and run it once.

The schema creates the store tables, indexes, triggers, seed records, and Row Level Security policies.

For the hosted SaaS version, also run [supabase-saas-migration.sql](../database/supabase-saas-migration.sql). This adds organizations, memberships, tenant columns, and organization-scoped policies. Follow the order in [DEPLOYMENT.md](./DEPLOYMENT.md) before opening the service to customers.

## 3. Create the first user

In Supabase, open **Authentication → Users** and create a user with email and password.

Then run this query, replacing the email:

```sql
UPDATE public.profiles
SET role = 'admin', is_active = true
WHERE email = 'admin@your-store.com';
```

The profile must exist before the user can use the application. If the signup flow creates the account first, the profile can then be promoted with the query above.

## 4. Connect the browser app

Start the app:

```powershell
npm start
```

Open the **Settings** page, enter:

- Supabase Project URL
- Supabase public anon key

Then select **Connect Supabase**. The values are stored in the browser's local storage; never place a Supabase service-role key in this app.

## 5. Security model

The schema enables RLS on application tables. Anonymous users cannot read store data. Authenticated users can read operational data, while writes are restricted by role:

- `admin`: full administration
- `manager`: operational management
- `cashier`: checkout and customer workflows
- `inventory_officer`: product and inventory workflows
- `viewer`: read-only access

The application still supports offline LocalStorage mode when Supabase credentials are not configured. That mode is intended for demos and local testing, not shared production data.
