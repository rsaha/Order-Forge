import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  integer,
  numeric,
  text,
  boolean,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User roles
export const USER_ROLES = ["Customer", "User", "BrandAdmin", "Admin"] as const;
export type UserRole = typeof USER_ROLES[number];

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  phone: varchar("phone").unique(), // Phone number for phone/password auth
  passwordHash: varchar("password_hash"), // Hashed password for phone/password auth
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false),
  role: varchar("role").default("User"),
  partyName: varchar("party_name"), // For Customer role - auto-populated party name
  linkedSalesUserId: varchar("linked_sales_user_id"), // For Customer role - linked sales user
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sku: varchar("sku").notNull(),
  name: varchar("name").notNull(),
  brand: varchar("brand").notNull(),
  size: varchar("size"),
  hsn: varchar("hsn"),
  aliases: text("aliases"),
  alias1: varchar("alias1"),
  alias2: varchar("alias2"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  distributorPrice: numeric("distributor_price", { precision: 10, scale: 2 }),
  stock: integer("stock").notNull().default(0),
  caseSize: integer("case_size").notNull().default(1),
  category: varchar("category"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Order status values
export const ORDER_STATUSES = ["Online", "Created", "Approved", "Backordered", "Pending", "Invoiced", "PaymentPending", "Dispatched", "Delivered", "PODReceived", "Cancelled"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

// POD (Proof of Delivery) status values
export const POD_STATUSES = ["Pending", "Received", "Digital Received"] as const;
export type PodStatus = typeof POD_STATUSES[number];

// Brand options (legacy - kept for backwards compatibility, use brands table instead)
export const BRAND_OPTIONS = ["Tynor", "Morison", "Karemed", "UM", "Biostige", "Acusure", "Elmeric", "Blefit", "Shikon", "Samson"] as const;
export type Brand = typeof BRAND_OPTIONS[number];

// Brands dimension table - for dynamic brand management
export const brands = pgTable("brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Delivery company options
export const DELIVERY_COMPANY_OPTIONS = ["Guided", "Xmaple", "Elmeric", "Guided Kol"] as const;
export type DeliveryCompany = typeof DELIVERY_COMPANY_OPTIONS[number];

// Announcement priority levels
export const ANNOUNCEMENT_PRIORITIES = ["info", "warning", "urgent"] as const;
export type AnnouncementPriority = typeof ANNOUNCEMENT_PRIORITIES[number];

// Announcements table - for admin-managed announcements
export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  message: text("message").notNull(),
  priority: varchar("priority").notNull().default("info"),
  targetBrands: text("target_brands").notNull().default("all"), // "all" or JSON array of brand names
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User-Brand access - which brands each user can see
export const userBrandAccess = pgTable("user_brand_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  brand: varchar("brand").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_brand_access_user").on(table.userId),
]);

// User-Delivery Company access - which delivery companies each user (especially Customers) can use
export const userDeliveryCompanyAccess = pgTable("user_delivery_company_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  deliveryCompany: varchar("delivery_company").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_delivery_company_access_user").on(table.userId),
]);

// User-Party access - which customer parties each salesperson can see/manage orders for
export const userPartyAccess = pgTable("user_party_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  partyName: varchar("party_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_party_access_user").on(table.userId),
  index("idx_user_party_access_party").on(table.partyName),
]);

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id), // Order owner (sales user)
  createdBy: varchar("created_by").references(() => users.id), // Who actually created the order (for audit)
  brand: varchar("brand").notNull(),
  status: varchar("status").notNull().default("Created"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).default("0"),
  whatsappPhone: varchar("whatsapp_phone"),
  email: varchar("email"),
  partyName: varchar("party_name"),
  deliveryAddress: text("delivery_address"),
  invoiceNumber: varchar("invoice_number"),
  invoiceDate: timestamp("invoice_date"),
  dispatchDate: timestamp("dispatch_date"),
  dispatchBy: varchar("dispatch_by"),
  cases: integer("cases"),
  cartonSize: varchar("carton_size", { length: 20 }),
  specialNotes: text("special_notes"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  actualDeliveryDate: timestamp("actual_delivery_date"),
  deliveryCost: numeric("delivery_cost", { precision: 10, scale: 2 }),
  deliveryNote: text("delivery_note"),
  deliveryCompany: varchar("delivery_company"),
  actualOrderValue: numeric("actual_order_value", { precision: 10, scale: 2 }),
  deliveredOnTime: boolean("delivered_on_time"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  importText: text("import_text"), // Original pasted text from Import tab
  podStatus: varchar("pod_status").default("Pending"), // POD status: Pending or Received
  podTimestamp: timestamp("pod_timestamp"), // When POD was marked as Received
  parentOrderId: varchar("parent_order_id"), // Reference to parent order for forked pending orders
  createdAt: timestamp("created_at").defaultNow(),
});

// Order items table
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  freeQuantity: integer("free_quantity").notNull().default(0),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  caseSize: integer("case_size").notNull().default(1),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userBrandAccess: many(userBrandAccess),
  orders: many(orders),
}));

export const userBrandAccessRelations = relations(userBrandAccess, ({ one }) => ({
  user: one(users, {
    fields: [userBrandAccess.userId],
    references: [users.id],
  }),
}));

export const userDeliveryCompanyAccessRelations = relations(userDeliveryCompanyAccess, ({ one }) => ({
  user: one(users, {
    fields: [userDeliveryCompanyAccess.userId],
    references: [users.id],
  }),
}));

export const userPartyAccessRelations = relations(userPartyAccess, ({ one }) => ({
  user: one(users, {
    fields: [userPartyAccess.userId],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

// Brand forecast settings table - per-brand configuration for demand forecasting
export const brandForecastSettings = pgTable("brand_forecast_settings", {
  brand: varchar("brand").primaryKey(),
  leadTimeDays: integer("lead_time_days").notNull().default(2),
  nonMovingDays: integer("non_moving_days").notNull().default(60),
  slowMovingDays: integer("slow_moving_days").notNull().default(90),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// Brand sales snapshots — periodic saves of the 90-day sales analysis per brand
export const brandSalesSnapshots = pgTable("brand_sales_snapshots", {
  id: serial("id").primaryKey(),
  brand: varchar("brand").notNull(),
  snapshotDate: timestamp("snapshot_date").defaultNow().notNull(),
  results: jsonb("results").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Brand stock imports — history of each stock import for a brand
export const brandStockImports = pgTable("brand_stock_imports", {
  id: serial("id").primaryKey(),
  brand: varchar("brand").notNull(),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  updatedCount: integer("updated_count").default(0),
  unmatchedCount: integer("unmatched_count").default(0),
  updatedProducts: jsonb("updated_products"),
  unmatched: jsonb("unmatched"),
});

// Transport carriers table
export const transportCarriers = pgTable("transport_carriers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(),
  type: varchar("type").notNull().default("flat_per_location"), // flat_per_location | per_parcel
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Transport rates table
export const transportRates = pgTable("transport_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carrierId: varchar("carrier_id").notNull().references(() => transportCarriers.id, { onDelete: "cascade" }),
  location: varchar("location").notNull(),
  rate: numeric("rate", { precision: 10, scale: 2 }),
  minRate: numeric("min_rate", { precision: 10, scale: 2 }),
  maxRate: numeric("max_rate", { precision: 10, scale: 2 }),
  tat: varchar("tat"),
  rateNote: varchar("rate_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transportCarriersRelations = relations(transportCarriers, ({ many }) => ({
  rates: many(transportRates),
}));

export const transportRatesRelations = relations(transportRates, ({ one }) => ({
  carrier: one(transportCarriers, {
    fields: [transportRates.carrierId],
    references: [transportCarriers.id],
  }),
}));

export type TransportCarrier = typeof transportCarriers.$inferSelect;
export type TransportRate = typeof transportRates.$inferSelect;
export const TRANSPORT_CARRIER_TYPES = ["flat_per_location", "per_parcel"] as const;
export const insertTransportCarrierSchema = createInsertSchema(transportCarriers).omit({ id: true, createdAt: true }).extend({
  type: z.enum(TRANSPORT_CARRIER_TYPES),
});
export const insertTransportRateSchema = createInsertSchema(transportRates).omit({ id: true, createdAt: true });
export type InsertTransportCarrier = z.infer<typeof insertTransportCarrierSchema>;
export type InsertTransportRate = z.infer<typeof insertTransportRateSchema>;

// Insert schemas
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertUserBrandAccessSchema = createInsertSchema(userBrandAccess).omit({ id: true, createdAt: true });
export const insertUserDeliveryCompanyAccessSchema = createInsertSchema(userDeliveryCompanyAccess).omit({ id: true, createdAt: true });
export const insertUserPartyAccessSchema = createInsertSchema(userPartyAccess).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertBrandSchema = createInsertSchema(brands).omit({ id: true, createdAt: true });
export const insertBrandForecastSettingsSchema = createInsertSchema(brandForecastSettings).omit({ updatedAt: true });

// Update schema for orders (all fields optional except id)
export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  brand: z.string().nullable().optional(),
  partyName: z.string().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dispatchDate: z.string().nullable().optional(),
  dispatchBy: z.string().nullable().optional(),
  cases: z.number().nullable().optional(),
  cartonSize: z.string().nullable().optional(),
  specialNotes: z.string().nullable().optional(),
  estimatedDeliveryDate: z.string().nullable().optional(),
  actualDeliveryDate: z.string().nullable().optional(),
  deliveryCost: z.string().nullable().optional(),
  deliveryNote: z.string().nullable().optional(),
  deliveryCompany: z.enum(DELIVERY_COMPANY_OPTIONS).nullable().optional(),
  actualOrderValue: z.string().nullable().optional(),
  deliveredOnTime: z.boolean().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  importText: z.string().nullable().optional(),
  podStatus: z.enum(POD_STATUSES).nullable().optional(),
  podTimestamp: z.string().nullable().optional(),
  parentOrderId: z.string().nullable().optional(),
});
export type UpdateOrder = z.infer<typeof updateOrderSchema>;

// Update schema for products (all fields optional for partial updates)
export const updateProductSchema = z.object({
  name: z.string().optional(),
  brand: z.string().optional(),
  sku: z.string().optional(),
  size: z.string().nullable().optional(),
  aliases: z.string().nullable().optional(),
  alias1: z.string().nullable().optional(),
  alias2: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  distributorPrice: z.union([z.string(), z.number()]).transform(v => String(v)).nullable().optional(),
  stock: z.union([z.string(), z.number()]).transform(v => typeof v === 'string' ? parseInt(v) || 0 : v).optional(),
  caseSize: z.number().int().min(1).optional(),
  category: z.string().nullable().optional(),
});
export type UpdateProduct = z.infer<typeof updateProductSchema>;

// Announcement insert schema
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type UserBrandAccess = typeof userBrandAccess.$inferSelect;
export type InsertUserBrandAccess = z.infer<typeof insertUserBrandAccessSchema>;
export type UserDeliveryCompanyAccess = typeof userDeliveryCompanyAccess.$inferSelect;
export type InsertUserDeliveryCompanyAccess = z.infer<typeof insertUserDeliveryCompanyAccessSchema>;
export type UserPartyAccess = typeof userPartyAccess.$inferSelect;
export type InsertUserPartyAccess = z.infer<typeof insertUserPartyAccessSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type BrandRecord = typeof brands.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type BrandForecastSettings = typeof brandForecastSettings.$inferSelect;
export type InsertBrandForecastSettings = z.infer<typeof insertBrandForecastSettingsSchema>;
export type BrandSalesSnapshot = typeof brandSalesSnapshots.$inferSelect;
export type BrandStockImport = typeof brandStockImports.$inferSelect;
