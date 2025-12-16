import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProductSchema } from "@shared/schema";
import * as XLSX from "xlsx";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

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

  // Get user's assigned products
  app.get('/api/products', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const products = await storage.getUserProducts(userId);
      res.json(products);
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

      // Validate required columns: Brand, Product Name, SKU (MRP is optional)
      const firstRow = jsonData[0];
      const columnKeys = Object.keys(firstRow);
      
      // Check for required columns (case-insensitive)
      const hasBrand = columnKeys.some(k => /^brand$/i.test(k));
      const hasProductName = columnKeys.some(k => /^(product\s*name|name|product)$/i.test(k));
      const hasSku = columnKeys.some(k => /^(product\s*sku\s*id|sku\s*id|sku|product\s*sku)$/i.test(k));
      
      if (!hasBrand || !hasProductName || !hasSku) {
        const missing = [];
        if (!hasBrand) missing.push("Brand");
        if (!hasProductName) missing.push("Product Name");
        if (!hasSku) missing.push("Product SKU ID");
        return res.status(400).json({ 
          message: `Missing required columns: ${missing.join(", ")}. Required structure: Brand, Product Name, Product SKU ID, MRP (optional)` 
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
        const name = getValue(row, [/^(product\s*name|name|product)$/i]) || "";
        const sku = getValue(row, [/^(product\s*sku\s*id|sku\s*id|sku|product\s*sku)$/i]) || "";
        const mrp = getValue(row, [/^(mrp|price|cost)$/i]);
        
        return {
          sku: sku.trim(),
          name: name.trim(),
          brand: brand.trim(),
          price: mrp ? String(Number(mrp) || 0) : "0",
          stock: 0,
          category: null,
        };
      }).filter(p => p.sku && p.name && p.brand); // Filter out incomplete rows

      if (productsToCreate.length === 0) {
        return res.status(400).json({ 
          message: "No valid products found. Each row must have Brand, Product Name, and SKU ID" 
        });
      }

      const createdProducts = await storage.createProducts(productsToCreate);
      
      // Assign products to user
      const productIds = createdProducts.map(p => p.id);
      await storage.assignProductsToUser(userId, productIds);

      const uploadedBrands = [...new Set(createdProducts.map(p => p.brand))];
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

  // Create order
  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { items, whatsappPhone, email, total } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "No items in order" });
      }

      const order = await storage.createOrder({
        userId,
        total: String(total),
        whatsappPhone,
        email,
        status: "pending",
      });

      const orderItemsData = items.map((item: any) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
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
        // Common patterns:
        // "Product Name - Qty" or "Product Name x Qty" or "SKU Qty" or "Product Name 2"
        const qtyMatch = line.match(/^(.+?)[\s\-x]+(\d+)\s*(?:case|cse|pcs|pc|units?)?$/i) ||
                         line.match(/^(.+?)\s+(\d+)$/);
        
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

      // Try to match parsed items with user's products
      const userId = req.user.claims.sub;
      const userProducts = await storage.getUserProducts(userId);

      const matchedItems = parsedItems.map(item => {
        const productRef = item.productRef.toLowerCase().trim();
        
        // Find matching product by SKU or name
        const matchedProduct = userProducts.find(p => {
          const sku = p.sku.toLowerCase();
          const name = p.name.toLowerCase();
          return sku === productRef || name === productRef ||
                 sku.includes(productRef) || productRef.includes(sku) ||
                 name.includes(productRef) || productRef.includes(name);
        });

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

  return httpServer;
}
