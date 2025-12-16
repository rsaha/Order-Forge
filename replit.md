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
- `orders` and `orderItems` - Order tracking
- `sessions` - Session storage for authentication

### Authentication Flow
- Uses Replit's OIDC provider for authentication
- Sessions stored in PostgreSQL with 1-week TTL
- Protected routes use `isAuthenticated` middleware
- User data automatically synced on login via `upsertUser`

### File Processing (Admin Only)
- Only Excel files (.xlsx, .xls) are supported for product uploads
- Required Excel columns: Brand, Product Name, Product SKU ID
- Optional column: MRP (price)
- Files are parsed server-side using the `xlsx` library
- Products are extracted and assigned to the uploading admin's catalog

### Order Import Feature
- **Import Tab**: All users can access the Import tab to paste order text
- **Text Parsing**: Simple pattern matching extracts product names and quantities from free-form text
- **Product Matching**: Parsed items are matched against the user's product catalog by SKU or name
- **Review Flow**: Users can review matched items, adjust quantities, and add to cart

### User Roles
- **Regular Users**: Can use Order tab and Import tab for text-based order entry, manage cart, send orders via WhatsApp/email
- **Admin Users**: Have all regular user access plus Products tab (view catalog) and Upload tab (upload product inventory from Excel files)

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