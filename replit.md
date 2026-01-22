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
1.  **Replit Auth**: Utilizes Replit's OIDC provider, automatically syncing user data.
2.  **Phone/Password Authentication**: Admin-created users log in with a phone number and a bcrypt-hashed password.
Both methods share a PostgreSQL-backed session management system with a one-week TTL.

### Core Features
-   **File Processing (Admin)**: Supports Excel (.xlsx, .xls) uploads for product inventory. Required columns: Brand, Name, Product SKU ID, Size, with an optional MRP. Products are parsed server-side and assigned to the admin's catalog.
-   **Order Import**: Users can paste free-form text, which is parsed to match products against their catalog by SKU or name, allowing review and cart addition.
-   **Announcement System**: Admin-managed announcements stored in the database, with priority levels, brand targeting, expiration dates, and user dismissal functionality.
-   **User Roles**: Differentiates between Regular Users (order creation, cart management), Brand Admins (order viewing for assigned brands, status changes), and Admin Users (full access including product/user management, all order statuses, and creating orders on behalf of sales users).
-   **Admin Order Creation**: Admins can create orders for sales users, maintaining `userId` (owner) and `createdBy` (admin creator) for audit trails.
-   **Single-Brand Order Enforcement**: Each order must contain products from a single brand, enforced at both frontend (cart) and backend (validation) levels.
-   **Orders Page**: Features status-based navigation via color-coded tabs (Created, Approved, Invoiced, Pending, Dispatched, Delivered, POD Received, Cancelled) with status-specific table columns and client-side filtering.
-   **POD (Proof of Delivery) Tracking**: Orders include a `podStatus`. Admins can mark POD as "Received," triggering a status change to "POD Received" and recording a timestamp.
-   **Pending Orders**: Out-of-stock items from "Created" or "Approved" orders can be moved to a "Pending" order, linked to the original order via `parentOrderId`, and can be edited.
-   **WhatsApp Sharing**: Generates and shares order details via WhatsApp with status-dependent messaging.

## External Dependencies

### Third-Party Services
-   **Replit Auth**: OpenID Connect authentication service.
-   **PostgreSQL**: Database service provided through Replit.

### Key NPM Packages
-   `drizzle-orm`, `drizzle-kit`: ORM for database interactions and migrations.
-   `xlsx`: Library for parsing Excel files.
-   `@tanstack/react-query`: For server state management in the frontend.
-   `openid-client`: OpenID Connect client for authentication.
-   `passport`, `passport-local`: Authentication middleware for Node.js.
-   `express-session`, `connect-pg-simple`: For session management with PostgreSQL.

### Environment Variables
-   `DATABASE_URL`: PostgreSQL connection string.
-   `SESSION_SECRET`: Secret for session encryption.
-   `REPL_ID`: Automatically provided by Replit.
-   `ISSUER_URL`: OIDC issuer endpoint (defaults to Replit's).
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