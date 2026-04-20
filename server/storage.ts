import {
  users,
  products,
  userBrandAccess,
  userDeliveryCompanyAccess,
  userPartyAccess,
  orders,
  orderItems,
  brands,
  deliveryCompanies,
  brandDeliveryCompanies,
  dispatcherPatterns,
  orderStatusConfig,
  cartonSizes,
  announcements,
  brandForecastSettings,
  brandSalesSnapshots,
  brandStockImports,
  transportCarriers,
  transportRates,
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
  type DispatcherType,
  type Announcement,
  type InsertAnnouncement,
  type BrandForecastSettings,
  type TransportCarrier,
  type TransportRate,
  type InsertTransportCarrier,
  type InsertTransportRate,
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
  getMergePreview(sourceId: string, targetId: string): Promise<{
    source: { user: User; orderCount: number; brandAccess: string[]; deliveryCompanyAccess: string[]; partyAccess: string[]; linkedCustomerCount: number };
    target: { user: User; orderCount: number; brandAccess: string[]; deliveryCompanyAccess: string[]; partyAccess: string[]; linkedCustomerCount: number };
  } | null>;
  mergeUsers(sourceId: string, targetId: string): Promise<{ ordersTransferred: number; brandsAdded: string[]; deliveryCompaniesAdded: string[]; partiesAdded: string[]; customersTransferred: number; sessionsCleared: number }>;
  
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
  
  // Linked sales user operations (linking customer users to sales users)
  updateUserLinkedSalesUser(userId: string, linkedSalesUserId: string | null): Promise<User | undefined>;
  getLinkedCustomers(salesUserId: string): Promise<User[]>;
  salesUserHasAccessToOrderOwner(salesUserId: string, orderOwnerId: string): Promise<boolean>;
  getOrdersForLinkedCustomers(salesUserId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  
  // User-Party access operations (linking salespeople to customer parties)
  getUserPartyAccess(userId: string): Promise<string[]>;
  setUserPartyAccess(userId: string, partyNames: string[]): Promise<void>;
  getAllUserPartyAccess(): Promise<{ userId: string; partyNames: string[] }[]>;
  getOrdersForLinkedParties(userId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  getUserOrders(userId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  getCustomerOrders(userId: string, partyName?: string | null): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]>;
  getAllOrders(filters?: OrderFilters): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null; ownerRole?: string | null })[]>;
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
  getOrderBrands(): Promise<string[]>;
  getBrandByName(name: string): Promise<BrandRecord | undefined>;
  getBrandUsage(brandName: string): Promise<{ productCount: number; orderCount: number }>;
  createBrand(brand: InsertBrand): Promise<BrandRecord>;
  updateBrand(id: string, updates: { name?: string; isActive?: boolean }): Promise<BrandRecord | undefined>;
  updateBrandLogo(id: string, logoUrl: string | null): Promise<BrandRecord | undefined>;
  deleteBrand(id: string): Promise<boolean>;
  seedBrands(): Promise<void>;

  // Configurability: delivery companies, brand-delivery mapping, dispatcher patterns, status config, carton sizes
  getDeliveryCompanies(activeOnly?: boolean): Promise<{ id: string; name: string; isActive: boolean; displayOrder: number }[]>;
  upsertDeliveryCompany(input: { id?: string; name: string; isActive?: boolean; displayOrder?: number }): Promise<void>;
  deleteDeliveryCompany(id: string): Promise<boolean>;
  getDeliveryCompaniesForBrand(brand: string): Promise<string[]>;
  setBrandDeliveryCompanies(brand: string, companies: string[]): Promise<void>;
  getDispatcherPatterns(): Promise<{ id: string; pattern: string; type: DispatcherType; isActive: boolean }[]>;
  upsertDispatcherPattern(input: { id?: string; pattern: string; type: DispatcherType; isActive?: boolean }): Promise<void>;
  deleteDispatcherPattern(id: string): Promise<boolean>;
  classifyDispatcher(name: string | null | undefined): Promise<DispatcherType>;
  getOrderStatusConfig(): Promise<{ status: string; slaDays: number | null; isArchived: boolean; sortOrder: number }[]>;
  updateOrderStatusConfig(status: string, updates: { slaDays?: number | null; isArchived?: boolean; sortOrder?: number }): Promise<void>;
  getCartonSizes(activeOnly?: boolean): Promise<{ id: string; name: string; sortOrder: number; isActive: boolean }[]>;
  upsertCartonSize(input: { id?: string; name: string; sortOrder?: number; isActive?: boolean }): Promise<void>;
  deleteCartonSize(id: string): Promise<boolean>;

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

  // Brand forecast settings operations
  getBrandForecastSettings(brand: string): Promise<BrandForecastSettings | undefined>;
  upsertBrandForecastSettings(brand: string, settings: { leadTimeDays: number; nonMovingDays: number; slowMovingDays: number }, updatedBy?: string): Promise<BrandForecastSettings>;

  // Stock operations
  updateProductsStock(updates: Array<{ productId: string; stock: number }>): Promise<{ count: number; updatedProducts: Product[] }>;
  getProductsForForecast(brand: string): Promise<Product[]>;
  getSoldQuantitiesByProduct(brand: string, fromDate: Date, toDate: Date): Promise<Array<{ productId: string; quantity: number; lastSaleDate: Date }>>;
  getLastSaleDatesByProduct(brand: string, fromDate: Date, toDate: Date): Promise<Map<string, Date>>;

  // Sales snapshot operations
  saveSalesSnapshot(brand: string, results: unknown[]): Promise<{ id: number; snapshotDate: Date }>;
  getSalesSnapshots(brand: string, limit?: number): Promise<Array<{ id: number; brand: string; snapshotDate: Date; createdAt: Date | null }>>;

  // Stock import history operations
  saveStockImport(brand: string, data: { updatedCount: number; unmatchedCount: number; updatedProducts: unknown[]; unmatched: unknown[] }): Promise<{ id: number; importedAt: Date }>;
  getStockImports(brand: string, limit?: number): Promise<Array<{ id: number; brand: string; importedAt: Date; updatedCount: number | null; unmatchedCount: number | null }>>;

  // Transport carrier operations
  getTransportCarriers(): Promise<(TransportCarrier & { rates: TransportRate[] })[]>;
  createTransportCarrier(data: InsertTransportCarrier): Promise<TransportCarrier>;
  updateTransportCarrier(id: string, data: Partial<InsertTransportCarrier>): Promise<TransportCarrier | undefined>;
  deleteTransportCarrier(id: string): Promise<boolean>;
  createTransportRate(data: InsertTransportRate): Promise<TransportRate>;
  updateTransportRate(id: string, data: Partial<InsertTransportRate>): Promise<TransportRate | undefined>;
  deleteTransportRate(id: string): Promise<boolean>;
  seedTransportCarriers(): Promise<void>;
  getTransportPredict(): Promise<{
    carriers: (TransportCarrier & { rates: TransportRate[] })[];
    unassigned: Array<{ partyName: string; location: string | null; orderCount: number; totalCases: number; orderIds: string[]; carrierCosts: Record<string, { matched: boolean; rate: number | null; minRate: number | null; maxRate: number | null; estimatedCost: number | null; location: string | null }>; suggestion: { carrierId: string; carrierName: string; reason: string; tat: string | null } | null }>;
    assigned: Array<{ dispatchBy: string; orderCount: number; totalCases: number; orderIds: string[]; estimatedCost: number | null }>;
  }>;
  assignTransportToOrders(orderIds: string[], dispatchBy: string): Promise<number>;
  unassignTransportFromOrders(orderIds: string[]): Promise<number>;
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

export interface BrandTimeBucket {
  date: string;
  [brandName: string]: string | number; // date is string, values are numbers
}

export interface OrderAnalytics {
  // Overall KPIs
  created: StatusMetric;
  approved: StatusMetric;
  invoiced: StatusMetric;
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
  // Brand-wise invoiced value over time
  brandSeries: BrandTimeBucket[];
  brandNames: string[];
  // Transport cost over time (by dispatch date)
  transportCostSeries: { date: string; cost: number }[];
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
  createdBy?: string;
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
    // Delete user's party access
    await db.delete(userPartyAccess).where(eq(userPartyAccess.userId, userId));
    // Delete the user
    const result = await db.delete(users).where(eq(users.id, userId));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getMergePreview(sourceId: string, targetId: string): Promise<{
    source: { user: User; orderCount: number; brandAccess: string[]; deliveryCompanyAccess: string[]; partyAccess: string[]; linkedCustomerCount: number };
    target: { user: User; orderCount: number; brandAccess: string[]; deliveryCompanyAccess: string[]; partyAccess: string[]; linkedCustomerCount: number };
  } | null> {
    const sourceUser = await this.getUser(sourceId);
    const targetUser = await this.getUser(targetId);
    if (!sourceUser || !targetUser) return null;

    const [srcOrders, tgtOrders] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(orders).where(or(eq(orders.userId, sourceId), eq(orders.createdBy, sourceId))),
      db.select({ count: sql<number>`count(*)` }).from(orders).where(or(eq(orders.userId, targetId), eq(orders.createdBy, targetId))),
    ]);

    const [srcBrands, tgtBrands] = await Promise.all([
      this.getUserBrandAccess(sourceId),
      this.getUserBrandAccess(targetId),
    ]);

    const [srcDC, tgtDC] = await Promise.all([
      this.getUserDeliveryCompanyAccess(sourceId),
      this.getUserDeliveryCompanyAccess(targetId),
    ]);

    const [srcParty, tgtParty] = await Promise.all([
      this.getUserPartyAccess(sourceId),
      this.getUserPartyAccess(targetId),
    ]);

    const [srcCustomers, tgtCustomers] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "Customer"), eq(users.linkedSalesUserId, sourceId))),
      db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "Customer"), eq(users.linkedSalesUserId, targetId))),
    ]);

    return {
      source: {
        user: sourceUser,
        orderCount: Number(srcOrders[0].count),
        brandAccess: srcBrands,
        deliveryCompanyAccess: srcDC,
        partyAccess: srcParty,
        linkedCustomerCount: Number(srcCustomers[0].count),
      },
      target: {
        user: targetUser,
        orderCount: Number(tgtOrders[0].count),
        brandAccess: tgtBrands,
        deliveryCompanyAccess: tgtDC,
        partyAccess: tgtParty,
        linkedCustomerCount: Number(tgtCustomers[0].count),
      },
    };
  }

  async mergeUsers(sourceId: string, targetId: string): Promise<{ ordersTransferred: number; brandsAdded: string[]; deliveryCompaniesAdded: string[]; partiesAdded: string[]; customersTransferred: number; sessionsCleared: number }> {
    const sourceUser = await this.getUser(sourceId);
    const targetUser = await this.getUser(targetId);
    if (!sourceUser) throw new Error("Source user not found");
    if (!targetUser) throw new Error("Target user not found");

    const [tgtBrands, tgtDC, tgtParty] = await Promise.all([
      this.getUserBrandAccess(targetId),
      this.getUserDeliveryCompanyAccess(targetId),
      this.getUserPartyAccess(targetId),
    ]);
    const [srcBrands, srcDC, srcParty] = await Promise.all([
      this.getUserBrandAccess(sourceId),
      this.getUserDeliveryCompanyAccess(sourceId),
      this.getUserPartyAccess(sourceId),
    ]);

    const uniqueSrcBrands = [...new Set(srcBrands)];
    const uniqueSrcDC = [...new Set(srcDC)];
    const uniqueSrcParty = [...new Set(srcParty)];
    const uniqueTgtBrands = new Set(tgtBrands);
    const uniqueTgtDC = new Set(tgtDC);
    const uniqueTgtParty = new Set(tgtParty);
    const brandsToAdd = uniqueSrcBrands.filter(b => !uniqueTgtBrands.has(b));
    const dcToAdd = uniqueSrcDC.filter(dc => !uniqueTgtDC.has(dc));
    const partiesToAdd = uniqueSrcParty.filter(p => !uniqueTgtParty.has(p));

    const orderResult = await db.select({ count: sql<number>`count(*)` }).from(orders).where(or(eq(orders.userId, sourceId), eq(orders.createdBy, sourceId)));
    const ordersTransferred = Number(orderResult[0].count);

    const customerResult = await db.select({ count: sql<number>`count(*)` }).from(users).where(and(eq(users.role, "Customer"), eq(users.linkedSalesUserId, sourceId)));
    const customersTransferred = Number(customerResult[0].count);

    const sessionCountResult = await db.execute(sql`SELECT count(*) as count FROM sessions WHERE sess->'passport'->'user'->>'id' = ${sourceId} OR sess->'passport'->'user'->'claims'->>'sub' = ${sourceId} OR sess->>'userId' = ${sourceId}`);
    const sessionsCleared = Number((sessionCountResult.rows[0] as { count: string }).count);

    await db.transaction(async (tx) => {
      await tx.update(orders).set({ userId: targetId }).where(eq(orders.userId, sourceId));
      await tx.update(orders).set({ createdBy: targetId }).where(eq(orders.createdBy, sourceId));

      if (brandsToAdd.length > 0) {
        await tx.insert(userBrandAccess).values(brandsToAdd.map(brand => ({ userId: targetId, brand }))).onConflictDoNothing();
      }
      if (dcToAdd.length > 0) {
        await tx.insert(userDeliveryCompanyAccess).values(dcToAdd.map(deliveryCompany => ({ userId: targetId, deliveryCompany }))).onConflictDoNothing();
      }
      if (partiesToAdd.length > 0) {
        await tx.insert(userPartyAccess).values(partiesToAdd.map(partyName => ({ userId: targetId, partyName }))).onConflictDoNothing();
      }

      await tx.update(users).set({ linkedSalesUserId: targetId }).where(eq(users.linkedSalesUserId, sourceId));

      await tx.delete(userBrandAccess).where(eq(userBrandAccess.userId, sourceId));
      await tx.delete(userDeliveryCompanyAccess).where(eq(userDeliveryCompanyAccess.userId, sourceId));
      await tx.delete(userPartyAccess).where(eq(userPartyAccess.userId, sourceId));
      await tx.execute(sql`DELETE FROM sessions WHERE sess->'passport'->'user'->>'id' = ${sourceId} OR sess->'passport'->'user'->'claims'->>'sub' = ${sourceId} OR sess->>'userId' = ${sourceId}`);
      await tx.delete(users).where(eq(users.id, sourceId));
    });

    return { ordersTransferred, brandsAdded: brandsToAdd, deliveryCompaniesAdded: dcToAdd, partiesAdded: partiesToAdd, customersTransferred, sessionsCleared };
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
    if (updates.caseSize !== undefined) updateData.caseSize = Math.max(1, updates.caseSize);
    if (updates.photoUrl !== undefined) updateData.photoUrl = updates.photoUrl;

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

  // Linked sales user operations (linking customer users to sales users)
  async updateUserLinkedSalesUser(userId: string, linkedSalesUserId: string | null): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({ linkedSalesUserId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async getLinkedCustomers(salesUserId: string): Promise<User[]> {
    const customers = await db
      .select()
      .from(users)
      .where(and(
        eq(users.role, "Customer"),
        eq(users.linkedSalesUserId, salesUserId)
      ));
    return customers;
  }

  async salesUserHasAccessToOrderOwner(salesUserId: string, orderOwnerId: string): Promise<boolean> {
    const orderOwner = await this.getUser(orderOwnerId);
    if (!orderOwner) return false;
    // Only grant access if owner is a Customer linked to this sales user
    return orderOwner.role === "Customer" && orderOwner.linkedSalesUserId === salesUserId;
  }

  async getOrdersForLinkedCustomers(salesUserId: string): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]> {
    // Get customers linked to this sales user
    const linkedCustomers = await this.getLinkedCustomers(salesUserId);
    if (linkedCustomers.length === 0) return [];
    
    const customerIds = linkedCustomers.map(c => c.id);
    
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
      cartonSize: orders.cartonSize,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      createdByName: sql<string | null>`concat_ws(' ', ${creatorUser.firstName}, ${creatorUser.lastName})`.as('createdByName'),
      createdByEmail: creatorUser.email,
      actualCreatorName: sql<string | null>`concat_ws(' ', ${creatorUser.firstName}, ${creatorUser.lastName})`.as('actualCreatorName'),
    })
    .from(orders)
    .leftJoin(creatorUser, eq(orders.createdBy, creatorUser.id))
    .where(inArray(orders.userId, customerIds))
    .orderBy(desc(orders.createdAt));
    
    return result;
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
      cartonSize: orders.cartonSize,
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
      cartonSize: orders.cartonSize,
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

  async getCustomerOrders(userId: string, partyName?: string | null): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null })[]> {
    const creatorUser = alias(users, 'creatorUser');
    // Show orders owned by this customer OR orders placed under their party name
    const condition = partyName
      ? or(eq(orders.userId, userId), eq(orders.partyName, partyName))
      : eq(orders.userId, userId);

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
      cartonSize: orders.cartonSize,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      createdByName: users.firstName,
      createdByEmail: users.email,
      actualCreatorName: creatorUser.firstName,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(creatorUser, eq(orders.createdBy, creatorUser.id))
    .where(condition!)
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
    if (filters?.createdBy) {
      conditions.push(eq(orders.userId, filters.createdBy));
    }
    
    if (filters?.includeActive && !filters?.status && (filters.fromDate || filters.toDate)) {
      const activeStatuses = ['Created', 'Approved', 'Backordered', 'Invoiced', 'PaymentPending', 'Dispatched'];
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

  async getAllOrders(filters?: OrderFilters): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null; actualCreatorName?: string | null; ownerRole?: string | null })[]> {
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
      cartonSize: orders.cartonSize,
      createdBy: orders.createdBy,
      createdAt: orders.createdAt,
      // Order owner info (sales user)
      createdByName: users.firstName,
      createdByEmail: users.email,
      ownerRole: users.role,
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
      cartonSize: orders.cartonSize,
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
      caseSize: orderItems.caseSize,
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
    if (updates.cartonSize !== undefined) updateData.cartonSize = updates.cartonSize;
    if (updates.smallCartons !== undefined) updateData.smallCartons = updates.smallCartons;
    if (updates.largeCartons !== undefined) updateData.largeCartons = updates.largeCartons;
    // Derive total cases from small + large, but only when at least one count is non-null
    if (updates.smallCartons !== undefined || updates.largeCartons !== undefined) {
      const small = updates.smallCartons ?? null;
      const large = updates.largeCartons ?? null;
      if (small !== null || large !== null) {
        updateData.cases = (small || 0) + (large || 0);
      }
    }
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
      brand: orders.brand,
      actualOrderValue: orders.actualOrderValue,
      total: orders.total,
      deliveredOnTime: orders.deliveredOnTime,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      invoiceDate: orders.invoiceDate,
      dispatchDate: orders.dispatchDate,
      deliveryCost: orders.deliveryCost,
      dispatchBy: orders.dispatchBy,
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
    const invoiced: StatusMetric = { count: 0, value: 0 };
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
    
    const invoicedStatuses = ['Invoiced', 'PaymentPending', 'Dispatched', 'Delivered', 'PODReceived'];
    const dispatchedStatuses = ['Dispatched', 'Delivered', 'PODReceived'];
    const deliveredStatuses = ['Delivered', 'PODReceived'];

    for (const order of allOrders) {
      const status = order.status || "Created";
      const value = Number(order.actualOrderValue || order.total || 0);
      
      // Calculate on-time based on estimated vs actual delivery dates
      const isOnTime = order.actualDeliveryDate && order.estimatedDeliveryDate
        ? new Date(order.actualDeliveryDate) <= new Date(order.estimatedDeliveryDate)
        : order.deliveredOnTime;
      
      // Update overall metrics (by current status)
      switch (status) {
        case 'Created':
          created.count++;
          created.value += value;
          break;
        case 'Approved':
          approved.count++;
          approved.value += value;
          break;
        case 'Invoiced':
        case 'PaymentPending':
          invoiced.count++;
          invoiced.value += value;
          break;
        case 'Dispatched':
          dispatched.count++;
          dispatched.value += value;
          break;
        case 'Delivered':
        case 'PODReceived':
          delivered.count++;
          delivered.value += value;
          deliveredCount++;
          if (isOnTime) {
            onTimeCount++;
          }
          break;
        case 'Backordered':
          created.count++;
          created.value += value;
          break;
        case 'Pending':
          created.count++;
          created.value += value;
          break;
        case 'Cancelled':
          cancelled.count++;
          cancelled.value += value;
          break;
      }

      // Time-series: bucket by actual event dates, not current status
      // Created bucket: use createdAt date
      const createdDate = order.createdAt ? new Date(order.createdAt) : new Date();
      const createdBucket = getOrCreateBucket(getBucketKey(createdDate));
      createdBucket.created.count++;
      createdBucket.created.value += value;

      // Invoiced bucket: use invoiceDate if the order has been invoiced (or beyond)
      if (invoicedStatuses.includes(status) && order.invoiceDate) {
        const invDate = new Date(order.invoiceDate);
        const invBucket = getOrCreateBucket(getBucketKey(invDate));
        invBucket.invoiced.count++;
        invBucket.invoiced.value += value;
      }

      // Dispatched bucket: use dispatchDate if the order has been dispatched (or beyond)
      if (dispatchedStatuses.includes(status) && order.dispatchDate) {
        const dispDate = new Date(order.dispatchDate);
        const dispBucket = getOrCreateBucket(getBucketKey(dispDate));
        dispBucket.dispatched.count++;
        dispBucket.dispatched.value += value;
      }

      // Delivered bucket: use actualDeliveryDate if the order has been delivered
      if (deliveredStatuses.includes(status)) {
        const delDate = order.actualDeliveryDate ? new Date(order.actualDeliveryDate) : (order.dispatchDate ? new Date(order.dispatchDate) : createdDate);
        const delBucket = getOrCreateBucket(getBucketKey(delDate));
        delBucket.delivered.count++;
        delBucket.delivered.value += value;
        delBucket.deliveredCount++;
        if (isOnTime) {
          delBucket.onTimeCount++;
        }
      }
    }
    
    // Sort buckets by date, filtering out any that fall outside the effective range.
    // Event-date buckets (invoiceDate, dispatchDate, actualDeliveryDate) can be set
    // to future dates for in-progress orders, which would otherwise appear as stray
    // last points on the x-axis.
    const sortedTimeSeries = Array.from(buckets.values())
      .filter(b => {
        const d = new Date(b.date);
        if (fromDate && d < fromDate) return false;
        if (d > toDate) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
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

    // Build brand series — invoiced value per brand per time bucket (keyed by invoice date)
    const brandBuckets = new Map<string, Map<string, number>>(); // date -> (brand -> invoicedValue)
    const brandNamesSet = new Set<string>();
    const brandSeriesExcluded = new Set(
      (await this.getAllBrands())
        .filter(b => b.excludeFromAnalytics)
        .map(b => b.name.toLowerCase())
    );

    for (const order of allOrders) {
      const status = order.status || 'Created';
      const value = Number(order.actualOrderValue || order.total || 0);
      const brand = order.brand || 'Unknown';
      if (brandSeriesExcluded.has(brand.toLowerCase())) continue;
      if (!invoicedStatuses.includes(status)) continue;
      if (!order.invoiceDate) continue;

      const invDate = new Date(order.invoiceDate);
      const bucketKey = getBucketKey(invDate);
      brandNamesSet.add(brand);

      if (!brandBuckets.has(bucketKey)) brandBuckets.set(bucketKey, new Map());
      const bkt = brandBuckets.get(bucketKey)!;
      bkt.set(brand, (bkt.get(brand) || 0) + value);
    }

    const sortedBrandNames = Array.from(brandNamesSet).sort();
    const brandSeries: BrandTimeBucket[] = Array.from(brandBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, brands]) => {
        const entry: BrandTimeBucket = { date };
        for (const name of sortedBrandNames) {
          entry[name] = brands.get(name) || 0;
        }
        return entry;
      });

    // Build transport cost series — total delivery cost per time bucket (keyed by dispatch date)
    const transportBuckets = new Map<string, number>();
    // Load patterns + analytics-excluded brands from DB config
    const dispatcherPatternRows = (await this.getDispatcherPatterns()).filter(p => p.isActive);
    const analyticsExcludedBrands = new Set(
      (await this.getAllBrands())
        .filter(b => b.excludeFromAnalytics)
        .map(b => b.name.toLowerCase())
    );

    // Use delivered-only statuses to match the frontend Transport Cost KPI card definition
    const deliveredOnlyStatuses = ['Delivered', 'PODReceived'];
    for (const order of allOrders) {
      const status = order.status || 'Created';
      if (!deliveredOnlyStatuses.includes(status)) continue;
      if (analyticsExcludedBrands.has((order.brand || '').toLowerCase())) continue;
      const cost = Number(order.deliveryCost || 0);
      if (cost <= 0) continue;
      if (!order.dispatchBy) continue;
      const dispLower = order.dispatchBy.toLowerCase().trim();
      // Skip non-transport dispatchers (hand, self, zero_cost)
      const dispType = dispatcherPatternRows.find(p => dispLower.includes(p.pattern.toLowerCase()))?.type;
      if (dispType && dispType !== 'transport') continue;

      if (!order.dispatchDate) continue;
      const bucketKey = getBucketKey(new Date(order.dispatchDate));
      transportBuckets.set(bucketKey, (transportBuckets.get(bucketKey) || 0) + cost);
    }

    const transportCostSeries = Array.from(transportBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost }));

    return {
      created,
      approved,
      invoiced,
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
      brandSeries,
      brandNames: sortedBrandNames,
      transportCostSeries,
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

  async getOrderBrands(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ brand: orders.brand })
      .from(orders)
      .where(sql`${orders.brand} is not null and ${orders.brand} != ''`)
      .orderBy(orders.brand);
    return rows.map(r => r.brand as string);
  }

  async getBrandByName(name: string): Promise<BrandRecord | undefined> {
    const [brand] = await db.select().from(brands).where(sql`lower(${brands.name}) = lower(${name})`);
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

  async updateBrandLogo(id: string, logoUrl: string | null): Promise<BrandRecord | undefined> {
    const [updated] = await db.update(brands).set({ logoUrl }).where(eq(brands.id, id)).returning();
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

  // ===== Configurability methods =====

  async getDeliveryCompanies(activeOnly = false) {
    const rows = activeOnly
      ? await db.select().from(deliveryCompanies).where(eq(deliveryCompanies.isActive, true)).orderBy(deliveryCompanies.displayOrder, deliveryCompanies.name)
      : await db.select().from(deliveryCompanies).orderBy(deliveryCompanies.displayOrder, deliveryCompanies.name);
    return rows.map(r => ({ id: r.id, name: r.name, isActive: r.isActive, displayOrder: r.displayOrder }));
  }

  async upsertDeliveryCompany(input: { id?: string; name: string; isActive?: boolean; displayOrder?: number }) {
    if (input.id) {
      const u: Record<string, unknown> = { name: input.name };
      if (input.isActive !== undefined) u.isActive = input.isActive;
      if (input.displayOrder !== undefined) u.displayOrder = input.displayOrder;
      await db.update(deliveryCompanies).set(u).where(eq(deliveryCompanies.id, input.id));
    } else {
      await db.insert(deliveryCompanies).values({
        name: input.name,
        isActive: input.isActive ?? true,
        displayOrder: input.displayOrder ?? 100,
      }).onConflictDoNothing();
    }
  }

  async deleteDeliveryCompany(id: string) {
    const r = await db.delete(deliveryCompanies).where(eq(deliveryCompanies.id, id)).returning();
    return r.length > 0;
  }

  async getDeliveryCompaniesForBrand(brand: string): Promise<string[]> {
    const rows = await db.select({ name: brandDeliveryCompanies.deliveryCompanyName })
      .from(brandDeliveryCompanies)
      .where(eq(brandDeliveryCompanies.brandName, brand));
    if (rows.length > 0) return rows.map(r => r.name);
    // Fallback: return all active delivery companies
    const all = await this.getDeliveryCompanies(true);
    return all.map(r => r.name);
  }

  async setBrandDeliveryCompanies(brand: string, companies: string[]) {
    await db.delete(brandDeliveryCompanies).where(eq(brandDeliveryCompanies.brandName, brand));
    if (companies.length > 0) {
      await db.insert(brandDeliveryCompanies).values(
        companies.map(c => ({ brandName: brand, deliveryCompanyName: c }))
      );
    }
  }

  async getDispatcherPatterns() {
    const rows = await db.select().from(dispatcherPatterns).orderBy(dispatcherPatterns.pattern);
    return rows.map(r => ({ id: r.id, pattern: r.pattern, type: r.type as DispatcherType, isActive: r.isActive }));
  }

  async upsertDispatcherPattern(input: { id?: string; pattern: string; type: DispatcherType; isActive?: boolean }) {
    if (input.id) {
      const u: Record<string, unknown> = { pattern: input.pattern, type: input.type };
      if (input.isActive !== undefined) u.isActive = input.isActive;
      await db.update(dispatcherPatterns).set(u).where(eq(dispatcherPatterns.id, input.id));
    } else {
      await db.insert(dispatcherPatterns).values({
        pattern: input.pattern,
        type: input.type,
        isActive: input.isActive ?? true,
      });
    }
  }

  async deleteDispatcherPattern(id: string) {
    const r = await db.delete(dispatcherPatterns).where(eq(dispatcherPatterns.id, id)).returning();
    return r.length > 0;
  }

  async classifyDispatcher(name: string | null | undefined): Promise<DispatcherType> {
    if (!name) return "transport";
    const lower = name.toLowerCase().trim();
    const patterns = await this.getDispatcherPatterns();
    for (const p of patterns) {
      if (!p.isActive) continue;
      if (lower.includes(p.pattern.toLowerCase())) return p.type;
    }
    return "transport";
  }

  async getOrderStatusConfig() {
    const rows = await db.select().from(orderStatusConfig).orderBy(orderStatusConfig.sortOrder);
    return rows.map(r => ({ status: r.status, slaDays: r.slaDays, isArchived: r.isArchived, sortOrder: r.sortOrder }));
  }

  async updateOrderStatusConfig(status: string, updates: { slaDays?: number | null; isArchived?: boolean; sortOrder?: number }) {
    const u: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.slaDays !== undefined) u.slaDays = updates.slaDays;
    if (updates.isArchived !== undefined) u.isArchived = updates.isArchived;
    if (updates.sortOrder !== undefined) u.sortOrder = updates.sortOrder;
    await db.update(orderStatusConfig).set(u).where(eq(orderStatusConfig.status, status));
  }

  async getCartonSizes(activeOnly = false) {
    const rows = activeOnly
      ? await db.select().from(cartonSizes).where(eq(cartonSizes.isActive, true)).orderBy(cartonSizes.sortOrder)
      : await db.select().from(cartonSizes).orderBy(cartonSizes.sortOrder);
    return rows.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder, isActive: r.isActive }));
  }

  async upsertCartonSize(input: { id?: string; name: string; sortOrder?: number; isActive?: boolean }) {
    if (input.id) {
      const u: Record<string, unknown> = { name: input.name };
      if (input.sortOrder !== undefined) u.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) u.isActive = input.isActive;
      await db.update(cartonSizes).set(u).where(eq(cartonSizes.id, input.id));
    } else {
      await db.insert(cartonSizes).values({
        name: input.name,
        sortOrder: input.sortOrder ?? 100,
        isActive: input.isActive ?? true,
      }).onConflictDoNothing();
    }
  }

  async deleteCartonSize(id: string) {
    const r = await db.delete(cartonSizes).where(eq(cartonSizes.id, id)).returning();
    return r.length > 0;
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

    let pendingTotal = 0;
    for (const item of originalItems) {
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

    const pendingItemsData: InsertOrderItem[] = originalItems.map(item => ({
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

  // Brand forecast settings operations
  async getBrandForecastSettings(brand: string): Promise<BrandForecastSettings | undefined> {
    const [result] = await db
      .select()
      .from(brandForecastSettings)
      .where(eq(brandForecastSettings.brand, brand));
    return result;
  }

  async upsertBrandForecastSettings(
    brand: string,
    settings: { leadTimeDays: number; nonMovingDays: number; slowMovingDays: number },
    updatedBy?: string,
  ): Promise<BrandForecastSettings> {
    const [result] = await db
      .insert(brandForecastSettings)
      .values({
        brand,
        leadTimeDays: settings.leadTimeDays,
        nonMovingDays: settings.nonMovingDays,
        slowMovingDays: settings.slowMovingDays,
        updatedAt: new Date(),
        updatedBy: updatedBy || null,
      })
      .onConflictDoUpdate({
        target: brandForecastSettings.brand,
        set: {
          leadTimeDays: settings.leadTimeDays,
          nonMovingDays: settings.nonMovingDays,
          slowMovingDays: settings.slowMovingDays,
          updatedAt: new Date(),
          updatedBy: updatedBy || null,
        },
      })
      .returning();
    return result;
  }

  // Stock operations
  async updateProductsStock(updates: Array<{ productId: string; stock: number }>): Promise<{ count: number; updatedProducts: Product[] }> {
    if (updates.length === 0) return { count: 0, updatedProducts: [] };
    // Bulk update using unnest
    const ids = updates.map(u => u.productId);
    const stocks = updates.map(u => u.stock);
    const updatedRows = await db.execute(sql`
      UPDATE products
      SET stock = v.stock::integer
      FROM (SELECT unnest(${sql.raw(`ARRAY[${ids.map(id => `'${id}'`).join(',')}]`)}::text[]) AS id,
                   unnest(${sql.raw(`ARRAY[${stocks.join(',')}]`)}::integer[]) AS stock) AS v
      WHERE products.id = v.id
      RETURNING products.*
    `);
    const updatedProducts = (updatedRows.rows as any[]).map(r => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      brand: r.brand,
      size: r.size,
      mrp: r.mrp,
      stock: r.stock,
      isActive: r.is_active,
      userId: r.user_id,
      createdAt: r.created_at,
    })) as Product[];
    return { count: updatedProducts.length, updatedProducts };
  }

  async getProductsForForecast(brand: string): Promise<Product[]> {
    return db.select().from(products).where(eq(products.brand, brand));
  }

  async getSoldQuantitiesByProduct(
    brand: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<Array<{ productId: string; quantity: number; lastSaleDate: Date }>> {
    const SOLD_STATUSES = ['Invoiced', 'PaymentPending', 'Dispatched', 'Delivered', 'PODReceived'];
    const rows = await db
      .select({
        productId: orderItems.productId,
        quantity: sql<number>`SUM(${orderItems.quantity})`,
        lastSaleDate: sql<Date>`MAX(COALESCE(${orders.invoiceDate}, ${orders.createdAt}))`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.brand, brand),
          inArray(orders.status, SOLD_STATUSES),
          gte(sql`COALESCE(${orders.invoiceDate}, ${orders.createdAt})`, fromDate),
          lte(sql`COALESCE(${orders.invoiceDate}, ${orders.createdAt})`, toDate),
        ),
      )
      .groupBy(orderItems.productId);
    return rows.map(r => ({
      productId: r.productId,
      quantity: Number(r.quantity),
      lastSaleDate: new Date(r.lastSaleDate),
    }));
  }

  async getLastSaleDatesByProduct(brand: string, fromDate: Date, toDate: Date): Promise<Map<string, Date>> {
    const SOLD_STATUSES = ['Invoiced', 'PaymentPending', 'Dispatched', 'Delivered', 'PODReceived'];
    const rows = await db
      .select({
        productId: orderItems.productId,
        lastSaleDate: sql<Date>`MAX(COALESCE(${orders.invoiceDate}, ${orders.createdAt}))`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.brand, brand),
          inArray(orders.status, SOLD_STATUSES),
          gte(sql`COALESCE(${orders.invoiceDate}, ${orders.createdAt})`, fromDate),
          lte(sql`COALESCE(${orders.invoiceDate}, ${orders.createdAt})`, toDate),
        ),
      )
      .groupBy(orderItems.productId);
    const result = new Map<string, Date>();
    for (const r of rows) {
      result.set(r.productId, new Date(r.lastSaleDate));
    }
    return result;
  }

  async saveSalesSnapshot(brand: string, results: unknown[]): Promise<{ id: number; snapshotDate: Date }> {
    const [row] = await db
      .insert(brandSalesSnapshots)
      .values({ brand, results: results as any })
      .returning({ id: brandSalesSnapshots.id, snapshotDate: brandSalesSnapshots.snapshotDate });
    return { id: row.id, snapshotDate: row.snapshotDate! };
  }

  async getSalesSnapshots(brand: string, limit = 10): Promise<Array<{ id: number; brand: string; snapshotDate: Date; createdAt: Date | null }>> {
    const rows = await db
      .select({ id: brandSalesSnapshots.id, brand: brandSalesSnapshots.brand, snapshotDate: brandSalesSnapshots.snapshotDate, createdAt: brandSalesSnapshots.createdAt })
      .from(brandSalesSnapshots)
      .where(eq(brandSalesSnapshots.brand, brand))
      .orderBy(sql`${brandSalesSnapshots.snapshotDate} DESC`)
      .limit(limit);
    return rows.map(r => ({ ...r, snapshotDate: new Date(r.snapshotDate), createdAt: r.createdAt ? new Date(r.createdAt) : null }));
  }

  async saveStockImport(brand: string, data: { updatedCount: number; unmatchedCount: number; updatedProducts: unknown[]; unmatched: unknown[] }): Promise<{ id: number; importedAt: Date }> {
    const [row] = await db
      .insert(brandStockImports)
      .values({
        brand,
        updatedCount: data.updatedCount,
        unmatchedCount: data.unmatchedCount,
        updatedProducts: data.updatedProducts as any,
        unmatched: data.unmatched as any,
      })
      .returning({ id: brandStockImports.id, importedAt: brandStockImports.importedAt });
    return { id: row.id, importedAt: row.importedAt! };
  }

  async getStockImports(brand: string, limit = 10): Promise<Array<{ id: number; brand: string; importedAt: Date; updatedCount: number | null; unmatchedCount: number | null }>> {
    const rows = await db
      .select({ id: brandStockImports.id, brand: brandStockImports.brand, importedAt: brandStockImports.importedAt, updatedCount: brandStockImports.updatedCount, unmatchedCount: brandStockImports.unmatchedCount })
      .from(brandStockImports)
      .where(eq(brandStockImports.brand, brand))
      .orderBy(sql`${brandStockImports.importedAt} DESC`)
      .limit(limit);
    return rows.map(r => ({ ...r, importedAt: new Date(r.importedAt) }));
  }

  // Transport carrier operations
  async getTransportCarriers(): Promise<(TransportCarrier & { rates: TransportRate[] })[]> {
    const carriers = await db.select().from(transportCarriers).orderBy(transportCarriers.name);
    const allRates = await db.select().from(transportRates).orderBy(transportRates.location);
    return carriers.map(c => ({
      ...c,
      rates: allRates.filter(r => r.carrierId === c.id),
    }));
  }

  async createTransportCarrier(data: InsertTransportCarrier): Promise<TransportCarrier> {
    const [row] = await db.insert(transportCarriers).values(data).returning();
    return row;
  }

  async updateTransportCarrier(id: string, data: Partial<InsertTransportCarrier>): Promise<TransportCarrier | undefined> {
    const [row] = await db.update(transportCarriers).set(data).where(eq(transportCarriers.id, id)).returning();
    return row;
  }

  async deleteTransportCarrier(id: string): Promise<boolean> {
    const result = await db.delete(transportCarriers).where(eq(transportCarriers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createTransportRate(data: InsertTransportRate): Promise<TransportRate> {
    const [row] = await db.insert(transportRates).values(data).returning();
    return row;
  }

  async updateTransportRate(id: string, data: Partial<InsertTransportRate>): Promise<TransportRate | undefined> {
    const [row] = await db.update(transportRates).set(data).where(eq(transportRates.id, id)).returning();
    return row;
  }

  async deleteTransportRate(id: string): Promise<boolean> {
    const result = await db.delete(transportRates).where(eq(transportRates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async seedTransportCarriers(): Promise<void> {
    const existing = await db.select().from(transportCarriers);
    const existingNames = new Set(existing.map(c => c.name));

    // Seed each carrier independently by name for idempotency
    if (!existingNames.has("Bapi da Toto")) {
      const [bapi] = await db.insert(transportCarriers).values({
        name: "Bapi da Toto",
        type: "flat_per_location",
        notes: "Local auto/toto transport with flat per-location rates",
        isActive: true,
      }).returning();
      const bapiRates = [
        { location: "M.M ENTERPRISE", rate: "500" },
        { location: "RIDDHI ENTERPRISE", rate: "400" },
        { location: "GREEN CROSS", rate: "550" },
        { location: "NILAY SURGICAL", rate: "750" },
        { location: "GOPAL SPORTS", rate: "300" },
        { location: "NEW KOLORAH", rate: "300" },
        { location: "SHREE GANESH (LILUAH)", rate: "850" },
        { location: "OLABIBITALA", rate: "950" },
        { location: "MULLICK", rate: "300" },
        { location: "KALPOLOK", rate: "350" },
        { location: "ORTHOPEDIA", rate: "450" },
        { location: "BAURIA", rate: "600" },
        { location: "CHAMRAIL", rate: "900" },
        { location: "UNITED ENTERPRISE", rate: "300" },
        { location: "ARUN PHYSIO", rate: "300" },
        { location: "MULLICK FATAK", rate: "700" },
        { location: "APEX ENTERPRISE", rate: "600" },
        { location: "SANKRAIL TO GKW", rate: "300" },
      ];
      await db.insert(transportRates).values(bapiRates.map(r => ({ carrierId: bapi.id, ...r })));
    }

    if (!existingNames.has("Smartship Courier")) {
      const [smartship] = await db.insert(transportCarriers).values({
        name: "Smartship Courier",
        type: "per_parcel",
        notes: "Zone-based courier with 48-hour TAT",
        isActive: true,
      }).returning();
      const smartshipZones = [
        "HOOGHLY / HOWRAH",
        "NORTH / SOUTH 24 PARGANAS",
        "BANKURA, BIRBHUM, PURULIA",
        "PURBO / PASCHIM BARDHAMAN",
        "MURSHIDABAD / NADIA",
        "KOLKATA",
        "PURBO / PASCHIM MEDINIPUR",
      ];
      await db.insert(transportRates).values(
        smartshipZones.map(zone => ({
          carrierId: smartship.id,
          location: zone,
          minRate: "130",
          maxRate: "170",
          tat: "48 HRS",
          rateNote: "130 standard / 170 large",
        }))
      );
    }
  }

  async getTransportPredict(): Promise<{
    carriers: (TransportCarrier & { rates: TransportRate[] })[];
    unassigned: Array<{ partyName: string; location: string | null; orderCount: number; totalCases: number; orderIds: string[]; carrierCosts: Record<string, { matched: boolean; rate: number | null; minRate: number | null; maxRate: number | null; estimatedCost: number | null; location: string | null }>; suggestion: { carrierId: string; carrierName: string; reason: string; tat: string | null } | null }>;
    assigned: Array<{ dispatchBy: string; orderCount: number; totalCases: number; orderIds: string[]; estimatedCost: number | null }>;
  }> {
    const carriers = await this.getTransportCarriers();
    const activeCarriers = carriers.filter(c => c.isActive);

    // Get all invoiced orders
    const invoicedOrders = await db.select().from(orders).where(eq(orders.status, "Invoiced"));


    // Helper: match partyName against rate locations (case-insensitive partial match).
    // Used for BOTH flat_per_location and per_parcel carriers.
    function matchRate(partyName: string | null, rates: TransportRate[]): TransportRate | null {
      if (!partyName) return null;
      const pnLower = partyName.toLowerCase().trim();
      let best: TransportRate | null = null;
      let bestLen = 0;
      for (const rate of rates) {
        const locLower = rate.location.toLowerCase().trim();
        if (pnLower.includes(locLower) || locLower.includes(pnLower)) {
          if (rate.location.length > bestLen) {
            bestLen = rate.location.length;
            best = rate;
          }
        }
      }
      return best;
    }

    // Compute carrier cost for a party group.
    // Tries locationText (deliveryAddress) first for rate matching, then falls back to partyName.
    // locationText represents the actual delivery location; partyName is a secondary key.
    function computeCarrierCost(
      partyName: string,
      locationText: string | null,
      orderCount: number,
      carrier: TransportCarrier & { rates: TransportRate[] }
    ): { matched: boolean; rate: number | null; minRate: number | null; maxRate: number | null; estimatedCost: number | null; location: string | null } {
      // Try locationText first (most accurate for routing), then partyName as fallback
      let matchedRate = locationText ? matchRate(locationText, carrier.rates) : null;
      if (!matchedRate) matchedRate = matchRate(partyName, carrier.rates);

      if (!matchedRate) {
        return { matched: false, rate: null, minRate: null, maxRate: null, estimatedCost: null, location: null };
      }
      if (carrier.type === "flat_per_location") {
        const rateVal = matchedRate.rate ? Number(matchedRate.rate) : null;
        return {
          matched: true,
          rate: rateVal,
          minRate: null,
          maxRate: null,
          estimatedCost: rateVal,
          location: matchedRate.location,
        };
      } else {
        // per_parcel: matched zone rate * orderCount
        const minR = matchedRate.minRate ? Number(matchedRate.minRate) : null;
        const maxR = matchedRate.maxRate ? Number(matchedRate.maxRate) : null;
        return {
          matched: true,
          rate: null,
          minRate: minR,
          maxRate: maxR,
          estimatedCost: minR ? minR * orderCount : null,
          location: matchedRate.location,
        };
      }
    }

    // Separate unassigned (no dispatchBy) and assigned (has dispatchBy)
    // Brands flagged as not requiring transport assignment are excluded from "unassigned"
    const transportExcludedBrandSet = new Set(
      (await this.getAllBrands())
        .filter(b => !b.requiresTransportAssignment)
        .map(b => b.name)
    );
    const unassignedOrders = invoicedOrders.filter(o => !o.dispatchBy && !transportExcludedBrandSet.has(o.brand || ""));
    const assignedOrders = invoicedOrders.filter(o => !!o.dispatchBy);

    // Group unassigned by partyName, also collecting delivery addresses for geo matching
    const unassignedGroups = new Map<string, { orderIds: string[]; totalCases: number; locationTexts: string[] }>();
    for (const order of unassignedOrders) {
      const key = order.partyName || "(No Party)";
      if (!unassignedGroups.has(key)) {
        unassignedGroups.set(key, { orderIds: [], totalCases: 0, locationTexts: [] });
      }
      const grp = unassignedGroups.get(key)!;
      grp.orderIds.push(order.id);
      grp.totalCases += order.cases || 0;
      // Use deliveryAddress as the location source (orders schema has no dedicated partyLocation field;
      // deliveryAddress is the closest equivalent), falling back to partyName for geo-rule matching.
      const loc = order.deliveryAddress || order.partyName;
      if (loc) grp.locationTexts.push(loc);
    }

    // Auto-suggestion engine: applies 5-rule priority chain
    function suggestCarrier(
      partyName: string,
      totalCases: number,
      orderCount: number,
      locationTexts: string[],
      carrierCosts: Record<string, { matched: boolean; rate: number | null; minRate: number | null; maxRate: number | null; estimatedCost: number | null; location: string | null }>,
    ): { carrierId: string; carrierName: string; reason: string; tat: string | null } | null {
      const combinedLocation = locationTexts.join(" ").toLowerCase();
      const partyLower = partyName.toLowerCase().trim();

      // Helper: get TAT from matched rate entry for a carrier
      function getCarrierTat(carrier: (typeof activeCarriers)[number]): string | null {
        const primaryLoc = locationTexts.find(l => l !== partyName) ?? locationTexts[0] ?? null;
        const matched = (primaryLoc ? matchRate(primaryLoc, carrier.rates) : null) ?? matchRate(partyName, carrier.rates);
        return matched?.tat ?? null;
      }

      // Rule 1: Geographic override — Birbhum, Purulia, or North Bengal
      const geoRegions: { keyword: string; label: string }[] = [
        { keyword: "birbhum", label: "Birbhum" },
        { keyword: "purulia", label: "Purulia" },
        { keyword: "north bengal", label: "North Bengal" },
      ];
      for (const { keyword, label } of geoRegions) {
        if (combinedLocation.includes(keyword) || partyLower.includes(keyword)) {
          const dhulagore = activeCarriers.find(c => c.name.toLowerCase().includes("dhulagore"));
          if (dhulagore) {
            return { carrierId: dhulagore.id, carrierName: dhulagore.name, reason: `Assigned ${dhulagore.name} — party location matches ${label} rule`, tat: getCarrierTat(dhulagore) };
          }
        }
      }

      // Get matched carriers (those with a rate for this party)
      const matched = activeCarriers.filter(c => carrierCosts[c.id]?.matched);
      if (matched.length === 0) return null;

      // Rule 2: Party-name rate match — carrier has a rate entry keyed to the party's own name.
      // Compute cost using party-name rate specifically (locationText=null, orderCount for unit consistency).
      const partyNameMatched = matched.filter(c =>
        c.rates.some(r => r.location.toLowerCase().trim() === partyLower)
      );
      if (partyNameMatched.length > 0) {
        const withPartyCost = partyNameMatched
          .map(c => {
            const partyCost = computeCarrierCost(partyName, null, orderCount, c);
            return { carrier: c, cost: partyCost.estimatedCost };
          })
          .filter(x => x.cost !== null)
          .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
        if (withPartyCost.length > 0) {
          // Compare against cheapest among location-only matched carriers
          const locationOnlyMatched = matched.filter(c => !partyNameMatched.includes(c));
          const cheapestLocationCost = locationOnlyMatched
            .map(c => carrierCosts[c.id]?.estimatedCost)
            .filter((c): c is number => c !== null)
            .sort((a, b) => a - b)[0] ?? Infinity;
          const best = withPartyCost[0];
          if ((best.cost ?? Infinity) <= cheapestLocationCost) {
            return { carrierId: best.carrier.id, carrierName: best.carrier.name, reason: `Assigned ${best.carrier.name} — has a specific rate for this party`, tat: getCarrierTat(best.carrier) };
          }
        }
      }

      // Rule 3: High-volume toto rule — carton count > 7, prefer cheapest toto carrier
      if (totalCases > 7) {
        const totoCarriers = matched.filter(c => c.name.toLowerCase().includes("toto"));
        if (totoCarriers.length > 0) {
          const cheapestToto = totoCarriers
            .map(c => ({ carrier: c, cost: carrierCosts[c.id]?.estimatedCost }))
            .filter(x => x.cost !== null)
            .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
          const toto = cheapestToto?.carrier ?? totoCarriers[0];
          return { carrierId: toto.id, carrierName: toto.name, reason: `Assigned ${toto.name} — high volume (${totalCases} cartons) prefers toto carrier`, tat: getCarrierTat(toto) };
        }
      }

      // Rule 4: Flat-rate preference — > 2 cartons AND multiple carriers match the SAME location zone
      // Group matched carriers by the location string they resolved to (from rate table)
      if (totalCases > 2) {
        const byMatchedLocation = new Map<string, (typeof matched[number])[]>();
        for (const c of matched) {
          const loc = carrierCosts[c.id]?.location?.toLowerCase().trim();
          if (!loc) continue;
          if (!byMatchedLocation.has(loc)) byMatchedLocation.set(loc, []);
          byMatchedLocation.get(loc)!.push(c);
        }
        for (const carriersAtLoc of byMatchedLocation.values()) {
          if (carriersAtLoc.length > 1) {
            const cheapestFlat = carriersAtLoc
              .filter(c => c.type === "flat_per_location")
              .map(c => ({ carrier: c, cost: carrierCosts[c.id]?.estimatedCost }))
              .filter(x => x.cost !== null)
              .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
            if (cheapestFlat) {
              return { carrierId: cheapestFlat.carrier.id, carrierName: cheapestFlat.carrier.name, reason: `Assigned ${cheapestFlat.carrier.name} — flat rate preferred for ${totalCases} cartons vs per-parcel`, tat: getCarrierTat(cheapestFlat.carrier) };
            }
          }
        }
      }

      // Rule 5: Lowest cost fallback
      const cheapest = matched
        .map(c => ({ carrier: c, cost: carrierCosts[c.id]?.estimatedCost }))
        .filter(x => x.cost !== null)
        .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
      if (cheapest) {
        return { carrierId: cheapest.carrier.id, carrierName: cheapest.carrier.name, reason: `Assigned ${cheapest.carrier.name} — lowest estimated cost`, tat: getCarrierTat(cheapest.carrier) };
      }

      // No cost data — pick first matched carrier
      return { carrierId: matched[0].id, carrierName: matched[0].name, reason: `Assigned ${matched[0].name} — only available carrier for this location`, tat: getCarrierTat(matched[0]) };
    }

    const unassigned = Array.from(unassignedGroups.entries()).map(([partyName, grp]) => {
      // Use the first delivery address as the primary location for rate matching;
      // null means matchRate will fall back to partyName inside computeCarrierCost.
      const primaryLocationText = grp.locationTexts.find(l => l !== partyName) ?? grp.locationTexts[0] ?? null;
      const carrierCosts: Record<string, { matched: boolean; rate: number | null; minRate: number | null; maxRate: number | null; estimatedCost: number | null; location: string | null }> = {};
      for (const carrier of activeCarriers) {
        carrierCosts[carrier.id] = computeCarrierCost(partyName, primaryLocationText, grp.orderIds.length, carrier);
      }
      const suggestion = suggestCarrier(partyName, grp.totalCases, grp.orderIds.length, grp.locationTexts, carrierCosts);
      return {
        partyName,
        location: primaryLocationText !== partyName ? primaryLocationText : null,
        orderCount: grp.orderIds.length,
        totalCases: grp.totalCases,
        orderIds: grp.orderIds,
        carrierCosts,
        suggestion,
      };
    }).sort((a, b) => a.partyName.localeCompare(b.partyName));

    // Group assigned by dispatchBy, computing per-party cost using matched carrier
    // Track locationText (deliveryAddress) per party for accurate cost computation
    const assignedGroups = new Map<string, { orderIds: string[]; totalCases: number; partyOrders: Map<string, { count: number; locationText: string | null }> }>();
    for (const order of assignedOrders) {
      const key = order.dispatchBy!;
      if (!assignedGroups.has(key)) assignedGroups.set(key, { orderIds: [], totalCases: 0, partyOrders: new Map() });
      const grp = assignedGroups.get(key)!;
      grp.orderIds.push(order.id);
      grp.totalCases += order.cases || 0;
      const pn = order.partyName || "(No Party)";
      const locationText = order.deliveryAddress || order.partyName || null;
      const existing = grp.partyOrders.get(pn);
      if (existing) {
        existing.count++;
        if (!existing.locationText && locationText) existing.locationText = locationText;
      } else {
        grp.partyOrders.set(pn, { count: 1, locationText });
      }
    }

    const assigned = Array.from(assignedGroups.entries()).map(([dispatchBy, grp]) => {
      // Find the carrier whose name matches dispatchBy
      const carrier = activeCarriers.find(c => c.name.toLowerCase() === dispatchBy.toLowerCase());
      let estimatedCost: number | null = null;
      if (carrier) {
        let total = 0;
        let allMatched = true;
        for (const [partyName, { count, locationText }] of grp.partyOrders.entries()) {
          const cost = computeCarrierCost(partyName, locationText, count, carrier);
          if (cost.estimatedCost !== null) {
            total += cost.estimatedCost;
          } else {
            allMatched = false;
          }
        }
        estimatedCost = allMatched ? total : null;
      }
      return {
        dispatchBy,
        orderCount: grp.orderIds.length,
        totalCases: grp.totalCases,
        orderIds: grp.orderIds,
        estimatedCost,
      };
    }).sort((a, b) => a.dispatchBy.localeCompare(b.dispatchBy));

    return { carriers: activeCarriers, unassigned, assigned };
  }

  async assignTransportToOrders(orderIds: string[], dispatchBy: string): Promise<number> {
    if (orderIds.length === 0) return 0;
    // Only assign transport to Invoiced orders to prevent accidental modification of other statuses
    const result = await db.update(orders)
      .set({ dispatchBy })
      .where(and(inArray(orders.id, orderIds), eq(orders.status, "Invoiced")));
    return result.rowCount ?? 0;
  }

  async unassignTransportFromOrders(orderIds: string[]): Promise<number> {
    if (orderIds.length === 0) return 0;
    const result = await db.update(orders)
      .set({ dispatchBy: null })
      .where(and(inArray(orders.id, orderIds), eq(orders.status, "Invoiced")));
    return result.rowCount ?? 0;
  }

}

export const storage = new DatabaseStorage();
