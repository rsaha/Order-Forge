import {
  users,
  products,
  userProducts,
  userBrandAccess,
  orders,
  orderItems,
  type User,
  type UpsertUser,
  type Product,
  type InsertProduct,
  type UserProduct,
  type InsertUserProduct,
  type UserBrandAccess,
  type InsertUserBrandAccess,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type UpdateOrder,
  type UpdateProduct,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, desc } from "drizzle-orm";

export interface IStorage {
  // User operations - required for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string): Promise<User | undefined>;
  deleteUser(userId: string): Promise<boolean>;
  
  // Product operations
  getProduct(id: string): Promise<Product | undefined>;
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  createProducts(productList: InsertProduct[]): Promise<Product[]>;
  updateProduct(id: string, updates: UpdateProduct): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  
  // User-Product assignment operations
  getUserProducts(userId: string): Promise<Product[]>;
  assignProductToUser(assignment: InsertUserProduct): Promise<UserProduct>;
  assignProductsToUser(userId: string, productIds: string[]): Promise<void>;
  removeProductFromUser(userId: string, productId: string): Promise<void>;
  
  // User-Brand access operations
  getUserBrandAccess(userId: string): Promise<string[]>;
  setUserBrandAccess(userId: string, brands: string[]): Promise<void>;
  getUserProductsByBrand(userId: string, isAdmin: boolean): Promise<Product[]>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  getUserOrders(userId: string): Promise<Order[]>;
  getAllOrders(filters?: { status?: string; deliveryCompany?: string }): Promise<Order[]>;
  getOrdersByBrands(brands: string[], filters?: { status?: string; deliveryCompany?: string }): Promise<Order[]>;
  getOrderById(id: string): Promise<Order | undefined>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  updateOrder(id: string, updates: UpdateOrder): Promise<Order | undefined>;
  appendItemsToOrder(orderId: string, items: InsertOrderItem[], discountPercent?: number): Promise<Order | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // First try to find existing user by ID or email
    const existingById = userData.id ? await this.getUser(userData.id) : null;
    const existingByEmail = userData.email ? 
      await db.select().from(users).where(eq(users.email, userData.email)).then(r => r[0]) : null;
    
    const updateData = {
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
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
        
        // Get existing brand access and products for this user
        const existingBrandAccess = await db.select().from(userBrandAccess).where(eq(userBrandAccess.userId, oldId));
        const existingUserProducts = await db.select().from(userProducts).where(eq(userProducts.userId, oldId));
        
        // Delete old FK references
        await db.delete(userBrandAccess).where(eq(userBrandAccess.userId, oldId));
        await db.delete(userProducts).where(eq(userProducts.userId, oldId));
        
        // Update orders to point to new ID (orders don't have unique constraint issues)
        await db.update(orders).set({ userId: newId }).where(eq(orders.userId, oldId));
        
        // Delete old user and create new one with the new ID
        await db.delete(users).where(eq(users.id, oldId));
        
        const [newUser] = await db
          .insert(users)
          .values({
            ...userData,
            isAdmin: existingByEmail.isAdmin,
            role: existingByEmail.role,
          })
          .returning();
        
        // Recreate FK references with new user ID
        for (const access of existingBrandAccess) {
          await db.insert(userBrandAccess).values({ userId: newId, brand: access.brand }).onConflictDoNothing();
        }
        for (const product of existingUserProducts) {
          await db.insert(userProducts).values({ userId: newId, productId: product.productId }).onConflictDoNothing();
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

  async deleteUser(userId: string): Promise<boolean> {
    // Delete user's brand access
    await db.delete(userBrandAccess).where(eq(userBrandAccess.userId, userId));
    // Delete user's product assignments
    await db.delete(userProducts).where(eq(userProducts.userId, userId));
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
    if (updates.price !== undefined) updateData.price = updates.price;
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
    await db.delete(userProducts).where(eq(userProducts.productId, id));
    await db.delete(products).where(eq(products.id, id));
    return true;
  }

  // User-Product assignment operations
  async getUserProducts(userId: string): Promise<Product[]> {
    const assignments = await db
      .select({ productId: userProducts.productId })
      .from(userProducts)
      .where(eq(userProducts.userId, userId));
    
    if (assignments.length === 0) return [];
    
    const productIds = assignments.map(a => a.productId);
    return db.select().from(products).where(inArray(products.id, productIds));
  }

  async assignProductToUser(assignment: InsertUserProduct): Promise<UserProduct> {
    const [userProduct] = await db.insert(userProducts).values(assignment).returning();
    return userProduct;
  }

  async assignProductsToUser(userId: string, productIds: string[]): Promise<void> {
    if (productIds.length === 0) return;
    
    const assignments = productIds.map(productId => ({
      userId,
      productId,
    }));
    
    await db.insert(userProducts).values(assignments).onConflictDoNothing();
  }

  async removeProductFromUser(userId: string, productId: string): Promise<void> {
    await db.delete(userProducts).where(
      and(
        eq(userProducts.userId, userId),
        eq(userProducts.productId, productId)
      )
    );
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

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }

  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    if (items.length === 0) return [];
    return db.insert(orderItems).values(items).returning();
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async getAllOrders(filters?: { status?: string; deliveryCompany?: string }): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null })[]> {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(orders.status, filters.status));
    }
    if (filters?.deliveryCompany) {
      conditions.push(eq(orders.deliveryCompany, filters.deliveryCompany));
    }
    
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
      remarks: orders.remarks,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      deliveryCost: orders.deliveryCost,
      deliveryNote: orders.deliveryNote,
      deliveryCompany: orders.deliveryCompany,
      createdAt: orders.createdAt,
      createdByName: users.firstName,
      createdByEmail: users.email,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .orderBy(desc(orders.createdAt));
    
    if (conditions.length > 0) {
      return baseQuery.where(and(...conditions));
    }
    return baseQuery;
  }

  async getOrdersByBrands(brands: string[], filters?: { status?: string; deliveryCompany?: string }): Promise<(Order & { createdByName?: string | null; createdByEmail?: string | null })[]> {
    if (brands.length === 0) return [];
    
    const conditions = [inArray(orders.brand, brands)];
    if (filters?.status) {
      conditions.push(eq(orders.status, filters.status));
    }
    if (filters?.deliveryCompany) {
      conditions.push(eq(orders.deliveryCompany, filters.deliveryCompany));
    }
    
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
      remarks: orders.remarks,
      estimatedDeliveryDate: orders.estimatedDeliveryDate,
      actualDeliveryDate: orders.actualDeliveryDate,
      deliveryCost: orders.deliveryCost,
      deliveryNote: orders.deliveryNote,
      deliveryCompany: orders.deliveryCompany,
      createdAt: orders.createdAt,
      createdByName: users.firstName,
      createdByEmail: users.email,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt));
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
    if (updates.remarks !== undefined) updateData.remarks = updates.remarks;
    if (updates.estimatedDeliveryDate !== undefined) updateData.estimatedDeliveryDate = updates.estimatedDeliveryDate ? new Date(updates.estimatedDeliveryDate) : null;
    if (updates.actualDeliveryDate !== undefined) updateData.actualDeliveryDate = updates.actualDeliveryDate ? new Date(updates.actualDeliveryDate) : null;
    if (updates.deliveryCost !== undefined) updateData.deliveryCost = updates.deliveryCost;
    if (updates.deliveryNote !== undefined) updateData.deliveryNote = updates.deliveryNote;

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
}

export const storage = new DatabaseStorage();
