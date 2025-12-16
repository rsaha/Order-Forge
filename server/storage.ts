import {
  users,
  products,
  userProducts,
  orders,
  orderItems,
  type User,
  type UpsertUser,
  type Product,
  type InsertProduct,
  type UserProduct,
  type InsertUserProduct,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type UpdateOrder,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, desc } from "drizzle-orm";

export interface IStorage {
  // User operations - required for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Product operations
  getProduct(id: string): Promise<Product | undefined>;
  getAllProducts(): Promise<Product[]>;
  createProduct(product: InsertProduct): Promise<Product>;
  createProducts(productList: InsertProduct[]): Promise<Product[]>;
  
  // User-Product assignment operations
  getUserProducts(userId: string): Promise<Product[]>;
  assignProductToUser(assignment: InsertUserProduct): Promise<UserProduct>;
  assignProductsToUser(userId: string, productIds: string[]): Promise<void>;
  removeProductFromUser(userId: string, productId: string): Promise<void>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  getUserOrders(userId: string): Promise<Order[]>;
  getAllOrders(status?: string): Promise<Order[]>;
  getOrderById(id: string): Promise<Order | undefined>;
  getOrderItems(orderId: string): Promise<OrderItem[]>;
  updateOrder(id: string, updates: UpdateOrder): Promise<Order | undefined>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
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

  async getAllOrders(status?: string): Promise<Order[]> {
    if (status) {
      return db.select().from(orders).where(eq(orders.status, status)).orderBy(desc(orders.createdAt));
    }
    return db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
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

    if (Object.keys(updateData).length === 0) {
      return this.getOrderById(id);
    }

    const [updated] = await db.update(orders).set(updateData).where(eq(orders.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
