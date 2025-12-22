import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProductSchema, updateOrderSchema, updateProductSchema, ORDER_STATUSES, BRAND_OPTIONS, DELIVERY_COMPANY_OPTIONS, USER_ROLES } from "@shared/schema";
import * as XLSX from "xlsx";
import multer from "multer";
import { getUncachableResendClient } from "./resend";

const upload = multer({ storage: multer.memoryStorage() });

// Fuzzy matching utilities
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(query: string, target: string): number {
  const normalizedQuery = normalizeText(query);
  const normalizedTarget = normalizeText(target);
  
  if (normalizedQuery === normalizedTarget) return 1;
  if (normalizedTarget.includes(normalizedQuery) || normalizedQuery.includes(normalizedTarget)) {
    return 0.9;
  }
  
  const queryWords = normalizedQuery.split(' ').filter(w => w.length > 1);
  const targetWords = normalizedTarget.split(' ').filter(w => w.length > 1);
  
  let matchedWords = 0;
  for (const qWord of queryWords) {
    for (const tWord of targetWords) {
      if (tWord.includes(qWord) || qWord.includes(tWord)) {
        matchedWords++;
        break;
      }
      const distance = levenshteinDistance(qWord, tWord);
      const maxLen = Math.max(qWord.length, tWord.length);
      if (distance <= Math.floor(maxLen * 0.3)) {
        matchedWords++;
        break;
      }
    }
  }
  
  if (queryWords.length === 0) return 0;
  return matchedWords / queryWords.length;
}

function findBestMatch<T extends { sku: string; name: string; aliases?: string | null }>(
  query: string,
  products: T[],
  threshold: number = 0.5
): T | null {
  let bestMatch: T | null = null;
  let bestScore = threshold;
  
  for (const product of products) {
    const skuScore = calculateSimilarity(query, product.sku);
    const nameScore = calculateSimilarity(query, product.name);
    let aliasScore = 0;
    
    if (product.aliases) {
      const aliasesList = product.aliases.split(',').map(a => a.trim()).filter(a => a);
      for (const alias of aliasesList) {
        const score = calculateSimilarity(query, alias);
        if (score > aliasScore) {
          aliasScore = score;
        }
        if (normalizeText(query) === normalizeText(alias)) {
          aliasScore = 1;
          break;
        }
      }
    }
    
    const score = Math.max(skuScore, nameScore, aliasScore);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = product;
    }
  }
  
  return bestMatch;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get user's assigned products (filtered by brand access for all non-admin users)
  app.get('/api/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Admin sees all products
      if (user?.isAdmin) {
        const products = await storage.getAllProducts();
        return res.json(products);
      }
      
      // Both BrandAdmin and regular users see only products from their assigned brands
      const brandProducts = await storage.getUserProductsByBrand(userId, false);
      res.json(brandProducts);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Upload SKU file and assign products to user (Admin only)
  app.post('/api/products/upload', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      // Check if user is admin
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Only administrators can upload products" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Check file extension - only allow Excel files
      const filename = req.file.originalname.toLowerCase();
      if (!filename.endsWith('.xlsx') && !filename.endsWith('.xls')) {
        return res.status(400).json({ 
          message: "Invalid file format. Only Excel files (.xlsx, .xls) are allowed" 
        });
      }
      
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

      if (jsonData.length === 0) {
        return res.status(400).json({ message: "The uploaded file contains no data" });
      }

      // Validate required columns: Brand, Name, Product SKU ID, Size (MRP is optional)
      const firstRow = jsonData[0];
      const columnKeys = Object.keys(firstRow);
      
      // Check for required columns (case-insensitive)
      const hasBrand = columnKeys.some(k => /^brand$/i.test(k));
      const hasName = columnKeys.some(k => /^(name|product\s*name)$/i.test(k));
      const hasSku = columnKeys.some(k => /^(product\s*sku\s*id|sku\s*id|sku|product\s*sku)$/i.test(k));
      const hasSize = columnKeys.some(k => /^size$/i.test(k));
      
      if (!hasBrand || !hasName || !hasSku || !hasSize) {
        const missing = [];
        if (!hasBrand) missing.push("Brand");
        if (!hasName) missing.push("Name");
        if (!hasSku) missing.push("Product SKU ID");
        if (!hasSize) missing.push("Size");
        return res.status(400).json({ 
          message: `Missing required columns: ${missing.join(", ")}. Required structure: Brand, Name, Product SKU ID, Size, MRP (optional)` 
        });
      }

      // Helper to get value from row with flexible column names
      const getValue = (row: Record<string, unknown>, patterns: RegExp[]): string | null => {
        for (const key of Object.keys(row)) {
          if (patterns.some(p => p.test(key))) {
            return row[key] != null ? String(row[key]) : null;
          }
        }
        return null;
      };

      const productsToCreate = jsonData.map((row) => {
        const brand = getValue(row, [/^brand$/i]) || "";
        const name = getValue(row, [/^(name|product\s*name)$/i]) || "";
        const sku = getValue(row, [/^(product\s*sku\s*id|sku\s*id|sku|product\s*sku)$/i]) || "";
        const size = getValue(row, [/^size$/i]) || "";
        const mrp = getValue(row, [/^(mrp|price|cost)$/i]);
        
        return {
          sku: sku.trim(),
          name: name.trim(),
          brand: brand.trim(),
          size: size.trim() || null,
          price: mrp ? String(Number(mrp) || 0) : "0",
          stock: 0,
          category: null,
        };
      }).filter(p => p.sku && p.name && p.brand); // Filter out incomplete rows

      if (productsToCreate.length === 0) {
        return res.status(400).json({ 
          message: "No valid products found. Each row must have Brand, Name, Product SKU ID, and Size" 
        });
      }

      const createdProducts = await storage.createProducts(productsToCreate);
      
      // Assign products to user
      const productIds = createdProducts.map(p => p.id);
      await storage.assignProductsToUser(userId, productIds);

      const uploadedBrands = Array.from(new Set(createdProducts.map(p => p.brand)));
      res.json({
        message: "Products uploaded successfully",
        count: createdProducts.length,
        fileName: req.file.originalname,
        brand: uploadedBrands.join(", "),
      });
    } catch (error) {
      console.error("Error uploading products:", error);
      res.status(500).json({ message: "Failed to upload products" });
    }
  });

  // Update product (Admin only)
  app.patch('/api/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Only administrators can update products" });
      }

      const productId = req.params.id;
      
      const parseResult = updateProductSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid product data", errors: parseResult.error.errors });
      }

      const updated = await storage.updateProduct(productId, parseResult.data);
      if (!updated) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  // Delete product (Admin only)
  app.delete('/api/products/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Only administrators can delete products" });
      }

      const productId = req.params.id;
      const deleted = await storage.deleteProduct(productId);
      if (!deleted) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Get products filtered by user's brand access (for Order page)
  app.get('/api/products/by-brand', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const isAdmin = user?.isAdmin || false;
      const products = await storage.getUserProductsByBrand(userId, isAdmin);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products by brand:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Get user's brand access
  app.get('/api/users/:userId/brand-access', isAuthenticated, async (req: any, res) => {
    try {
      const requestingUserId = req.user.claims.sub;
      const requestingUser = await storage.getUser(requestingUserId);
      const targetUserId = req.params.userId;
      
      if (!requestingUser?.isAdmin && requestingUserId !== targetUserId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const brands = await storage.getUserBrandAccess(targetUserId);
      res.json({ brands });
    } catch (error) {
      console.error("Error fetching brand access:", error);
      res.status(500).json({ message: "Failed to fetch brand access" });
    }
  });

  // Set user's brand access (Admin only)
  app.put('/api/users/:userId/brand-access', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Only administrators can manage brand access" });
      }

      const targetUserId = req.params.userId;
      const { brands } = req.body;
      
      if (!Array.isArray(brands)) {
        return res.status(400).json({ message: "Brands must be an array" });
      }
      
      const validBrands = brands.filter(b => BRAND_OPTIONS.includes(b));
      await storage.setUserBrandAccess(targetUserId, validBrands);
      
      res.json({ message: "Brand access updated", brands: validBrands });
    } catch (error) {
      console.error("Error setting brand access:", error);
      res.status(500).json({ message: "Failed to set brand access" });
    }
  });

  // Get available brand and delivery company options
  app.get('/api/options', isAuthenticated, async (req: any, res) => {
    res.json({
      brands: BRAND_OPTIONS,
      deliveryCompanies: DELIVERY_COMPANY_OPTIONS,
    });
  });

  // Create order
  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { items, whatsappPhone, email, total, partyName, deliveryNote, deliveryCompany, brand } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "No items in order" });
      }

      if (!partyName || partyName.trim() === "") {
        return res.status(400).json({ message: "Party name is required" });
      }

      if (!brand || typeof brand !== 'string' || brand.trim() === '') {
        return res.status(400).json({ message: "Order brand is required" });
      }

      const productIds = items.map((item: any) => item.productId);
      const orderedProducts = await Promise.all(productIds.map((id: string) => storage.getProduct(id)));
      const invalidProducts = orderedProducts.some(p => !p);
      if (invalidProducts) {
        return res.status(400).json({ message: "One or more products not found" });
      }

      const allSameBrand = orderedProducts.every(p => p && p.brand === brand);
      if (!allSameBrand) {
        return res.status(400).json({ message: "All products must be from the same brand" });
      }

      const order = await storage.createOrder({
        userId,
        brand: brand.trim(),
        total: String(total),
        whatsappPhone,
        email,
        partyName: partyName.trim(),
        deliveryNote: deliveryNote || null,
        deliveryCompany: deliveryCompany || "Guided",
        status: "Created",
      });

      const orderItemsData = items.map((item: any) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: String(item.price || item.unitPrice || "0"),
      }));

      await storage.createOrderItems(orderItemsData);

      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Get user's orders
  app.get('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const orders = await storage.getUserOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get single order with items for the user who owns it
  app.get('/api/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const order = await storage.getOrderById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Check if user owns this order
      if (order.userId !== userId) {
        return res.status(403).json({ message: "Access denied to this order" });
      }
      
      const items = await storage.getOrderItems(order.id);
      res.json({ ...order, items });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Get all orders (Admin and BrandAdmin)
  app.get('/api/admin/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin && user?.role !== 'BrandAdmin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const filters: { status?: string; deliveryCompany?: string } = {};
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.deliveryCompany) filters.deliveryCompany = req.query.deliveryCompany as string;
      
      let orders;
      if (user.isAdmin) {
        orders = await storage.getAllOrders(Object.keys(filters).length > 0 ? filters : undefined);
      } else {
        const brands = await storage.getUserBrandAccess(userId);
        orders = await storage.getOrdersByBrands(brands, Object.keys(filters).length > 0 ? filters : undefined);
      }
      
      res.json(orders);
    } catch (error) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get single order with items (Admin and BrandAdmin)
  app.get('/api/admin/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin && user?.role !== 'BrandAdmin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // BrandAdmin can access orders if they own it OR if the order's brand is in their brand access
      if (!user.isAdmin && user.role === 'BrandAdmin') {
        const isOwner = order.userId === userId;
        const brands = await storage.getUserBrandAccess(userId);
        const hasBrandAccess = order.brand && brands.includes(order.brand);
        
        if (!isOwner && !hasBrandAccess) {
          return res.status(403).json({ message: "Access denied to this order" });
        }
      }

      const items = await storage.getOrderItems(order.id);
      res.json({ ...order, items });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Update order (Admin and BrandAdmin with limited permissions)
  app.patch('/api/admin/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin && user?.role !== 'BrandAdmin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!user.isAdmin && user.role === 'BrandAdmin') {
        const brands = await storage.getUserBrandAccess(userId);
        if (!order.brand || !brands.includes(order.brand)) {
          return res.status(403).json({ message: "Access denied to this order" });
        }

        if (req.body.status) {
          if (order.status !== 'Approved' || req.body.status !== 'Invoiced') {
            return res.status(403).json({ message: "BrandAdmin can only change status from Approved to Invoiced" });
          }
          req.body = { status: 'Invoiced' };
        } else {
          return res.status(403).json({ message: "BrandAdmin can only update order status" });
        }
      }

      const parseResult = updateOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid update data", errors: parseResult.error.errors });
      }

      const updatedOrder = await storage.updateOrder(req.params.id, parseResult.data);
      if (!updatedOrder) {
        return res.status(404).json({ message: "Order not found" });
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  // Add items to an existing order (only when status is Created or Approved)
  app.post('/api/orders/:id/items', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const orderId = req.params.id;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if order is editable (Created or Approved status)
      if (!['Created', 'Approved'].includes(order.status)) {
        return res.status(400).json({ 
          message: `Cannot modify order with status "${order.status}". Only Created or Approved orders can be modified.` 
        });
      }

      // Check permissions: user owns the order, or is admin, or is brand admin for the brand
      const isOwner = order.userId === userId;
      const isAdmin = user?.isAdmin === true;
      let isBrandAdmin = false;
      
      if (user?.role === 'BrandAdmin' && order.brand) {
        const brandAccess = await storage.getUserBrandAccess(userId);
        isBrandAdmin = brandAccess.includes(order.brand);
      }

      if (!isOwner && !isAdmin && !isBrandAdmin) {
        return res.status(403).json({ message: "Access denied to this order" });
      }

      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      // Validate all products exist and are from the same brand as the order
      for (const item of items) {
        if (!item.productId || !item.quantity || item.quantity < 1) {
          return res.status(400).json({ message: "Each item must have productId and quantity > 0" });
        }
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product not found: ${item.productId}` });
        }
        if (product.brand !== order.brand) {
          return res.status(400).json({ 
            message: `Product "${product.name}" is from brand "${product.brand}" but order is for brand "${order.brand}". All products must match the order brand.` 
          });
        }
      }

      // Prepare items for insertion
      const orderItemsData = await Promise.all(items.map(async (item: { productId: string; quantity: number }) => {
        const product = await storage.getProduct(item.productId);
        return {
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: product ? String(product.price) : "0",
        };
      }));

      const updatedOrder = await storage.appendItemsToOrder(orderId, orderItemsData);
      if (!updatedOrder) {
        return res.status(500).json({ message: "Failed to update order" });
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error adding items to order:", error);
      res.status(500).json({ message: "Failed to add items to order" });
    }
  });

  // Parse order from text - simple pattern matching
  app.post('/api/orders/parse-text', isAuthenticated, async (req: any, res) => {
    try {
      const { text } = req.body;
      
      if (!text || !text.trim()) {
        return res.status(400).json({ message: "No text provided" });
      }

      // Simple text parsing - split by lines and extract patterns
      const allLines = text.split(/[\n]+/).map((l: string) => l.trim()).filter((l: string) => l);
      
      // First line is the party/customer name
      const partyName = allLines.length > 0 ? allLines[0] : "";
      const productLines = allLines.slice(1); // Skip first line for product parsing
      
      // Further split by comma/semicolon for product lines
      const lines: string[] = [];
      for (const line of productLines) {
        const parts = line.split(/[,;]+/).map((p: string) => p.trim()).filter((p: string) => p);
        lines.push(...parts);
      }
      
      const parsedItems: Array<{rawText: string; productRef: string; quantity: number}> = [];
      
      for (const line of lines) {
        // Structure: Product Name, Optional Size, then Qty (with possible punctuation before qty)
        // Examples: "L.S Belt 2", "Knee Cap - 3", "Product Name x 5", "Product Large Size -3", "Item.5"
        // Match quantity at the end, with optional punctuation/separators before it
        const qtyMatch = line.match(/^(.+?)[\s\-x.:;]+(\d+)\s*(?:case|cse|pcs|pc|units?)?$/i) ||
                         line.match(/^(.+?)\s+(\d+)$/i) ||
                         line.match(/^(.+?)\.(\d+)$/i);
        
        if (qtyMatch) {
          parsedItems.push({
            rawText: line,
            productRef: qtyMatch[1].trim(),
            quantity: parseInt(qtyMatch[2]) || 1,
          });
        } else if (line.length > 0) {
          // No quantity found, assume 1
          parsedItems.push({
            rawText: line,
            productRef: line,
            quantity: 1,
          });
        }
      }

      // Try to match parsed items with user's products using fuzzy matching
      const userId = req.user.claims.sub;
      const userProducts = await storage.getUserProducts(userId);

      const matchedItems = parsedItems.map(item => {
        const productRef = item.productRef.trim();
        
        // Use fuzzy matching to find the best matching product
        const matchedProduct = findBestMatch(productRef, userProducts, 0.4);

        return {
          ...item,
          matchedProduct: matchedProduct ? {
            id: matchedProduct.id,
            sku: matchedProduct.sku,
            name: matchedProduct.name,
            brand: matchedProduct.brand,
            price: Number(matchedProduct.price),
          } : null,
        };
      });

      res.json({ partyName, items: matchedItems });
    } catch (error) {
      console.error("Error parsing order text:", error);
      res.status(500).json({ message: "Failed to parse order text" });
    }
  });

  // === User Management (Admin only) ===
  
  // Get all users (Admin only)
  app.get('/api/admin/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const allUsers = await storage.getAllUsers();
      
      // Get brand access for each user
      const usersWithBrands = await Promise.all(
        allUsers.map(async (u) => {
          const brands = await storage.getUserBrandAccess(u.id);
          return { ...u, brandAccess: brands };
        })
      );
      
      res.json(usersWithBrands);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Update user role (Admin only)
  app.patch('/api/admin/users/:id/role', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { role } = req.body;

      if (!role || !USER_ROLES.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${USER_ROLES.join(', ')}` });
      }

      const updatedUser = await storage.updateUserRole(targetUserId, role);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Delete a user (Admin only)
  app.delete('/api/admin/users/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      
      // Prevent self-deletion
      if (targetUserId === userId) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      const deleted = await storage.deleteUser(targetUserId);
      if (!deleted) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Get user role options
  app.get('/api/options/roles', isAuthenticated, async (req: any, res) => {
    res.json({ roles: USER_ROLES });
  });

  // Send order via email with CSV attachment
  app.post('/api/orders/send-email', isAuthenticated, async (req: any, res) => {
    try {
      const { email, orderDetails, cart, discountPercent } = req.body;
      
      if (!email || !email.trim()) {
        return res.status(400).json({ message: "Email address is required" });
      }
      
      if (!cart || cart.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }

      // Generate CSV content
      const csvRows: string[] = [];
      
      // Header row
      csvRows.push("SKU,Product,Brand,Quantity,Unit Price (INR),Subtotal (INR)");
      
      // Item rows
      let subtotal = 0;
      let totalQty = 0;
      for (const item of cart) {
        const itemSubtotal = item.product.price * item.quantity;
        subtotal += itemSubtotal;
        totalQty += item.quantity;
        csvRows.push(`"${item.product.sku}","${item.product.name}","${item.product.brand}",${item.quantity},${item.product.price},${itemSubtotal}`);
      }
      
      // Add blank row then totals
      csvRows.push("");
      csvRows.push(`"SUBTOTAL","","",${totalQty},0,${subtotal}`);
      
      const safeDiscount = Math.min(100, Math.max(0, discountPercent || 0));
      const discountAmount = subtotal * (safeDiscount / 100);
      const finalTotal = subtotal - discountAmount;
      
      if (safeDiscount > 0) {
        csvRows.push(`"DISCOUNT (${safeDiscount}%)","","",0,0,-${discountAmount}`);
      }
      csvRows.push(`"TOTAL","","",0,0,${finalTotal}`);
      
      const csvContent = csvRows.join("\n");

      // Build email body
      const emailLines = ["Order Details", "=".repeat(40), ""];
      if (orderDetails?.partyName) {
        emailLines.push(`Party Name: ${orderDetails.partyName}`);
      }
      if (orderDetails?.brand) {
        emailLines.push(`Brand: ${orderDetails.brand}`);
      }
      if (orderDetails?.deliveryNotes) {
        emailLines.push(`Delivery Notes: ${orderDetails.deliveryNotes}`);
      }
      if (orderDetails?.specialNotes) {
        emailLines.push(`Special Notes: ${orderDetails.specialNotes}`);
      }
      emailLines.push("");
      emailLines.push(`Total Items: ${totalQty}`);
      emailLines.push(`Subtotal: INR ${subtotal.toFixed(2)}`);
      if (safeDiscount > 0) {
        emailLines.push(`Discount (${safeDiscount}%): -INR ${discountAmount.toFixed(2)}`);
      }
      emailLines.push(`Total: INR ${finalTotal.toFixed(2)}`);
      emailLines.push("");
      emailLines.push("Please see the attached CSV file for the full order details.");

      // Send email via Resend
      const { client, fromEmail } = await getUncachableResendClient();
      
      const result = await client.emails.send({
        from: fromEmail,
        to: [email],
        subject: `Order from ${orderDetails?.partyName || 'Customer'} - ${new Date().toLocaleDateString()}`,
        text: emailLines.join("\n"),
        attachments: [
          {
            filename: `order-${Date.now()}.csv`,
            content: Buffer.from(csvContent, 'utf8'),
            contentType: 'text/csv',
          }
        ],
      });

      if (result.error) {
        console.error("Resend error:", result.error);
        return res.status(500).json({ message: "Failed to send email: " + result.error.message });
      }

      res.json({ message: "Order sent successfully", emailId: result.data?.id });
    } catch (error: any) {
      console.error("Error sending order email:", error);
      res.status(500).json({ message: error.message || "Failed to send order email" });
    }
  });

  return httpServer;
}
