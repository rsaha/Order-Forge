import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProductSchema, updateOrderSchema, ORDER_STATUSES } from "@shared/schema";
import * as XLSX from "xlsx";
import multer from "multer";
import { getUncachableResendClient } from "./resend";

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
        status: "Created",
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

  // Get all orders (Admin only)
  app.get('/api/admin/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const status = req.query.status as string | undefined;
      const orders = await storage.getAllOrders(status);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching all orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get single order with items (Admin only)
  app.get('/api/admin/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const items = await storage.getOrderItems(order.id);
      res.json({ ...order, items });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Update order (Admin only)
  app.patch('/api/admin/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
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
