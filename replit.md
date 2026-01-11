# Order Entry App

## Overview

This is a productivity-focused order entry application built for sales representatives and small businesses. Users can upload product inventory from Excel/CSV files, create orders by searching and selecting products, and send orders via WhatsApp or email. The app follows Material Design principles with a mobile-first approach optimized for touch interactions and efficient data entry.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend follows a pages-based structure with reusable components. Components are organized into UI primitives (`components/ui/`), feature components, and example components for documentation.

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ESM modules
- **API Pattern**: RESTful JSON API with `/api` prefix
- **Authentication**: Replit Auth using OpenID Connect with Passport.js
- **Session Management**: PostgreSQL-backed sessions via connect-pg-simple
- **File Uploads**: Multer with memory storage for Excel/CSV parsing

The server uses a clean separation between routes, storage layer, and authentication. The storage pattern abstracts database operations through an interface for testability.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Migrations**: Drizzle Kit with `db:push` command

Key tables:
- `users` - User accounts linked to Replit Auth
- `products` - Product catalog with SKU, name, brand, price, stock
- `userProducts` - Junction table for user-product assignments (each user has their own catalog)
- `orders` and `orderItems` - Order tracking (orderItems includes freeQuantity for complimentary items)
- `sessions` - Session storage for authentication

### Authentication Flow
- Uses Replit's OIDC provider for authentication
- Sessions stored in PostgreSQL with 1-week TTL
- Protected routes use `isAuthenticated` middleware
- User data automatically synced on login via `upsertUser`

### File Processing (Admin Only)
- Only Excel files (.xlsx, .xls) are supported for product uploads
- Required Excel columns: Brand, Name, Product SKU ID, Size
- Optional column: MRP (price)
- Files are parsed server-side using the `xlsx` library
- Products are extracted and assigned to the uploading admin's catalog

### Order Import Feature
- **Import Tab**: All users can access the Import tab to paste order text
- **Text Parsing**: Simple pattern matching extracts product names and quantities from free-form text
- **Product Matching**: Parsed items are matched against the user's product catalog by SKU or name
- **Review Flow**: Users can review matched items, adjust quantities, and add to cart

### User Roles
- **Regular Users (User)**: Can use Order tab and Import tab for text-based order entry, manage cart, send orders via WhatsApp/email. See only products from their assigned brands.
- **Brand Admin (BrandAdmin)**: All regular user access plus can view orders for their assigned brands. Can change order status from Created to Approved only. When approving, their name and approval timestamp are recorded on the order.
- **Admin Users**: Full access including Products tab, Upload tab (product inventory), Users management, and complete order management with all status transitions.

### Single-Brand Order Requirement
- Each order must contain products from only one brand
- Cart enforces single-brand constraint: users cannot add products from different brands to the same cart
- Backend validates all products in order belong to the same brand before creation
- Orders table has a required `brand` field that stores the brand of all products in the order

### Orders Page Status Tab Navigation
- Orders page uses horizontal status tabs instead of dropdown filter
- Color-coded tabs: Created (Blue), Approved (Green), Invoiced (Purple), Dispatched (Orange), Delivered (Teal), Cancelled (Gray)
- Each tab shows a badge with count of orders in that status
- Status-specific table columns:
  - **Created**: Date, Party, Created By, Brand, Notes, Total
  - **Approved**: Date, Party, Approved By, Approved At, Brand, Notes, Total
  - **Invoiced**: Date, Party, Invoice #, Invoice Date, Order Value, Delivery Co.
  - **Dispatched**: Date, Party, Invoice #, Dispatch By, Cases, Order Value, Est. Delivery, Delivery Co.
  - **Delivered**: Date, Party, Invoice #, Delivered On, Order Value, On Time?
  - **Cancelled**: Date, Party, Brand, Total
- All orders are fetched once and filtered client-side for responsive tab switching

## External Dependencies

### Third-Party Services
- **Replit Auth**: OpenID Connect authentication via Replit's identity provider
- **PostgreSQL**: Database provisioned through Replit (requires `DATABASE_URL` environment variable)

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `xlsx`: Excel file parsing for SKU uploads
- `@tanstack/react-query`: Server state management
- `openid-client`: OIDC client for Replit Auth
- `passport` / `passport-local`: Authentication middleware
- `express-session` / `connect-pg-simple`: Session management

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption
- `REPL_ID`: Automatically provided by Replit
- `ISSUER_URL`: OIDC issuer (defaults to Replit's OIDC endpoint)

## User Guide

### Getting Started
1. Log in using your Replit account
2. You'll be assigned a role by an Admin: User, Brand Admin, or Admin
3. Navigate using the sidebar to access different features

### Orders Page
The Orders page displays orders organized by status using color-coded horizontal tabs:

#### Status Tabs
- **Created** (Blue): New orders waiting for approval
- **Approved** (Green): Orders approved and ready for invoicing
- **Invoiced** (Purple): Orders with invoice details added
- **Dispatched** (Orange): Orders shipped and in transit
- **Delivered** (Teal): Successfully delivered orders
- **Cancelled** (Gray): Cancelled orders

Each tab shows a badge with the count of orders in that status.

#### Order Visibility by Role
- **Regular Users**: See only orders they created themselves
- **Brand Admins**: See all orders for their assigned brands
- **Admins**: See all orders across all brands

#### Table Columns by Status
Different information is shown depending on the status tab:
- **Created/Approved**: Date, Party, Created/Approved By, Brand, Notes, Total
- **Invoiced**: Date, Party, Invoice #, Invoice Date, Order Value, Delivery Co.
- **Dispatched**: Date, Party, Invoice #, Dispatch By, Cases, Order Value, Est. Delivery, Delivery Co.
- **Delivered**: Date, Party, Invoice #, Delivered On, Order Value, On Time indicator
- **Cancelled**: Date, Party, Brand, Total

#### Filters
- **Date Filter**: Filter by Today, Last 7 Days, or All Time
- **Brand Filter**: Filter by specific brand (visible on larger screens)
- **Delivery Company Filter**: Filter by delivery company (visible on larger screens)

### Creating Orders
1. Go to the Order tab
2. Search for products by name or SKU
3. Add items to your cart (all items must be from the same brand)
4. Enter party name and delivery notes
5. Submit the order

### Importing Orders from Text
1. Go to the Import tab
2. Paste order text (e.g., from a message or email)
3. The system matches products by name or SKU
4. Review matched items and adjust quantities
5. Add matched items to cart

### Order Status Workflow
1. **Created**: Order is submitted
2. **Approved**: Brand Admin or Admin approves the order (approval tracked with name and timestamp)
3. **Invoiced**: Admin adds invoice number and date
4. **Dispatched**: Admin adds dispatch details (Dispatch By, Cases, Est. Delivery)
5. **Delivered**: Order is marked as delivered with actual delivery date
6. **Cancelled**: Order is cancelled (only from Created or Approved status)

### WhatsApp Sharing
Click the message icon on any order to generate and share order details via WhatsApp. The message format changes based on order status.

## External API Endpoints

External API endpoints for integration with external agents and systems. All endpoints require API key authentication via `X-API-KEY` header or `Authorization: Bearer <key>` header.

### GET /api/created/summary
Returns orders created within a date range with full order details including items.

**Parameters:**
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format
- `brand` (optional): Case-insensitive partial match filter for brand name

**Response:** Order count, total value, status breakdown, and detailed order list with items.

### GET /api/dispatch/summary
Returns orders dispatched within a date range.

**Parameters:**
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format
- `brand` (optional): Case-insensitive partial match filter for brand name

**Response:** Order count and list of dispatched orders with invoice and dispatch details.

### GET /api/delivery/summary
Returns orders delivered within a date range with on-time delivery statistics.

**Parameters:**
- `startDate` (required): Start date in YYYY-MM-DD format
- `endDate` (required): End date in YYYY-MM-DD format
- `brand` (optional): Case-insensitive partial match filter for brand name

**Response:** Order count, on-time delivery count/percentage, and list of delivered orders.