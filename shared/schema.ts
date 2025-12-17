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

// User storage table - required for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").default(false),
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
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  category: varchar("category"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User-Product assignments - which products each user can access
export const userProducts = pgTable("user_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_products_user").on(table.userId),
  index("idx_user_products_product").on(table.productId),
]);

// Order status values
export const ORDER_STATUSES = ["Created", "Pending", "Invoiced", "Dispatched", "Delivered", "Cancelled"] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
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
  remarks: text("remarks"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  actualDeliveryDate: timestamp("actual_delivery_date"),
  deliveryCost: numeric("delivery_cost", { precision: 10, scale: 2 }),
  deliveryNote: text("delivery_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Order items table
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userProducts: many(userProducts),
  orders: many(orders),
}));

export const productsRelations = relations(products, ({ many }) => ({
  userProducts: many(userProducts),
  orderItems: many(orderItems),
}));

export const userProductsRelations = relations(userProducts, ({ one }) => ({
  user: one(users, {
    fields: [userProducts.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [userProducts.productId],
    references: [products.id],
  }),
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

// Insert schemas
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertUserProductSchema = createInsertSchema(userProducts).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });

// Update schema for orders (all fields optional except id)
export const updateOrderSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  partyName: z.string().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dispatchDate: z.string().nullable().optional(),
  dispatchBy: z.string().nullable().optional(),
  cases: z.number().nullable().optional(),
  remarks: z.string().nullable().optional(),
  estimatedDeliveryDate: z.string().nullable().optional(),
  actualDeliveryDate: z.string().nullable().optional(),
  deliveryCost: z.string().nullable().optional(),
  deliveryNote: z.string().nullable().optional(),
});
export type UpdateOrder = z.infer<typeof updateOrderSchema>;

// Update schema for products (all fields optional for partial updates)
export const updateProductSchema = z.object({
  name: z.string().optional(),
  brand: z.string().optional(),
  sku: z.string().optional(),
  size: z.string().nullable().optional(),
  price: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
  stock: z.union([z.string(), z.number()]).transform(v => typeof v === 'string' ? parseInt(v) || 0 : v).optional(),
  category: z.string().nullable().optional(),
});
export type UpdateProduct = z.infer<typeof updateProductSchema>;

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type UserProduct = typeof userProducts.$inferSelect;
export type InsertUserProduct = z.infer<typeof insertUserProductSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
