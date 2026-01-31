import {
  users,
  products,
  userBrandAccess,
  userDeliveryCompanyAccess,
  userPartyAccess,
  orders,
  orderItems,
  brands,
  announcements,
  type User,
  type UpsertUser,
  type Product,
  type InsertProduct,
  type UserBrandAccess,
  type InsertUserBrandAccess,
  type UserDeliveryCompanyAccess,
  type InsertUserDeliveryCompanyAccess,
  type UserPartyAccess,
  type InsertUserPartyAccess,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type UpdateOrder,
  type UpdateProduct,
  type BrandRecord,
  type InsertBrand,
  type Announcement,
  type InsertAnnouncement,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, desc, gte, lte, or, not, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface IStorage {
  // User operations - required for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string): Promise<User | undefined>;
  updateUserName(userId: string, firstName: string | null, lastName: string | null): Promise<User | undefined>;
  updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined>;
  deleteUser(userId: string): Promise<boolean>;
  
  // Product operations
  getProduct(id: string): Promise<Product | undefined>;
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  createProducts(productList: InsertProduct[]): Promise<Product[]>;
  updateProduct(id: string, updates: UpdateProduct): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  
  // User-Brand access operations
  getUserBrandAccess(userId: string): Promise<string[]>;
  setUserBrandAccess(userId: string, brands: string[]): Promise<void>;
  getUserProductsByBrand(userId: string, isAdmin: boolean): Promise<Product[]>;
  getProductsByBrand(brand: string): Promise<Product[]>;
  
  // User-Delivery Company access operations
  getUserDeliveryCompanyAccess(userId: string): Promise<string[]>;
  setUserDeliveryCompanyAccess(userId: string, deliveryCompanies: string[]): Promise<void>;
  updateUserPartyName(userId: string, partyName: string | null): Promise<User | undefined>;
  
  // User-Party access operations (linking salespeople to customer parties)
  getUserPartyAccess(userId: string): Promise<string[]>;
  setUserPartyAccess(userId: string, partyNames: string[]): Promise<void>;
  getAllUserPartyAccess(): Promise<{ userId: string; partyNames: string[] }[]>;
  getOrdersForLinkedParties(userId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  getUserOrders(userId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  getAllOrders(filters?: OrderFilters): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  getOrdersByBrands(brands: string[], filters?: OrderFilters): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  getOrderById(id: string): Promise<Order | undefined>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  updateOrder(id: string, updates: UpdateOrder): Promise<Order | undefined>;
  appendItemsToOrder(orderId: string, items: InsertOrderItem[], discountPercent?: number): Promise<Order | undefined>;
  updateOrderItem(itemId: string, quantity: number, freeQuantity: number): Promise<OrderItem | undefined>;
  deleteOrderItem(itemId: string): Promise<{ deleted: boolean; orderId?: string }>;
  recalculateOrderTotal(orderId: string): Promise<Order | undefined>;
  deleteOrder(id: string): Promise<boolean>;
  getBulkOrderSummary(filters: OrderFilters): Promise<BulkOrderSummary[]>;
  getOrderAnalytics(filters?: OrderFilters): Promise<OrderAnalytics>;
  
  // Brand operations
  getAllBrands(): Promise<BrandRecord[]>;
  getActiveBrands(): Promise<BrandRecord[]>;
  getBrandByName(name: string): Promise<BrandRecord | undefined>;
  getBrandUsage(brandName: string): Promise<{ productCount: number; orderCount: number }>;
  createBrand(brand: InsertBrand): Promise<BrandRecord>;
  updateBrand(id: string, updates: { name?: string; isActive?: boolean }): Promise<BrandRecord | undefined>;
  deleteBrand(id: string): Promise<boolean>;
  seedBrands(): Promise<void>;
  
  // Pending order operations
  createPendingOrder(orderId: string, userId: string): Promise<{ pendingOrder: Order; pendingItems: OrderItem[] } | null>;
  
  // Product popularity operations
  getProductOrderCounts(): Promise<Map<string, number>>;
  getTopProductsByBrand(filters: { fromDate?: Date; toDate?: Date }, limit: number): Promise<{ brand: string; products: { name: string; sku: string; orderCount: number }[] }[]>;
  getUnorderedProductsByBrand(filters: { fromDate?: Date; toDate?: Date }, limit: number): Promise<{ brand: string; products: { name: string; skuCount: number }[] }[]>;
  
  // Top order creator operations
  getTopOrderCreator(filters: { fromDate?: Date; toDate?: Date; brand?: string }): Promise<{ userId: string; userName: string; orderCount: number; totalValue: number } | null>;
  
  // Announcement operations
  getAnnouncements(): Promise<Announcement[]>;
  getActiveAnnouncements(userBrands?: string[]): Promise<Announcement[]>;
  getAnnouncementById(id: string): Promise<Announcement | undefined>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: string, updates: Partial<InsertAnnouncement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: string): Promise<boolean>;
}

export interface StatusMetric {
  count: number;
  value: number;
}

export interface TimeBucketMetric {
  date: string; // ISO date string for the bucket start
  created: StatusMetric;
  invoiced: StatusMetric;
  dispatched: StatusMetric;
  delivered: StatusMetric;
  onTimeCount: number;
  deliveredCount: number;
}

export interface CreatorTimeBucket {
  date: string;
  [creatorName: string]: string | number; // date is string, counts are numbers
}

export interface OrderAnalytics {
  // Overall KPIs
  created: StatusMetric;
  approved: StatusMetric;
  dispatched: StatusMetric;
  delivered: StatusMetric;
  cancelled: StatusMetric;
  // On-time delivery stats
  onTimeDelivery: {
    onTimeCount: number;
    deliveredCount: number;
    percentage: number;
  };
  // Time-series data
  timeSeries: TimeBucketMetric[];
  // Orders by creator over time
  creatorSeries: CreatorTimeBucket[];
  creatorNames: string[];
  // Bucket type used
  bucketType: 'daily' | 'weekly' | 'monthly';
}

export interface OrderFilters {
  status?: string;
  deliveryCompany?: string;
  brand?: string;
  fromDate?: Date;
  toDate?: Date;
  includeActive?: boolean;
}

export interface BulkOrderSummary {
  brand: string;
  deliveryCompany: string;
  status: string;
  orderCount: number;
  totalValue: number;
  totalCases: number;
  orders: Array<{
    id: string;
    partyName: string | null;
    total: string;
    cases: number | null;
    deliveryAddress: string | null;
    dispatchBy: string | null;
    invoiceNumber: string | null;
    invoiceDate: Date | null;
    dispatchDate: Date | null;
    estimatedDeliveryDate: Date | null;
    actualDeliveryDate: Date | null;
    actualOrderValue: string | null;
    deliveredOnTime: boolean | null;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = email.toLowerCase().trim();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const normalizedPhone = phone.trim();
    const [user] = await db.select().from(users).where(eq(users.phone, normalizedPhone));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // First try to find existing user by ID or email
    const existingById = userData.id ? await this.getUser(userData.id) : null;
    const existingByEmail = userData.email ? 
      await db.select().from(users).where(eq(users.email, userData.email)).then(r => r[0]) : null;
    
    const existingUser = existingById || existingByEmail;
    
    // Only update names if new values are provided, otherwise preserve existing
    const updateData = {
      email: userData.email,
      firstName: userData.firstName || existingUser?.firstName || null,
      lastName: userData.lastName || existingUser?.lastName || null,
      profileImageUrl: userData.profileImageUrl,
      updatedAt: new Date(),
    };
    
    if (existingById) {
      // Update existing user by ID
      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userData.id!))
        .returning();
      return updated;
    } else if (existingByEmail) {
      const oldId = existingByEmail.id;
      const newId = userData.id!;
      
      if (oldId !== newId) {
        // ID has changed - need to migrate all foreign key references
        // Use raw SQL to update the user ID since Drizzle doesn't support updating primary keys easily
        // First delete old FK references, then update user, then recreate FK references
        
        // Get existing brand access for this user
        const existingBrandAccess = await db.select().from(userBrandAccess).where(eq(userBrandAccess.userId, oldId));
        
        // Get existing delivery company access for this user
        const existingDeliveryCompanyAccess = await db.select().from(userDeliveryCompanyAccess).where(eq(userDeliveryCompanyAccess.userId, oldId));
        
        // Delete old FK references
        await db.delete(userBrandAccess).where(eq(userBrandAccess.userId, oldId));
        await db.delete(userDeliveryCompanyAccess).where(eq(userDeliveryCompanyAccess.userId, oldId));
        
        // Update orders to point to new ID (orders don't have unique constraint issues)
        await db.update(orders).set({ userId: newId }).where(eq(orders.userId, oldId));
        
        // Delete old user and create new one with the new ID
        await db.delete(users).where(eq(users.id, oldId));
        
        const [newUser] = await db
          .insert(users)
          .values({
            ...userData,
            firstName: userData.firstName || existingByEmail.firstName || null,
            lastName: userData.lastName || existingByEmail.lastName || null,
            isAdmin: existingByEmail.isAdmin,
            role: existingByEmail.role,
            partyName: existingByEmail.partyName,
          })
          .returning();
        
        // Recreate FK references with new user ID
        for (const access of existingBrandAccess) {
          await db.insert(userBrandAccess).values({ userId: newId, brand: access.brand }).onConflictDoNothing();
        }
        for (const access of existingDeliveryCompanyAccess) {
          await db.insert(userDeliveryCompanyAccess).values({ userId: newId, deliveryCompany: access.deliveryCompany }).onConflictDoNothing();
        }
        
        return newUser;
      } else {
        // Same ID, just update the user data
        const [updated] = await db
          .update(users)
          .set(updateData)
          .where(eq(users.email, userData.email!))
          .returning();
        return updated;
      }
    } else {
      // Insert new user
      const [user] = await db
        .insert(users)
        .values(userData)
        .returning();
      return user;
    }
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.email);
  }

  async updateUserRole(userId: string, role: string): Promise<User | undefined> {
    const isAdmin = role === "Admin";
    const [updated] = await db
      .update(users)
      .set({ role, isAdmin, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserName(userId: string, firstName: string | null, lastName: string | null): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ firstName, lastName, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async deleteUser(userId: string): Promise<boolean> {
    // Delete user's brand access
    await db.delete(userBrandAccess).where(eq(userBrandAccess.userId, userId));
    // Delete user's delivery company access
    await db.delete(userDeliveryCompanyAccess).where(eq(userDeliveryCompanyAccess.userId, userId));
    // Delete the user
    const result = await db.delete(users).where(eq(users.id, userId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Product operations
  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async createProducts(productList: InsertProduct[]): Promise<Product[]> {
    if (productList.length === 0) return [];
    return db.insert(products).values(productList).returning();
  }

  async updateProduct(id: string, updates: UpdateProduct): Promise<Product | undefined> {
    const updateData: Record<string, unknown> = {};
    
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.brand !== undefined) updateData.brand = updates.brand;
    if (updates.sku !== undefined) updateData.sku = updates.sku;
    if (updates.size !== undefined) updateData.size = updates.size;
    if (updates.aliases !== undefined) updateData.aliases = updates.aliases;
    if (updates.alias1 !== undefined) updateData.alias1 = updates.alias1;
    if (updates.alias2 !== undefined) updateData.alias2 = updates.alias2;
    if (updates.price !== undefined) updateData.price = updates.price;
    if (updates.distributorPrice !== undefined) updateData.distributorPrice = updates.distributorPrice;
    if (updates.stock !== undefined) updateData.stock = updates.stock;
    if (updates.category !== undefined) updateData.category = updates.category;

    if (Object.keys(updateData).length === 0) {
      return this.getProduct(id);
    }

    const [updated] = await db.update(products).set(updateData).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: string): Promise<boolean> {
    const existing = await this.getProduct(id);
    if (!existing) {
      return false;
    }
    await db.delete(products).where(eq(products.id, id));
    return true;
  }

  // User-Brand access operations
  async getUserBrandAccess(userId: string): Promise<string[]> {
    const access = await db
      .select({ brand: userBrandAccess.brand })
      .from(userBrandAccess)
      .where(eq(userBrandAccess.userId, userId));
    return access.map(a => a.brand);
  }

  async setUserBrandAccess(userId: string, brands: string[]): Promise<void> {
    await db.delete(userBrandAccess).where(eq(userBrandAccess.userId, userId));
    if (brands.length === 0) return;
    
    const entries = brands.map(brand => ({
      userId,
      brand,
    }));
    await db.insert(userBrandAccess).values(entries);
  }

  async getUserProductsByBrand(userId: string, isAdmin: boolean): Promise<Product[]> {
    if (isAdmin) {
      return this.getAllProducts();
    }
    
    const allowedBrands = await this.getUserBrandAccess(userId);
    if (allowedBrands.length === 0) {
      return [];
    }
    
    return db.select().from(products).where(inArray(products.brand, allowedBrands));
  }

  async getProductsByBrand(brand: string): Promise<Product[]> {
    return db.select().from(products).where(eq(products.brand, brand));
  }

  // User-Delivery Company access operations
  async getUserDeliveryCompanyAccess(userId: string): Promise<string[]> {
    const access = await db
      .select({ deliveryCompany: userDeliveryCompanyAccess.deliveryCompany })
      .from(userDeliveryCompanyAccess)
      .where(eq(userDeliveryCompanyAccess.userId, userId));
    return access.map(a => a.deliveryCompany);
  }

  async setUserDeliveryCompanyAccess(userId: string, deliveryCompanies: string[]): Promise<void> {
    await db.delete(userDeliveryCompanyAccess).where(eq(userDeliveryCompanyAccess.userId, userId));
    if (deliveryCompanies.length === 0) return;
    
    const entries = deliveryCompanies.map(deliveryCompany => ({
      userId,
      deliveryCompany,
    }));
    await db.insert(userDeliveryCompanyAccess).values(entries);
  }

  async updateUserPartyName(userId: string, partyName: string | null): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ partyName, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  // User-Party access operations (linking salespeople to customer parties)
  async getUserPartyAccess(userId: string): Promise<string[]> {
    const access = await db
      .select({ partyName: userPartyAccess.partyName })
      .from(userPartyAccess)
      .where(eq(userPartyAccess.userId, userId));
    return access.map(a => a.partyName);
  }

  async setUserPartyAccess(userId: string, partyNames: string[]): Promise<void> {
    await db.delete(userPartyAccess).where(eq(userPartyAccess.userId, userId));
    if (partyNames.length === 0) return;
    
    const entries = partyNames.map(partyName => ({
      userId,
      partyName,
    }));
    await db.insert(userPartyAccess).values(entries);
  }

  async getAllUserPartyAccess(): Promise<{ userId: string; partyNames: string[] }[]> {
    const access = await db
      .select({ userId: userPartyAccess.userId, partyName: userPartyAccess.partyName })
      .from(userPartyAccess);
    
    // Group by userId
    const grouped: Record<string, string[]> = {};
    for (const row of access) {
      if (!grouped[row.userId]) grouped[row.userId] = [];
      grouped[row.userId].push(row.partyName);
    }
    
    return Object.entries(grouped).map(([userId, partyNames]) => ({ userId, partyNames }));
  }

  async getOrdersForLinkedParties(userId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]> {
    // Get parties linked to this user
    const linkedParties = await this.getUserPartyAccess(userId);
    if (linkedParties.length === 0) return [];
    
    // Create alias for the creator
    const creatorUser = alias(users, 'creatorUser');
    
    const result = await db.select({
      id: orders.id,
      userId: orders.userId,
      brand: orders.brand,
      status: orders.status,
      total: orders.total,
      discountPercent: orders.discountPercent,
      whatsappPhone: orders.whatsappPhone,
      email: orders.email,
      partyName: orders.partyName,
      deliveryAddress: orders.deliveryAddress,
      invoiceNumber: orders.invoiceNumber,
      invoiceDate: orders.invoiceDate,
      dispatchDate: orders.dispatchDate,
      dispatchBy: orders.dispatchBy,
      cases: orders.cases,
      specialNotes: orders.specialNotes,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      deliveryCost: orders.deliveryCost,
      deliveryNote: orders.deliveryNote,
      deliveryCompany: orders.deliveryCompany,
      actualOrderValue: orders.actualOrderValue,
      deliveredOnTime: orders.deliveredOnTime,
      approvedBy: orders.approvedBy,
      approvedAt: orders.approvedAt,
      importText: orders.importText,
      podStatus: orders.podStatus,
      podTimestamp: orders.podTimestamp,
      parentOrderId: orders.parentOrderId,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      createdByName: sql<string | null>`concat_ws(' ', ${creatorUser.firstName}, ${creatorUser.lastName})`.as('createdByName'),
      createdByEmail: creatorUser.email,
      actualCreatorName: sql<string | null>`concat_ws(' ', ${creatorUser.firstName}, ${creatorUser.lastName})`.as('actualCreatorName'),
    })
    .from(orders)
    .leftJoin(creatorUser, eq(orders.createdBy, creatorUser.id))
    .where(inArray(orders.partyName, linkedParties))
    .orderBy(desc(orders.createdAt));
    
    return result;
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    if (items.length === 0) return [];
    return db.insert(orderItems).values(items).returning();
  }

  async getUserOrders(userId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]> {
    // Create alias for the creator (who actually made the order, may differ from owner)
    const creatorUser = alias(users, 'creatorUser');
    
    return db.select({
      id: orders.id,
      userId: orders.userId,
      brand: orders.brand,
      status: orders.status,
      total: orders.total,
      discountPercent: orders.discountPercent,
      whatsappPhone: orders.whatsappPhone,
      email: orders.email,
      partyName: orders.partyName,
      deliveryAddress: orders.deliveryAddress,
      invoiceNumber: orders.invoiceNumber,
      invoiceDate: orders.invoiceDate,
      dispatchDate: orders.dispatchDate,
      dispatchBy: orders.dispatchBy,
      cases: orders.cases,
      specialNotes: orders.specialNotes,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      deliveryCost: orders.deliveryCost,
      deliveryNote: orders.deliveryNote,
      deliveryCompany: orders.deliveryCompany,
      actualOrderValue: orders.actualOrderValue,
      deliveredOnTime: orders.deliveredOnTime,
      approvedBy: orders.approvedBy,
      approvedAt: orders.approvedAt,
      importText: orders.importText,
      podStatus: orders.podStatus,
      podTimestamp: orders.podTimestamp,
      parentOrderId: orders.parentOrderId,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      // Order owner info (sales user)
      createdByName: users.firstName,
      createdByEmail: users.email,
      // Actual creator info (may be admin creating on behalf of sales user)
      actualCreatorName: creatorUser.firstName,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(creatorUser, eq(orders.createdBy, creatorUser.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
  }

  private buildOrderConditions(filters?: OrderFilters, additionalConditions: any[] = []): any[] {
    const conditions = [...additionalConditions];
    
    if (filters?.status) {
      conditions.push(eq(orders.status, filters.status));
    }
    if (filters?.deliveryCompany) {
      conditions.push(eq(orders.deliveryCompany, filters.deliveryCompany));
    }
    if (filters?.brand) {
      conditions.push(eq(orders.brand, filters.brand));
    }
    
    if (filters?.includeActive && !filters?.status && (filters.fromDate || filters.toDate)) {
      const activeStatuses = ['Created', 'Approved', 'Invoiced', 'Dispatched'];
      const dateConditions: any[] = [];
      
      if (filters.fromDate) {
        dateConditions.push(gte(orders.createdAt, filters.fromDate));
      }
      if (filters.toDate) {
        const endOfDay = new Date(filters.toDate);
        endOfDay.setHours(23, 59, 59, 999);
        dateConditions.push(lte(orders.createdAt, endOfDay));
      }
      
      const dateRangeCondition = dateConditions.length > 1 ? and(...dateConditions) : dateConditions[0];
      const activeCondition = inArray(orders.status, activeStatuses);
      
      conditions.push(or(dateRangeCondition, activeCondition));
    } else if (filters?.fromDate || filters?.toDate) {
      // Use status-specific date fields for filtering
      // Dispatched orders: filter by dispatchDate
      // Delivered orders: filter by actualDeliveryDate
      // Other statuses: filter by createdAt
      
      if (filters?.status === 'Dispatched') {
        if (filters?.fromDate) {
          conditions.push(gte(orders.dispatchDate, filters.fromDate));
        }
        if (filters?.toDate) {
          const endOfDay = new Date(filters.toDate);
          endOfDay.setHours(23, 59, 59, 999);
          conditions.push(lte(orders.dispatchDate, endOfDay));
        }
      } else if (filters?.status === 'Delivered') {
        if (filters?.fromDate) {
          conditions.push(gte(orders.actualDeliveryDate, filters.fromDate));
        }
        if (filters?.toDate) {
          const endOfDay = new Date(filters.toDate);
          endOfDay.setHours(23, 59, 59, 999);
          conditions.push(lte(orders.actualDeliveryDate, endOfDay));
        }
      } else {
        if (filters?.fromDate) {
          conditions.push(gte(orders.createdAt, filters.fromDate));
        }
        if (filters?.toDate) {
          const endOfDay = new Date(filters.toDate);
          endOfDay.setHours(23, 59, 59, 999);
          conditions.push(lte(orders.createdAt, endOfDay));
        }
      }
    }
    
    return conditions;
  }

  async getAllOrders(filters?: OrderFilters): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]> {
    const conditions = this.buildOrderConditions(filters);
    
    // Create alias for the creator (who actually made the order, may differ from owner)
    const creatorUser = alias(users, 'creatorUser');
    
    const baseQuery = db.select({
      id: orders.id,
      userId: orders.userId,
      brand: orders.brand,
      status: orders.status,
      total: orders.total,
      discountPercent: orders.discountPercent,
      whatsappPhone: orders.whatsappPhone,
      email: orders.email,
      partyName: orders.partyName,
      deliveryAddress: orders.deliveryAddress,
      invoiceNumber: orders.invoiceNumber,
      invoiceDate: orders.invoiceDate,
      dispatchDate: orders.dispatchDate,
      dispatchBy: orders.dispatchBy,
      cases: orders.cases,
      specialNotes: orders.specialNotes,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      deliveryCost: orders.deliveryCost,
      deliveryNote: orders.deliveryNote,
      deliveryCompany: orders.deliveryCompany,
      actualOrderValue: orders.actualOrderValue,
      deliveredOnTime: orders.deliveredOnTime,
      approvedBy: orders.approvedBy,
      approvedAt: orders.approvedAt,
      importText: orders.importText,
      podStatus: orders.podStatus,
      podTimestamp: orders.podTimestamp,
      parentOrderId: orders.parentOrderId,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      // Order owner info (sales user)
      createdByName: users.firstName,
      createdByEmail: users.email,
      // Actual creator info (may be admin creating on behalf of sales user)
      actualCreatorName: creatorUser.firstName,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(creatorUser, eq(orders.createdBy, creatorUser.id))
    .orderBy(desc(orders.createdAt));
    
    if (conditions.length > 0) {
      return baseQuery.where(and(...conditions));
    }
    return baseQuery;
  }

  async getOrdersByBrands(brands: string[], filters?: OrderFilters): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]> {
    if (brands.length === 0) return [];
    
    const conditions = this.buildOrderConditions(filters, [inArray(orders.brand, brands)]);
    
    // Create alias for the creator (who actually made the order, may differ from owner)
    const creatorUser = alias(users, 'creatorUser');
    
    return db.select({
      id: orders.id,
      userId: orders.userId,
      brand: orders.brand,
      status: orders.status,
      total: orders.total,
      discountPercent: orders.discountPercent,
      whatsappPhone: orders.whatsappPhone,
      email: orders.email,
      partyName: orders.partyName,
      deliveryAddress: orders.deliveryAddress,
      invoiceNumber: orders.invoiceNumber,
      invoiceDate: orders.invoiceDate,
      dispatchDate: orders.dispatchDate,
      dispatchBy: orders.dispatchBy,
      cases: orders.cases,
      specialNotes: orders.specialNotes,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      deliveryCost: orders.deliveryCost,
      deliveryNote: orders.deliveryNote,
      deliveryCompany: orders.deliveryCompany,
      actualOrderValue: orders.actualOrderValue,
      deliveredOnTime: orders.deliveredOnTime,
      approvedBy: orders.approvedBy,
      approvedAt: orders.approvedAt,
      importText: orders.importText,
      podStatus: orders.podStatus,
      podTimestamp: orders.podTimestamp,
      parentOrderId: orders.parentOrderId,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      // Order owner info (sales user)
      createdByName: users.firstName,
      createdByEmail: users.email,
      // Actual creator info (may be admin creating on behalf of sales user)
      actualCreatorName: creatorUser.firstName,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(creatorUser, eq(orders.createdBy, creatorUser.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt));
  }

  async getBulkOrderSummary(filters: OrderFilters): Promise<BulkOrderSummary[]> {
    const conditions = this.buildOrderConditions(filters);
    
    let allOrders;
    if (conditions.length > 0) {
      allOrders = await db.select({
        id: orders.id,
        brand: orders.brand,
        status: orders.status,
        total: orders.total,
        cases: orders.cases,
        partyName: orders.partyName,
        deliveryAddress: orders.deliveryAddress,
        deliveryCompany: orders.deliveryCompany,
        dispatchBy: orders.dispatchBy,
        invoiceNumber: orders.invoiceNumber,
        invoiceDate: orders.invoiceDate,
        dispatchDate: orders.dispatchDate,
        estimatedDeliveryDate: orders.estimatedDeliveryDate,
        actualDeliveryDate: orders.actualDeliveryDate,
        actualOrderValue: orders.actualOrderValue,
        deliveredOnTime: orders.deliveredOnTime,
      })
      .from(orders)
      .where(and(...conditions))
      .orderBy(orders.brand, orders.deliveryCompany);
    } else {
      allOrders = await db.select({
        id: orders.id,
        brand: orders.brand,
        status: orders.status,
        total: orders.total,
        cases: orders.cases,
        partyName: orders.partyName,
        deliveryAddress: orders.deliveryAddress,
        deliveryCompany: orders.deliveryCompany,
        dispatchBy: orders.dispatchBy,
        invoiceNumber: orders.invoiceNumber,
        invoiceDate: orders.invoiceDate,
        dispatchDate: orders.dispatchDate,
        estimatedDeliveryDate: orders.estimatedDeliveryDate,
        actualDeliveryDate: orders.actualDeliveryDate,
        actualOrderValue: orders.actualOrderValue,
        deliveredOnTime: orders.deliveredOnTime,
      })
      .from(orders)
      .orderBy(orders.brand, orders.deliveryCompany);
    }
    
    const grouped = new Map<string, BulkOrderSummary>();
    
    for (const order of allOrders) {
      const key = `${order.brand || 'Unknown'}-${order.deliveryCompany || 'Unknown'}-${order.status}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          brand: order.brand || 'Unknown',
          deliveryCompany: order.deliveryCompany || 'Unknown',
          status: order.status,
          orderCount: 0,
          totalValue: 0,
          totalCases: 0,
          orders: [],
        });
      }
      
      const summary = grouped.get(key)!;
      summary.orderCount++;
      summary.totalValue += parseFloat(order.total || '0');
      summary.totalCases += order.cases || 0;
      summary.orders.push({
        id: order.id,
        partyName: order.partyName,
        total: order.total,
        cases: order.cases,
        deliveryAddress: order.deliveryAddress,
        dispatchBy: order.dispatchBy,
        invoiceNumber: order.invoiceNumber,
        invoiceDate: order.invoiceDate,
        dispatchDate: order.dispatchDate,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        actualDeliveryDate: order.actualDeliveryDate,
        actualOrderValue: order.actualOrderValue,
        deliveredOnTime: order.deliveredOnTime,
      });
    }
    
    return Array.from(grouped.values());
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderItems(orderId: string): Promise<(OrderItem & { productName?: string | null; size?: string | null; hsn?: string | null })[]> {
    const items = await db.select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      quantity: orderItems.quantity,
      freeQuantity: orderItems.freeQuantity,
      unitPrice: orderItems.unitPrice,
      productName: products.name,
      size: products.size,
      hsn: products.hsn,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));
    return items;
  }

  async updateOrder(id: string, updates: UpdateOrder): Promise<Order | undefined> {
    const updateData: Record<string, unknown> = {};
    
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.partyName !== undefined) updateData.partyName = updates.partyName;
    if (updates.deliveryAddress !== undefined) updateData.deliveryAddress = updates.deliveryAddress;
    if (updates.invoiceNumber !== undefined) updateData.invoiceNumber = updates.invoiceNumber;
    if (updates.invoiceDate !== undefined) updateData.invoiceDate = updates.invoiceDate ? new Date(updates.invoiceDate) : null;
    if (updates.dispatchDate !== undefined) updateData.dispatchDate = updates.dispatchDate ? new Date(updates.dispatchDate) : null;
    if (updates.dispatchBy !== undefined) updateData.dispatchBy = updates.dispatchBy;
    if (updates.cases !== undefined) updateData.cases = updates.cases;
    if (updates.specialNotes !== undefined) updateData.specialNotes = updates.specialNotes;
    if (updates.estimatedDeliveryDate !== undefined) updateData.estimatedDeliveryDate = updates.estimatedDeliveryDate ? new Date(updates.estimatedDeliveryDate) : null;
    if (updates.actualDeliveryDate !== undefined) updateData.actualDeliveryDate = updates.actualDeliveryDate ? new Date(updates.actualDeliveryDate) : null;
    if (updates.deliveryCost !== undefined) updateData.deliveryCost = updates.deliveryCost;
    if (updates.deliveryNote !== undefined) updateData.deliveryNote = updates.deliveryNote;
    if (updates.deliveryCompany !== undefined) updateData.deliveryCompany = updates.deliveryCompany;
    if (updates.actualOrderValue !== undefined) updateData.actualOrderValue = updates.actualOrderValue;
    if (updates.deliveredOnTime !== undefined) updateData.deliveredOnTime = updates.deliveredOnTime;
    if (updates.approvedBy !== undefined) updateData.approvedBy = updates.approvedBy;
    if (updates.approvedAt !== undefined) updateData.approvedAt = updates.approvedAt ? new Date(updates.approvedAt) : null;
    if (updates.importText !== undefined) updateData.importText = updates.importText;
    if (updates.podStatus !== undefined) updateData.podStatus = updates.podStatus;
    if (updates.podTimestamp !== undefined) updateData.podTimestamp = updates.podTimestamp ? new Date(updates.podTimestamp) : null;
    if (updates.parentOrderId !== undefined) updateData.parentOrderId = updates.parentOrderId;

    if (Object.keys(updateData).length === 0) {
      return this.getOrderById(id);
    }

    const [updated] = await db.update(orders).set(updateData).where(eq(orders.id, id)).returning();
    return updated;
  }

  async appendItemsToOrder(orderId: string, items: InsertOrderItem[], discountPercent?: number): Promise<Order | undefined> {
    if (items.length === 0) {
      return this.getOrderById(orderId);
    }
    
    // Get existing order
    const order = await this.getOrderById(orderId);
    if (!order) return undefined;
    
    // Insert new items
    await db.insert(orderItems).values(items);
    
    // Recalculate total from all items
    const allItems = await db.select({
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    }).from(orderItems).where(eq(orderItems.orderId, orderId));
    
    const subtotal = allItems.reduce((sum, item) => {
      return sum + (Number(item.unitPrice) * item.quantity);
    }, 0);
    
    // Apply discount if provided
    const discount = discountPercent ?? Number(order.discountPercent || 0);
    const newTotal = subtotal * (1 - discount / 100);
    
    // Update order total
    const [updated] = await db.update(orders)
      .set({ total: String(newTotal) })
      .where(eq(orders.id, orderId))
      .returning();
    
    return updated;
  }

  async updateOrderItem(itemId: string, quantity: number, freeQuantity: number): Promise<OrderItem | undefined> {
    const [updated] = await db.update(orderItems)
      .set({ quantity, freeQuantity })
      .where(eq(orderItems.id, itemId))
      .returning();
    return updated;
  }

  async deleteOrderItem(itemId: string): Promise<{ deleted: boolean; orderId?: string }> {
    // First get the item to know the orderId
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId));
    if (!item) return { deleted: false };
    
    const result = await db.delete(orderItems).where(eq(orderItems.id, itemId)).returning();
    return { deleted: result.length > 0, orderId: item.orderId };
  }

  async recalculateOrderTotal(orderId: string): Promise<Order | undefined> {
    const order = await this.getOrderById(orderId);
    if (!order) return undefined;
    
    // Recalculate total from all items
    const allItems = await db.select({
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
    }).from(orderItems).where(eq(orderItems.orderId, orderId));
    
    const subtotal = allItems.reduce((sum, item) => {
      return sum + (Number(item.unitPrice) * item.quantity);
    }, 0);
    
    // Apply existing discount
    const discount = Number(order.discountPercent || 0);
    const newTotal = subtotal * (1 - discount / 100);
    
    // Update order total
    const [updated] = await db.update(orders)
      .set({ total: String(newTotal) })
      .where(eq(orders.id, orderId))
      .returning();
    
    return updated;
  }

  async deleteOrder(id: string): Promise<boolean> {
    // Delete order items first (foreign key constraint)
    await db.delete(orderItems).where(eq(orderItems.orderId, id));
    // Delete the order
    const result = await db.delete(orders).where(eq(orders.id, id)).returning();
    return result.length > 0;
  }

  async getOrderAnalytics(filters?: OrderFilters): Promise<OrderAnalytics> {
    const conditions = this.buildOrderConditions(filters);
    
    // Get all orders with date info and user info for time-series
    const selectFields = {
      status: orders.status,
      actualOrderValue: orders.actualOrderValue,
      total: orders.total,
      deliveredOnTime: orders.deliveredOnTime,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      createdAt: orders.createdAt,
      userId: orders.userId,
      creatorFirstName: users.firstName,
      creatorLastName: users.lastName,
      creatorIsAdmin: users.isAdmin,
    };
    
    let allOrders;
    if (conditions.length > 0) {
      allOrders = await db.select(selectFields)
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(and(...conditions));
    } else {
      allOrders = await db.select(selectFields)
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id));
    }
    
    // Initialize status metrics
    const created: StatusMetric = { count: 0, value: 0 };
    const approved: StatusMetric = { count: 0, value: 0 };
    const dispatched: StatusMetric = { count: 0, value: 0 };
    const delivered: StatusMetric = { count: 0, value: 0 };
    const cancelled: StatusMetric = { count: 0, value: 0 };
    let onTimeCount = 0;
    let deliveredCount = 0;
    
    // Determine date range and bucket type
    const fromDate = filters?.fromDate;
    const toDate = filters?.toDate || new Date();
    let bucketType: 'daily' | 'weekly' | 'monthly' = 'daily';
    
    if (fromDate && toDate) {
      const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 90) {
        bucketType = 'monthly';
      } else if (daysDiff > 31) {
        bucketType = 'weekly';
      }
    }
    
    // Time-series buckets
    const buckets = new Map<string, TimeBucketMetric>();
    
    const getBucketKey = (date: Date): string => {
      if (bucketType === 'monthly') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
      } else if (bucketType === 'weekly') {
        // Get Monday of the week
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(date);
        monday.setDate(diff);
        return monday.toISOString().split('T')[0];
      } else {
        return date.toISOString().split('T')[0];
      }
    };
    
    const getOrCreateBucket = (dateKey: string): TimeBucketMetric => {
      if (!buckets.has(dateKey)) {
        buckets.set(dateKey, {
          date: dateKey,
          created: { count: 0, value: 0 },
          invoiced: { count: 0, value: 0 },
          dispatched: { count: 0, value: 0 },
          delivered: { count: 0, value: 0 },
          onTimeCount: 0,
          deliveredCount: 0,
        });
      }
      return buckets.get(dateKey)!;
    };
    
    for (const order of allOrders) {
      const status = order.status || "Created";
      const value = Number(order.actualOrderValue || order.total || 0);
      const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
      const bucketKey = getBucketKey(orderDate);
      const bucket = getOrCreateBucket(bucketKey);
      
      // Calculate on-time based on estimated vs actual delivery dates
      const isOnTime = order.actualDeliveryDate && order.estimatedDeliveryDate
        ? new Date(order.actualDeliveryDate) <= new Date(order.estimatedDeliveryDate)
        : order.deliveredOnTime;
      
      // Update overall metrics
      switch (status) {
        case 'Created':
          created.count++;
          created.value += value;
          bucket.created.count++;
          bucket.created.value += value;
          break;
        case 'Approved':
          approved.count++;
          approved.value += value;
          break;
        case 'Invoiced':
          bucket.invoiced.count++;
          bucket.invoiced.value += value;
          break;
        case 'Dispatched':
          dispatched.count++;
          dispatched.value += value;
          bucket.dispatched.count++;
          bucket.dispatched.value += value;
          break;
        case 'Delivered':
          delivered.count++;
          delivered.value += value;
          deliveredCount++;
          bucket.delivered.count++;
          bucket.delivered.value += value;
          bucket.deliveredCount++;
          if (isOnTime) {
            onTimeCount++;
            bucket.onTimeCount++;
          }
          break;
        case 'Cancelled':
          cancelled.count++;
          cancelled.value += value;
          break;
      }
    }
    
    // Sort buckets by date
    const sortedTimeSeries = Array.from(buckets.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    );
    
    // Build creator series - track order counts by creator over time
    const creatorBuckets = new Map<string, Map<string, number>>(); // date -> (creatorName -> count)
    const creatorNamesSet = new Set<string>();
    
    for (const order of allOrders) {
      const orderDate = order.createdAt ? new Date(order.createdAt) : new Date();
      const bucketKey = getBucketKey(orderDate);
      
      // Determine creator name - combine all admins into "Admin"
      let creatorName: string;
      if (order.creatorIsAdmin) {
        creatorName = 'Admin';
      } else if (order.creatorFirstName || order.creatorLastName) {
        creatorName = `${order.creatorFirstName || ''} ${order.creatorLastName || ''}`.trim();
      } else {
        creatorName = 'Unknown';
      }
      
      creatorNamesSet.add(creatorName);
      
      if (!creatorBuckets.has(bucketKey)) {
        creatorBuckets.set(bucketKey, new Map());
      }
      const bucket = creatorBuckets.get(bucketKey)!;
      bucket.set(creatorName, (bucket.get(creatorName) || 0) + 1);
    }
    
    // Convert to array format
    const sortedCreatorNames = Array.from(creatorNamesSet).sort();
    const creatorSeries: CreatorTimeBucket[] = Array.from(creatorBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, creators]) => {
        const entry: CreatorTimeBucket = { date };
        for (const name of sortedCreatorNames) {
          entry[name] = creators.get(name) || 0;
        }
        return entry;
      });
    
    return {
      created,
      approved,
      dispatched,
      delivered,
      cancelled,
      onTimeDelivery: {
        onTimeCount,
        deliveredCount,
        percentage: deliveredCount > 0 ? Math.round((onTimeCount / deliveredCount) * 100) : 0,
      },
      timeSeries: sortedTimeSeries,
      creatorSeries,
      creatorNames: sortedCreatorNames,
      bucketType,
    };
  }

  // Brand operations
  async getAllBrands(): Promise<BrandRecord[]> {
    return db.select().from(brands).orderBy(brands.name);
  }

  async getActiveBrands(): Promise<BrandRecord[]> {
    return db.select().from(brands).where(eq(brands.isActive, true)).orderBy(brands.name);
  }

  async getBrandByName(name: string): Promise<BrandRecord | undefined> {
    const [brand] = await db.select().from(brands).where(eq(brands.name, name));
    return brand;
  }

  async getBrandUsage(brandName: string): Promise<{ productCount: number; orderCount: number }> {
    const [productResult] = await db.select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.brand, brandName));
    
    const [orderResult] = await db.select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.brand, brandName));
    
    return {
      productCount: Number(productResult?.count || 0),
      orderCount: Number(orderResult?.count || 0),
    };
  }

  async createBrand(brand: InsertBrand): Promise<BrandRecord> {
    const [newBrand] = await db.insert(brands).values(brand).returning();
    return newBrand;
  }

  async updateBrand(id: string, updates: { name?: string; isActive?: boolean }): Promise<BrandRecord | undefined> {
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    
    if (Object.keys(updateData).length === 0) {
      const [existing] = await db.select().from(brands).where(eq(brands.id, id));
      return existing;
    }
    
    const [updated] = await db.update(brands).set(updateData).where(eq(brands.id, id)).returning();
    return updated;
  }

  async deleteBrand(id: string): Promise<boolean> {
    const result = await db.delete(brands).where(eq(brands.id, id)).returning();
    return result.length > 0;
  }

  async seedBrands(): Promise<void> {
    const existingBrands = await this.getAllBrands();
    if (existingBrands.length > 0) return;
    
    const defaultBrands = [
      "Tynor", "Morison", "Karemed", "UM", "Biostige", 
      "Acusure", "Elmeric", "Blefit", "Shikon", "Samson"
    ];
    
    for (const name of defaultBrands) {
      await db.insert(brands).values({ name, isActive: true }).onConflictDoNothing();
    }
  }

  async createPendingOrder(orderId: string, userId: string): Promise<{ pendingOrder: Order; pendingItems: OrderItem[] } | null> {
    const originalOrder = await this.getOrderById(orderId);
    if (!originalOrder || !["Created", "Approved"].includes(originalOrder.status)) {
      return null;
    }

    const originalItems = await this.getOrderItems(orderId);
    if (originalItems.length === 0) {
      return null;
    }

    const productIds = originalItems.map(item => item.productId);
    const productList = await db.select().from(products).where(inArray(products.id, productIds));
    const productMap = new Map(productList.map(p => [p.id, p]));

    const outOfStockItems = originalItems.filter(item => {
      const product = productMap.get(item.productId);
      return product && product.stock < item.quantity;
    });

    if (outOfStockItems.length === 0) {
      return null;
    }

    let pendingTotal = 0;
    for (const item of outOfStockItems) {
      pendingTotal += parseFloat(item.unitPrice) * item.quantity;
    }

    const discountPercent = parseFloat(originalOrder.discountPercent?.toString() || "0");
    if (discountPercent > 0) {
      pendingTotal = pendingTotal * (1 - discountPercent / 100);
    }

    const [pendingOrder] = await db.insert(orders).values({
      userId,
      brand: originalOrder.brand,
      status: "Pending",
      total: pendingTotal.toFixed(2),
      discountPercent: originalOrder.discountPercent,
      partyName: originalOrder.partyName,
      deliveryAddress: originalOrder.deliveryAddress,
      parentOrderId: orderId,
      podStatus: "Pending",
    }).returning();

    const pendingItemsData: InsertOrderItem[] = outOfStockItems.map(item => ({
      orderId: pendingOrder.id,
      productId: item.productId,
      quantity: item.quantity,
      freeQuantity: item.freeQuantity,
      unitPrice: item.unitPrice,
    }));

    const pendingItems = await this.createOrderItems(pendingItemsData);

    return { pendingOrder, pendingItems };
  }

  async getProductOrderCounts(): Promise<Map<string, number>> {
    const counts = await db
      .select({
        productId: orderItems.productId,
        orderCount: sql<number>`cast(sum(${orderItems.quantity}) as integer)`,
      })
      .from(orderItems)
      .groupBy(orderItems.productId);
    
    const result = new Map<string, number>();
    for (const row of counts) {
      result.set(row.productId, row.orderCount);
    }
    return result;
  }

  async getTopProductsByBrand(filters: { fromDate?: Date; toDate?: Date }, limit: number): Promise<{ brand: string; products: { name: string; sku: string; orderCount: number }[] }[]> {
    // Build date filter conditions
    const dateConditions: any[] = [];
    if (filters.fromDate) {
      dateConditions.push(sql`${orders.createdAt} >= ${filters.fromDate}`);
    }
    if (filters.toDate) {
      dateConditions.push(sql`${orders.createdAt} <= ${filters.toDate}`);
    }

    // Query to get product order counts with brand info, filtered by date
    const query = db
      .select({
        productId: orderItems.productId,
        productName: products.name,
        productSku: products.sku,
        brand: products.brand,
        orderCount: sql<number>`cast(sum(${orderItems.quantity}) as integer)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id));
    
    // Add date filters if present
    let finalQuery = query;
    if (dateConditions.length > 0) {
      finalQuery = query.where(and(...dateConditions)) as any;
    }
    
    const counts = await finalQuery
      .groupBy(orderItems.productId, products.name, products.sku, products.brand)
      .orderBy(sql`sum(${orderItems.quantity}) desc`);

    // Group by brand and take top N per brand
    const brandMap = new Map<string, { name: string; sku: string; orderCount: number }[]>();
    
    for (const row of counts) {
      if (!row.brand) continue;
      
      if (!brandMap.has(row.brand)) {
        brandMap.set(row.brand, []);
      }
      
      const brandProducts = brandMap.get(row.brand)!;
      if (brandProducts.length < limit) {
        brandProducts.push({
          name: row.productName || '',
          sku: row.productSku || '',
          orderCount: row.orderCount,
        });
      }
    }

    // Convert to array sorted by brand name
    const result: { brand: string; products: { name: string; sku: string; orderCount: number }[] }[] = [];
    const sortedBrands = Array.from(brandMap.keys()).sort();
    
    for (const brand of sortedBrands) {
      result.push({
        brand,
        products: brandMap.get(brand)!,
      });
    }

    return result;
  }

  async getUnorderedProductsByBrand(filters: { fromDate?: Date; toDate?: Date }, limit: number): Promise<{ brand: string; products: { name: string; skuCount: number }[] }[]> {
    // Get all product IDs that were ordered in the time frame
    const dateConditions: any[] = [];
    if (filters.fromDate) {
      dateConditions.push(sql`${orders.createdAt} >= ${filters.fromDate}`);
    }
    if (filters.toDate) {
      dateConditions.push(sql`${orders.createdAt} <= ${filters.toDate}`);
    }

    // Subquery to get ordered product IDs
    let orderedProductIdsQuery = db
      .select({ productId: orderItems.productId })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id));
    
    if (dateConditions.length > 0) {
      orderedProductIdsQuery = orderedProductIdsQuery.where(and(...dateConditions)) as any;
    }
    
    const orderedProductIds = await orderedProductIdsQuery;
    const orderedIds = new Set(orderedProductIds.map(r => r.productId));

    // Get all products and filter out those that were ordered
    const allProducts = await db.select().from(products);
    
    // Group by brand, then by product name (not SKU) and count SKUs per name
    const brandMap = new Map<string, Map<string, { name: string; skuCount: number }>>();
    
    for (const product of allProducts) {
      if (orderedIds.has(product.id)) continue; // Skip ordered products
      
      if (!brandMap.has(product.brand)) {
        brandMap.set(product.brand, new Map());
      }
      
      const productMap = brandMap.get(product.brand)!;
      if (!productMap.has(product.name)) {
        productMap.set(product.name, {
          name: product.name,
          skuCount: 1,
        });
      } else {
        productMap.get(product.name)!.skuCount++;
      }
    }

    // Convert to result format: array of { brand, products[] }
    const result: { brand: string; products: { name: string; skuCount: number }[] }[] = [];
    const sortedBrands = Array.from(brandMap.keys()).sort();
    
    for (const brand of sortedBrands) {
      const productMap = brandMap.get(brand)!;
      const products = Array.from(productMap.values())
        .sort((a, b) => {
          if (b.skuCount !== a.skuCount) return b.skuCount - a.skuCount;
          return a.name.localeCompare(b.name);
        })
        .slice(0, limit);
      
      if (products.length > 0) {
        result.push({ brand, products });
      }
    }

    return result;
  }
  
  async getTopOrderCreator(filters: { fromDate?: Date; toDate?: Date; brand?: string }): Promise<{ userId: string; userName: string; orderCount: number; totalValue: number } | null> {
    // Count all non-cancelled orders, exclude admin users
    const conditions: any[] = [
      sql`${orders.status} != 'Cancelled'`,
      eq(users.isAdmin, false),
    ];
    
    if (filters.fromDate) {
      conditions.push(sql`${orders.createdAt} >= ${filters.fromDate}`);
    }
    if (filters.toDate) {
      conditions.push(sql`${orders.createdAt} <= ${filters.toDate}`);
    }
    if (filters.brand) {
      conditions.push(eq(orders.brand, filters.brand));
    }
    
    const result = await db
      .select({
        userId: orders.userId,
        userName: users.firstName,
        orderCount: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${orders.total}), 0)::numeric`,
      })
      .from(orders)
      .innerJoin(users, eq(orders.userId, users.id))
      .where(and(...conditions))
      .groupBy(orders.userId, users.firstName)
      .orderBy(sql`count(*) desc`)
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    return {
      userId: result[0].userId,
      userName: result[0].userName || 'Unknown',
      orderCount: result[0].orderCount,
      totalValue: Number(result[0].totalValue) || 0,
    };
  }
  
  async getAnnouncements(): Promise<Announcement[]> {
    return await db.select().from(announcements).orderBy(desc(announcements.createdAt));
  }
  
  async getActiveAnnouncements(userBrands?: string[]): Promise<Announcement[]> {
    const now = new Date();
    const allActive = await db
      .select()
      .from(announcements)
      .where(eq(announcements.isActive, true))
      .orderBy(desc(announcements.createdAt));
    
    return allActive.filter(ann => {
      if (ann.expiresAt && new Date(ann.expiresAt) < now) {
        return false;
      }
      if (ann.targetBrands === 'all') {
        return true;
      }
      if (!userBrands || userBrands.length === 0) {
        return ann.targetBrands === 'all';
      }
      try {
        const targetBrandsArray = JSON.parse(ann.targetBrands);
        return targetBrandsArray.some((brand: string) => 
          userBrands.some(ub => ub.toLowerCase() === brand.toLowerCase())
        );
      } catch {
        return ann.targetBrands === 'all';
      }
    });
  }
  
  async getAnnouncementById(id: string): Promise<Announcement | undefined> {
    const result = await db.select().from(announcements).where(eq(announcements.id, id));
    return result[0];
  }
  
  async createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement> {
    const result = await db.insert(announcements).values(announcement).returning();
    return result[0];
  }
  
  async updateAnnouncement(id: string, updates: Partial<InsertAnnouncement>): Promise<Announcement | undefined> {
    const result = await db
      .update(announcements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return result[0];
  }
  
  async deleteAnnouncement(id: string): Promise<boolean> {
    const result = await db.delete(announcements).where(eq(announcements.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
