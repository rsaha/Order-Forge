# Order Entry App

## Overview

This project is a productivity-focused order entry application designed for sales representatives and small businesses. Its primary purpose is to streamline the order creation and management process. Key capabilities include uploading product inventory via Excel/CSV, generating orders by searching and selecting products, and facilitating order communication through WhatsApp or email. The application prioritizes a mobile-first, touch-optimized user experience, adhering to Material Design principles for efficient data entry. The business vision is to empower sales teams and small businesses with a robust, intuitive tool that enhances sales efficiency and order fulfillment, tapping into a market segment seeking streamlined digital solutions for order management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18 and TypeScript, using Wouter for routing and TanStack React Query for server state management. UI styling is managed with Tailwind CSS and the shadcn/ui component library, following the New York style. Vite is used as the build tool, including custom plugins for Replit integration. The architecture promotes a pages-based structure with a clear separation of reusable UI components and feature-specific components.

### Backend
The backend utilizes Node.js with Express and TypeScript, employing ESM modules. It exposes a RESTful JSON API. Authentication is handled via Replit Auth (OpenID Connect) integrated with Passport.js, with session management backed by PostgreSQL using `connect-pg-simple`. File uploads for inventory are processed using Multer. The backend design emphasizes a clean separation between routes, storage logic, and authentication layers, with a storage interface for enhanced testability.

### Data Storage
PostgreSQL serves as the primary database, managed with Drizzle ORM. The database schema, defined in `shared/schema.ts`, is shared across both frontend and backend. Drizzle Kit is used for migrations. Key tables include `users`, `products`, `userProducts` (for user-specific catalogs), `orders`, `orderItems` (including `freeQuantity`), and `sessions`.

### Authentication
The application supports two authentication methods:
1.  **Google OAuth 2.0**: Uses `passport-google-oauth20` for direct Google login. Users are matched by email to avoid duplicates when migrating from Replit OIDC. Admin status is determined by the `ADMIN_EMAILS` list in `server/replitAuth.ts`.
2.  **Phone/Password Authentication**: Admin-created users log in with a phone number and a bcrypt-hashed password.
Both methods share a PostgreSQL-backed session management system with a one-week TTL. A dev-mode bypass auto-logs in as an admin user when `NODE_ENV !== "production"`.

### Core Features
-   **File Processing (Admin)**: Supports Excel (.xlsx, .xls) uploads for product inventory. Required columns: Brand, Name, Product SKU ID, Size, with an optional MRP. Products are parsed server-side and assigned to the admin's catalog.
-   **Order Import (Text)**: Users can paste free-form text, which is parsed to match products against their catalog by SKU or name, allowing review and cart addition.
-   **Order Import (Excel - Admin)**: Admins can import orders from Excel files (Customer-wise sales summary format). The system extracts Invoice Number from "Entry No." column, Invoice Date from "Entry Date" column (Excel serial format), and Actual Invoice Value from customer's "Net Amount" column. Orders are created with "Invoiced" status automatically.
-   **Announcement System**: Admin-managed announcements stored in the database, with priority levels, brand targeting, expiration dates, and user dismissal functionality.
-   **User Roles**: Differentiates between Regular Users (order creation, cart management), Brand Admins (order viewing for assigned brands, status changes), and Admin Users (full access including product/user management, all order statuses, and creating orders on behalf of sales users).
-   **Admin Order Creation**: Admins can create orders for sales users, maintaining `userId` (owner) and `createdBy` (admin creator) for audit trails.
-   **Single-Brand Order Enforcement**: Each order must contain products from a single brand, enforced at both frontend (cart) and backend (validation) levels.
-   **Orders Page**: Features status-based navigation via color-coded tabs (Created, Approved, Invoiced, Pending, Dispatched, Delivered, POD Received, Cancelled) with status-specific table columns and client-side filtering.
-   **POD (Proof of Delivery) Tracking**: Orders include a `podStatus`. Admins can mark POD as "Received," triggering a status change to "POD Received" and recording a timestamp.
-   **Pending Orders**: Out-of-stock items from "Created" or "Approved" orders can be moved to a "Pending" order, linked to the original order via `parentOrderId`, and can be edited.
-   **WhatsApp Sharing**: Generates and shares order details via WhatsApp with status-dependent messaging.
-   **Party-Salesperson Linking**: Admins can link salespeople (User role) to customer parties via the `userPartyAccess` table. Linked salespeople can view and modify (add/edit/delete items) orders for their assigned parties when orders are in Created, Approved, or Pending status. The Users page provides a UI for managing these linkages with autocomplete suggestions from existing party names.
-   **Customer-Sales User Linking**: Customer users can be linked to sales users via the `linkedSalesUserId` field. When admins create customer users, they can select a sales user to manage that customer. Sales users can view all their linked customer users, and customer users can see their assigned sales user. This enables proper customer-salesperson relationship management.
-   **User Management UX**: Users page features search (by name/email/phone/party), role filter tabs (All/Admin/BrandAdmin/User/Customer) with counts, compact list rows, and a detail side sheet for viewing/editing user details. All editing (name, role, brands, party access, delivery companies, linked sales user, password reset) happens in the sheet. Add User uses the same sheet pattern.
-   **Account Merge**: Admins can merge duplicate user accounts from the user detail sheet. The merge flow includes target user selection with search, a preview step showing data to be transferred (orders, brand/delivery/party access, linked customers), and confirmation. The merge is transactional — all orders, access permissions, and linked customer relationships are transferred atomically, and the source user is deleted. Endpoints: `GET /api/admin/users/merge-preview`, `POST /api/admin/users/merge`.
-   **Analytics Dashboard**: Admin-only page with KPIs (Total Orders, Value Invoiced excl. Biostige, Transport Cost, On-Time Delivery), Order Flow Funnel, velocity metrics, blocker detection, and delivery cost breakdown by dispatcher. Filters: date range, brand, delivery company, and order creator (filters by order owner/salesperson userId). Analytics endpoint uses in-memory caching with 2-minute TTL keyed on all filter params.

## External Dependencies

### Third-Party Services
-   **Google OAuth 2.0**: Direct Google login via `passport-google-oauth20`.
-   **PostgreSQL**: Database service provided through Replit.

### Key NPM Packages
-   `drizzle-orm`, `drizzle-kit`: ORM for database interactions and migrations.
-   `xlsx`: Library for parsing Excel files.
-   `@tanstack/react-query`: For server state management in the frontend.
-   `passport`, `passport-google-oauth20`: Authentication middleware for Node.js with Google OAuth.
-   `express-session`, `connect-pg-simple`: For session management with PostgreSQL.

### Environment Variables
-   `DATABASE_URL`: PostgreSQL connection string.
-   `SESSION_SECRET`: Secret for session encryption.
-   `GOOGLE_CLIENT_ID`: Google OAuth 2.0 client ID.
-   `GOOGLE_CLIENT_SECRET`: Google OAuth 2.0 client secret.
-   `CASHDESK_API_KEY`: API key for external API authentication.

## External API Endpoints

All external API endpoints require authentication via `X-API-KEY` header using the `CASHDESK_API_KEY` secret.

### GET /api/sales/summary
Returns Invoiced, Dispatched, and Delivered orders grouped by brand within a date range.

**Parameters:**
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format
- `brand` (optional): Case-insensitive partial match filter for brand name

**Response:** Total orders, total value, and breakdown by brand with status-level counts and values (Invoiced/Dispatched/Delivered).

### GET /api/sales/party/:partyName
Returns all Invoiced/Dispatched/Delivered orders for a specific party within a date range.

**Parameters:**
- `partyName` (required): URL-encoded party name
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format

**Response:** Party name, order count, total value, status breakdown (Invoiced/Dispatched/Delivered counts and values), and list of orders.

### GET /api/sales/brand/:brandName
Returns total order value for a specific brand within a date range.

**Parameters:**
- `brandName` (required): URL-encoded brand name
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format

**Response:** Brand name, order count, total value, and breakdown by status (Invoiced/Dispatched/Delivered counts and values).

### POST /api/orders/external
Creates an order from an external system. Items are matched by product `name` (case-insensitive) within the specified brand.

**Body (JSON):**
- `brand` (required): Brand name (must exist and be active)
- `partyName` (required): Customer/party name
- `items` (required): Array of `{ name: string, quantity: number, unitPrice?: number, freeQuantity?: number, size?: string }`
- `status` (optional): Order status, default "Created". One of: Created, Approved, Invoiced, Dispatched, Delivered
- `invoiceNumber` (optional): Invoice reference number
- `invoiceDate` (optional): Invoice date in YYYY-MM-DD format
- `dispatchDate` (optional): Dispatch date in YYYY-MM-DD format
- `dispatchBy` (optional): Dispatch carrier/method
- `cases` (optional): Number of cases
- `specialNotes` (optional): Notes for the order
- `deliveryCompany` (optional): Delivery company, default "Guided"
- `actualOrderValue` (optional): Actual invoice value

**Response:** Created order details with resolved items, item count.