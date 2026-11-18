# JoeTech Store Manager

A modern, responsive, and fully functional **Store Management & Point of Sale (POS)** web application designed for retail and tech stores.

## 🚀 Features

- **Dashboard Overview:** Real-time stats (Revenue, Sales Count, Products, Low Stock Alerts), recent sales table, and top-selling products.
- **Product Catalog:** Full CRUD operations for products, category filtering, search, and automatic barcode generation.
- **Inventory & Stock Management:** Real-time stock levels, low stock alerts, stock-in/stock-out adjustments, and detailed movement history.
- **Point of Sale (POS):** Interactive product grid, real-time shopping cart, tax/total calculations, checkout with multiple payment methods, and printable receipts.
- **Customer & Supplier Directories:** Manage customer and supplier contact details.
- **Employee Directory:** Manage staff roles (Administrator, Manager, Cashier).
- **Expense Tracker:** Record and categorize store expenses.
- **Sales Reports:** Filter transactions by date, view summary metrics (Revenue, Transactions, Average Order Value), and export reports to CSV.
- **Supabase Integration:** Seamlessly switch between LocalStorage mode and a live Supabase database.

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (CSS Variables, Flexbox, Grid), Modern JavaScript (ES6 Modules)
- **Icons:** Lucide Icons
- **Database/Backend:** Supabase (with LocalStorage fallback)

## 📦 Getting Started

### 1. Run Locally
Since the application uses ES6 Modules, it must be served from a local web server. You can use any simple server:

#### Using the project server:
```bash
npm start
```
Then open `http://127.0.0.1:5173`.

The server also listens on the local network and prints a network URL when it starts. Open that URL from another device connected to the same Wi-Fi or LAN. If Windows Firewall prompts you, allow Node.js on Private networks.

On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd start`.

#### Using Node.js (npx):
```bash
npx serve .
```

#### Using VS Code:
Install the **Live Server** extension, right-click `index.html`, and select **Open with Live Server**.

### 2. Login Credentials
Use the pre-seeded demo credentials to log in:
- **Email:** `admin@joetech.com`
- **Password:** `admin`

## ⚙️ Supabase Setup (Optional)
To use Supabase as the production backend:

1. Create a Supabase project and run [supabase-schema.sql](./database/supabase-schema.sql) in the SQL Editor.
2. Configure the project Auth URL and email settings.
3. Serve the application from a web server; ES modules do not work reliably from `file://` URLs.
4. Open **Settings** in the sidebar.
5. Enter the project URL and public anon key, then click **Connect Supabase**.

When Supabase credentials are configured, login, registration, password recovery, and password updates use Supabase Auth. Without credentials, the app remains available in offline demo mode using browser LocalStorage.

Before inviting real users, review the RLS policies in the schema and narrow them to your staff roles and branches.

For detailed instructions, see [Supabase setup](./docs/SUPABASE_SETUP.md) and the [hosted deployment guide](./docs/DEPLOYMENT.md).
