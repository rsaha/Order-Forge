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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";

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
    return db.select().from(orders).where(eq(orders.userId, userId));
  }
}

export const storage = new DatabaseStorage();
