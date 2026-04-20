# Order Entry App

## Overview

This project is a productivity-focused order entry application designed for sales representatives and small businesses. Its primary purpose is to streamline the order creation and management process, from inventory upload to order generation and communication. Key capabilities include Excel/CSV inventory uploads, product search and selection for order creation, and order communication via WhatsApp or email. The application emphasizes a mobile-first, touch-optimized user experience, adhering to Material Design principles. The business vision is to empower sales teams and small businesses with an intuitive tool to enhance sales efficiency and order fulfillment, addressing a market need for streamlined digital order management.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React 18 with TypeScript, Wouter for routing, and TanStack React Query for server state management. Styling is handled with Tailwind CSS and shadcn/ui (New York style). Vite is the build tool, including custom Replit integration plugins. The architecture is pages-based, separating reusable UI components from feature-specific ones.

### Backend
The backend is built with Node.js, Express, and TypeScript (ESM modules), providing a RESTful JSON API. Authentication uses Replit Auth (OpenID Connect) via Passport.js, with session management backed by PostgreSQL using `connect-pg-simple`. Multer handles file uploads. The design cleanly separates routes, storage logic, and authentication.

### Data Storage
PostgreSQL is the primary database, managed with Drizzle ORM and Drizzle Kit for migrations. The `shared/schema.ts` defines the schema, shared across frontend and backend, including tables for users, products, user-specific catalogs, orders, order items, and sessions.

### Authentication
Authentication supports Google OAuth 2.0 (`passport-google-oauth20`) and phone/password for admin-created users. Both use PostgreSQL-backed session management. Admin status is determined by `ADMIN_EMAILS`.

### Core Features
-   **Inventory Management**: Admins can upload product inventory via Excel (XLSX, XLS) with required fields like Brand, Name, Product SKU ID, Size, and optional MRP. Products are assigned to the admin's catalog.
-   **Order Creation**: Users can create orders by searching/selecting products, importing from text (parsing free-form text to match products), or admins importing from Excel (extracting invoice details).
-   **Order Workflow & Statuses**: Orders progress through various color-coded statuses (Online, Created, Approved, Backordered, Pending, Invoiced, PaymentPending, Dispatched, Delivered, POD Received, Cancelled). "Online" orders require admin approval. Out-of-stock items can be moved to "Pending" orders, linked to the original. "PaymentPending" sits between Invoiced and Dispatched — representing invoiced orders awaiting payment before dispatch (fuchsia color theme); transitions to Dispatched via the same dispatch dialog as Invoiced orders.
-   **User Roles & Permissions**: Supports Regular Users, Brand Admins (view/change status for assigned brands), and Admin Users (full access, product/user management, create orders for sales users).
-   **Sales & Customer Relationship Management**: Admins can link salespeople to customer parties (`userPartyAccess`) and customer users to sales users (`linkedSalesUserId`), enabling role-based viewing and modification of orders.
-   **User Management**: Comprehensive admin interface for user search, filtering, role assignment, brand/party access management, password resets, and account merging. Account merging is transactional, transferring all related data and deleting the source user.
-   **Communication**: Generates and shares order details via WhatsApp with status-dependent messaging.
-   **Announcements**: Admin-managed, database-stored announcements with priority, brand targeting, expiration, and user dismissal.
-   **Analytics Dashboard**: Admin-only view with KPIs (Total Orders, Value Invoiced, Transport Cost, On-Time Delivery), order flow funnel, velocity metrics, and delivery cost breakdown. Filters include date range, brand, delivery company, and order creator.
-   **Stock Forecast Dashboard**: Admin-only feature for per-brand stock forecasting based on sales analysis (3-month moving average + ETS). Supports two-phase stock upload and snapshot history.
-   **Role-Based Navigation**: Navigation adapts to user roles (Admin, BrandAdmin, User, Customer), showing relevant pages like "Orders Management," "My Orders," "Analytics," "Products," and "Inventory."
-   **Transport Prediction**: Admin-only tab for dispatching invoiced orders, integrating with `transportCarriers` and `transportRates` tables. Predicts costs based on carrier types (flat per location, per parcel by zone). Allows bulk assignment and dispatch. Auto-suggestion engine (5-rule priority chain) suggests the best carrier per unassigned party group. Supports bulk auto-assign-all and export to Excel dispatch sheet.
-   **Carton Tracking**: Orders track carton counts as separate small and large fields (`small_cartons`, `large_cartons` integer columns). The backend auto-derives the total `cases` as their sum (for transport cost allocation). Old orders retain their original `cases` value and are displayed with backward-compatible fallback. The UI shows "Xs + Yl" format for new orders and just the total for legacy orders.
-   **Product Photos & Brand Logos**: Optional image support with zero-cost storage. Admins can attach photos to products and logos to brands via URL paste (including Google Drive share links auto-transformed to thumbnails), or upload from device (client-side canvas compression to ≤100 KB JPEG stored as base64). Images appear as thumbnails in the product catalog (ProductCard, ProductCardCompact) and brand logos on the Brands management page. New columns: `products.photo_url`, `brands.logo_url`. Backend: `PATCH /api/products/:id` accepts `photoUrl`; `PUT /api/admin/brands/:id/logo` sets logo. Shared utilities: `client/src/lib/imageUtils.ts` (transformImageUrl, compressImageFile). Reusable `ImagePickerDialog` component.

## External Dependencies

### Third-Party Services
-   **Google OAuth 2.0**: Used for direct Google login.
-   **PostgreSQL**: Primary database service.

### Key NPM Packages
-   `drizzle-orm`, `drizzle-kit`: ORM for database interactions and migrations.
-   `xlsx`: For parsing Excel files.
-   `@tanstack/react-query`: For frontend server state management.
-   `passport`, `passport-google-oauth20`: Authentication middleware for Node.js.
-   `express-session`, `connect-pg-simple`: For session management.

### Environment Variables
-   `DATABASE_URL`: PostgreSQL connection string.
-   `SESSION_SECRET`: Session encryption secret.
-   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth 2.0 credentials.
-   `CASHDESK_API_KEY`: API key for external API authentication.

### Configuration API Endpoints (Internal)
Authenticated, admin-only PUT/DELETE; GET is authenticated read-only. Used to drive white-label customization without code changes.
-   `GET/PUT /api/brands`, `/api/admin/brands/:id`: Brand list with `requiresPartyVerification`, `requiresTransportAssignment`, `excludeFromAnalytics`, `displayOrder` flags.
-   `GET/PUT /api/delivery-companies` (`?brand=` for brand-scoped list).
-   `GET /api/dispatcher-patterns` (read-only public to authed users; admin CRUD via `/api/admin/dispatcher-patterns`): Pattern → type (self|hand|zero_cost|transport).
-   `GET/PUT /api/order-status-config`: SLA days, archived flag, sort order per status.
-   `GET/PUT /api/carton-sizes`: Carton size labels.

### Branding (Frontend)
`client/src/config/brand.ts` reads `VITE_APP_FULL_NAME`, `VITE_APP_SHORT_NAME`, `VITE_APP_TAGLINE`, `VITE_APP_FAVICON_URL` with safe defaults. `useBrandConfig` hook exposes `useBrands`, `useBrandConfig(brand)`, `useDeliveryCompanies(brand?)`.

### External API Endpoints
All external API endpoints require `X-API-KEY` header authentication using `CASHDESK_API_KEY`.
-   `GET /api/sales/summary`: Retrieves summarized order data by brand within a date range.
-   `GET /api/sales/party/:partyName`: Fetches detailed order information for a specific party within a date range.
-   `GET /api/sales/brand/:brandName`: Provides total order value for a given brand within a date range.
-   `POST /api/orders/external`: Creates an order from an external system, matching items by product name within a specified brand.