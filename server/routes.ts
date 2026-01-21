import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProductSchema, updateOrderSchema, updateProductSchema, insertBrandSchema, ORDER_STATUSES, BRAND_OPTIONS, DELIVERY_COMPANY_OPTIONS, USER_ROLES } from "@shared/schema";
import * as XLSX from "xlsx";
import multer from "multer";
import { getUncachableResendClient } from "./resend";
import memoize from "memoizee";

const upload = multer({ storage: multer.memoryStorage() });

// In-memory cache for analytics with 2-minute TTL
// Cache stores results by filter key, but passes original filters to preserve Date types
const analyticsCache = new Map<string, { data: any; timestamp: number }>();
const ANALYTICS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// In-memory cache for product popularity with 1-hour TTL
let popularityCache: { data: Record<string, number>; timestamp: number } | null = null;
const POPULARITY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCachedAnalytics(filters: any): Promise<any> {
  // Create a stable cache key from filters
  const cacheKey = JSON.stringify({
    fromDate: filters.fromDate?.toISOString(),
    toDate: filters.toDate?.toISOString(),
    brand: filters.brand,
  });
  
  const cached = analyticsCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < ANALYTICS_CACHE_TTL) {
    return cached.data;
  }
  
  // Fetch fresh data - filters still have proper Date objects
  const data = await storage.getOrderAnalytics(filters);
  analyticsCache.set(cacheKey, { data, timestamp: now });
  
  // Clean up old cache entries periodically
  if (analyticsCache.size > 100) {
    const entries = Array.from(analyticsCache.entries());
    for (const [key, value] of entries) {
      if (now - value.timestamp > ANALYTICS_CACHE_TTL) {
        analyticsCache.delete(key);
      }
    }
  }
  
  return data;
}

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
  
  // Exact match
  if (normalizedQuery === normalizedTarget) return 1;
  
  // Substring match - very high score if query is contained in target as a phrase
  if (normalizedTarget.includes(normalizedQuery)) {
    // Score higher for longer query matches
    return 0.95 + (normalizedQuery.length / normalizedTarget.length) * 0.05;
  }
  if (normalizedQuery.includes(normalizedTarget)) {
    return 0.9;
  }
  
  const queryWords = normalizedQuery.split(' ').filter(w => w.length > 0);
  const targetWords = normalizedTarget.split(' ').filter(w => w.length > 0);
  const validQueryWords = queryWords.filter(w => w.length >= 2);
  
  if (validQueryWords.length === 0) return 0;
  
  // CRITICAL: Check if ALL query words are present in target (exact word match)
  // This is the key to fixing "knee cap" matching "KNEE CAP (PAIR)" over "OA KNEE SUPPORT"
  let exactWordMatches = 0;
  let fuzzyWordMatches = 0;
  
  for (const qWord of validQueryWords) {
    let foundExact = false;
    let foundFuzzy = false;
    
    for (const tWord of targetWords) {
      if (tWord === qWord) {
        foundExact = true;
        break;
      }
      // Check prefix match (query word is prefix of target word)
      if (tWord.startsWith(qWord) && qWord.length >= 3) {
        foundFuzzy = true;
      }
      // Fuzzy match with low tolerance
      const distance = levenshteinDistance(qWord, tWord);
      const maxLen = Math.max(qWord.length, tWord.length);
      if (distance <= 1 && maxLen >= 3) {
        foundFuzzy = true;
      }
    }
    
    if (foundExact) exactWordMatches++;
    else if (foundFuzzy) fuzzyWordMatches++;
  }
  
  // If ALL query words are exact matches in target - very high score
  if (exactWordMatches === validQueryWords.length) {
    return 0.92 + (validQueryWords.length / targetWords.length) * 0.05;
  }
  
  // If ALL query words match (exact or fuzzy) - high score
  if (exactWordMatches + fuzzyWordMatches === validQueryWords.length) {
    const exactRatio = exactWordMatches / validQueryWords.length;
    return 0.8 + exactRatio * 0.1;
  }
  
  // Check if query starts with target or vice versa (prefix matching)
  if (normalizedTarget.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedTarget)) {
    return 0.75;
  }
  
  // Single word query - check each word in target
  if (queryWords.length === 1 && queryWords[0].length >= 2) {
    const qWord = queryWords[0];
    for (const tWord of targetWords) {
      // Exact word match
      if (tWord === qWord) return 0.9;
      // Word contains query
      if (tWord.includes(qWord)) return 0.7;
      // Query contains word
      if (qWord.includes(tWord)) return 0.65;
      // Word starts with query
      if (tWord.startsWith(qWord)) return 0.7;
      // Fuzzy match for single words
      const distance = levenshteinDistance(qWord, tWord);
      const maxLen = Math.max(qWord.length, tWord.length);
      if (distance <= Math.ceil(maxLen * 0.3)) {
        return 0.5 + (1 - distance / maxLen) * 0.2;
      }
    }
  }
  
  // Multi-word partial matching - PENALIZE when not all words match
  let matchedWords = 0;
  let partialScore = 0;
  for (const qWord of queryWords) {
    if (qWord.length < 2) continue;
    
    let bestWordScore = 0;
    for (const tWord of targetWords) {
      if (tWord === qWord) {
        bestWordScore = 1;
        break;
      }
      if (tWord.includes(qWord) || qWord.includes(tWord)) {
        bestWordScore = Math.max(bestWordScore, 0.7);
        continue;
      }
      if (tWord.startsWith(qWord) || qWord.startsWith(tWord)) {
        bestWordScore = Math.max(bestWordScore, 0.6);
        continue;
      }
      const distance = levenshteinDistance(qWord, tWord);
      const maxLen = Math.max(qWord.length, tWord.length);
      if (distance <= Math.ceil(maxLen * 0.3)) {
        const score = 0.4 + (1 - distance / maxLen) * 0.2;
        bestWordScore = Math.max(bestWordScore, score);
      }
    }
    if (bestWordScore > 0.4) {
      matchedWords++;
      partialScore += bestWordScore;
    }
  }
  
  // If not all words matched, apply heavy penalty
  const matchRatio = matchedWords / validQueryWords.length;
  if (matchRatio < 1) {
    // Penalize partial matches - this ensures "knee cap" doesn't match "knee support" highly
    const avgScore = matchedWords > 0 ? partialScore / matchedWords : 0;
    return matchRatio * avgScore * 0.6; // 40% penalty for partial matches
  }
  
  const avgScore = matchedWords > 0 ? partialScore / matchedWords : 0;
  return matchRatio * avgScore;
}

// Extract size token from query string
// Returns the size and the query without the size
function extractSizeFromQuery(query: string): { size: string | null; queryWithoutSize: string } {
  const normalizedQuery = query.toUpperCase().trim();
  
  // Size patterns to look for - order matters (longer patterns first)
  const sizePatterns = [
    'XXL', 'XL', 'XS', 'SHORT', 'LONG', 'LEFT', 'RIGHT', 'UNI', 'ADULT', 'CHILD',
    'L', 'M', 'S'
  ];
  
  // Check if query ends with a size token (most common case)
  // e.g., "soft collar with support M" or "soft collar with support - L"
  for (const size of sizePatterns) {
    // Pattern: ends with size (possibly with space/dash before)
    const endPattern = new RegExp(`[\\s\\-]+${size}$`, 'i');
    if (endPattern.test(normalizedQuery)) {
      const queryWithoutSize = query.replace(endPattern, '').trim();
      return { size, queryWithoutSize };
    }
    // Also check if it just ends with the size (no separator)
    if (normalizedQuery.endsWith(` ${size}`)) {
      const queryWithoutSize = query.slice(0, -(size.length + 1)).trim();
      return { size, queryWithoutSize };
    }
  }
  
  return { size: null, queryWithoutSize: query };
}

function findBestMatch<T extends { sku: string; name: string; size?: string | null; aliases?: string | null; alias1?: string | null; alias2?: string | null }>(
  query: string,
  products: T[],
  threshold: number = 0.5
): T | null {
  const normalizedQuery = normalizeText(query);
  
  // Extract size from query if present
  const { size: querySize, queryWithoutSize } = extractSizeFromQuery(query);
  
  // FIRST PASS: Check for exact SKU+SIZE matches before fuzzy matching
  // This handles cases like query "F-01-M" matching product with sku="F-01" and size="M"
  for (const product of products) {
    if (product.size) {
      const skuWithSizeDash = normalizeText(`${product.sku}-${product.size}`);
      const skuWithSizeSpace = normalizeText(`${product.sku} ${product.size}`);
      if (normalizedQuery === skuWithSizeDash || normalizedQuery === skuWithSizeSpace) {
        return product; // Exact match on SKU+SIZE - return immediately
      }
    }
    // Also check exact SKU match
    if (normalizedQuery === normalizeText(product.sku)) {
      return product;
    }
  }
  
  // SECOND PASS: Fuzzy matching with size-aware scoring
  let bestMatch: T | null = null;
  let bestScore = threshold;
  
  // Helper to check if query has at least one word overlap with target
  // Uses STRICT matching: exact word match or Levenshtein distance for typos
  // Strict rules to prevent "anklet" matching "ankle":
  // - Exact match always allowed
  // - Fuzzy match only if words are SAME length and distance <= 1, OR
  // - Fuzzy match if words differ by 1 char in length and distance <= 1
  const hasWordOverlap = (queryText: string, targetText: string): boolean => {
    const queryWords = normalizeText(queryText).split(' ').filter(w => w.length >= 2);
    const targetWords = normalizeText(targetText).split(' ').filter(w => w.length >= 2);
    
    for (const qw of queryWords) {
      for (const tw of targetWords) {
        // Exact match - always allowed
        if (qw === tw) {
          return true;
        }
        
        // Fuzzy matching with strict rules for typos
        const lenDiff = Math.abs(qw.length - tw.length);
        const distance = levenshteinDistance(qw, tw);
        
        // Same length words: allow 1 edit (typo like "ankel" → "ankle")
        if (lenDiff === 0 && distance <= 1) {
          return true;
        }
        
        // 1 char length difference: only allow if distance is exactly 1 
        // (insertion/deletion typo, NOT different words like "ankle"/"anklet")
        // Actually, "ankle" (5) vs "anklet" (6) has distance 1, so we need to be even stricter
        // Only allow if the shorter word is a PREFIX of the longer word minus 1 char
        // This handles typos like "suppor" → "support" but not "ankle" → "anklet"
        if (lenDiff === 1 && distance === 1) {
          // Check if it's a simple prefix typo (missing last char)
          const shorter = qw.length < tw.length ? qw : tw;
          const longer = qw.length < tw.length ? tw : qw;
          if (longer.startsWith(shorter)) {
            // This is "ankle" vs "anklet" case - different words, NOT a typo
            // Only allow if the extra char is a common typo pattern
            continue; // Skip this - they're different words
          }
          return true; // Allow other 1-edit differences (internal typos)
        }
      }
    }
    return false;
  };
  
  for (const product of products) {
    // Use queryWithoutSize for base matching if we extracted a size
    const matchQuery = querySize ? queryWithoutSize : query;
    
    // WORD-OVERLAP GATE: Skip products with no word overlap to prevent unrelated matches
    const hasNameOverlap = hasWordOverlap(matchQuery, product.name);
    const hasSkuOverlap = hasWordOverlap(matchQuery, product.sku);
    const hasAliasOverlap = (product.alias1 && hasWordOverlap(matchQuery, product.alias1)) ||
                            (product.alias2 && hasWordOverlap(matchQuery, product.alias2)) ||
                            (product.aliases && hasWordOverlap(matchQuery, product.aliases));
    
    if (!hasNameOverlap && !hasSkuOverlap && !hasAliasOverlap) {
      continue; // Skip this product - no word overlap with query
    }
    
    const skuScore = calculateSimilarity(matchQuery, product.sku);
    const nameScore = calculateSimilarity(matchQuery, product.name);
    
    // Also check SKU+SIZE combinations (e.g., query "F-01-M" should match product with sku="F-01" and size="M")
    let skuSizeScore = 0;
    if (product.size) {
      const skuWithSize = `${product.sku}-${product.size}`;
      const skuWithSizeSpace = `${product.sku} ${product.size}`;
      skuSizeScore = Math.max(
        calculateSimilarity(query, skuWithSize),
        calculateSimilarity(query, skuWithSizeSpace)
      );
    }
    let aliasScore = 0;
    
    // Check alias1 and alias2 first (exact match gets priority)
    if (product.alias1) {
      if (normalizeText(matchQuery) === normalizeText(product.alias1)) {
        aliasScore = 1;
      } else {
        const score = calculateSimilarity(matchQuery, product.alias1);
        if (score > aliasScore) aliasScore = score;
      }
    }
    
    if (product.alias2 && aliasScore < 1) {
      if (normalizeText(matchQuery) === normalizeText(product.alias2)) {
        aliasScore = 1;
      } else {
        const score = calculateSimilarity(matchQuery, product.alias2);
        if (score > aliasScore) aliasScore = score;
      }
    }
    
    // Also check legacy aliases field (comma-separated)
    if (product.aliases && aliasScore < 1) {
      const aliasesList = product.aliases.split(',').map(a => a.trim()).filter(a => a);
      for (const alias of aliasesList) {
        const score = calculateSimilarity(matchQuery, alias);
        if (score > aliasScore) {
          aliasScore = score;
        }
        if (normalizeText(matchQuery) === normalizeText(alias)) {
          aliasScore = 1;
          break;
        }
      }
    }
    
    let score = Math.max(skuScore, nameScore, skuSizeScore, aliasScore);
    
    // Apply size-aware scoring adjustment
    if (querySize) {
      const productSize = product.size?.toUpperCase()?.trim() || '';
      if (productSize === querySize) {
        // Size matches - boost the score significantly
        score = Math.min(1, score + 0.2);
      } else if (productSize && productSize !== querySize) {
        // Size doesn't match - penalize heavily to prefer matching sizes
        score = Math.max(0, score - 0.3);
      }
      // If product has no size field, don't adjust (might be universal)
    }
    
    // SIMPLICITY BONUS: Prefer products with fewer extra words beyond the query
    // This ensures "knee cap" matches "KNEE CAP (PAIR) - M" over "KNEE CAP (WITH RIGID HINGE) - M"
    const queryWords = normalizeText(matchQuery).split(' ').filter(w => w.length >= 2);
    const productNameNormalized = normalizeText(product.name);
    const productWords = productNameNormalized.split(' ').filter(w => w.length >= 2);
    
    // Count how many query words are found in product name
    const queryWordsInProduct = queryWords.filter(qw => 
      productWords.some(pw => pw === qw || pw.includes(qw) || qw.includes(pw))
    ).length;
    
    // Extra words = total product words - query words found
    const extraWords = productWords.length - queryWordsInProduct;
    
    // Apply simplicity bonus: fewer extra words = higher bonus
    // Max bonus of 0.1 for products with 0 extra words, decreasing by 0.02 per extra word
    if (queryWordsInProduct > 0 && score >= threshold) {
      const simplicityBonus = Math.max(0, 0.1 - (extraWords * 0.02));
      score += simplicityBonus;
    }
    
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

  // Phone/password auth endpoint
  const bcrypt = await import('bcryptjs');

  // Login with phone + password
  app.post('/api/auth/phone-login', async (req: any, res) => {
    try {
      const { phone, password } = req.body;
      console.log("[phone-login] Attempt for phone:", phone?.trim());
      
      if (!phone || !phone.trim()) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      const user = await storage.getUserByPhone(phone.trim());
      console.log("[phone-login] User found:", user ? `yes (id: ${user.id})` : "no");
      
      if (!user) {
        // Generic message to prevent phone enumeration
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      if (!user.passwordHash) {
        console.log("[phone-login] User has no password hash");
        // User exists but password not set - shouldn't happen with new flow
        // but handle gracefully with generic message
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      console.log("[phone-login] Comparing password...");
      const isValid = await bcrypt.compare(password, user.passwordHash);
      console.log("[phone-login] Password valid:", isValid);
      
      if (!isValid) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      // Create session for the user
      req.session.userId = user.id;
      req.session.phoneAuth = true;

      return res.json({ success: true, user });
    } catch (error) {
      console.error("Error during phone login:", error);
      res.status(500).json({ message: "Login failed" });
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

  // Add alias to product (Admin only)
  app.post('/api/products/:id/add-alias', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Only administrators can add aliases" });
      }

      const productId = req.params.id;
      const { alias } = req.body;
      
      if (!alias || typeof alias !== 'string' || alias.trim().length === 0) {
        return res.status(400).json({ message: "Invalid alias" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const normalizedAlias = alias.trim().toLowerCase();
      
      // Check if alias already exists in alias1 or alias2
      const existingAlias1 = ((product as any).alias1 || '').toLowerCase();
      const existingAlias2 = ((product as any).alias2 || '').toLowerCase();
      
      if (existingAlias1 === normalizedAlias || existingAlias2 === normalizedAlias) {
        return res.json({ message: "Alias already exists", product });
      }

      // Add to first empty slot
      const updates: Record<string, string> = {};
      if (!existingAlias1) {
        updates.alias1 = alias.trim();
      } else if (!existingAlias2) {
        updates.alias2 = alias.trim();
      } else {
        return res.status(400).json({ 
          message: "Both alias slots are full. Remove one in the product edit form first." 
        });
      }

      const updated = await storage.updateProduct(productId, updates);
      res.json({ message: "Alias added successfully", product: updated });
    } catch (error) {
      console.error("Error adding alias:", error);
      res.status(500).json({ message: "Failed to add alias" });
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

  // Get products for a specific brand (for Add Items dialog)
  app.get('/api/products/by-brand/:brand', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const brand = req.params.brand;
      const isAdmin = user?.isAdmin || false;
      
      // Check if user has access to this brand (admins have access to all)
      if (!isAdmin) {
        const userBrands = await storage.getUserBrandAccess(userId);
        if (!userBrands.includes(brand)) {
          return res.status(403).json({ message: "No access to this brand" });
        }
      }
      
      const products = await storage.getProductsByBrand(brand);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products by brand:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Get product order counts for popularity ranking (cached for 1 hour)
  app.get('/api/products/popularity', isAuthenticated, async (req: any, res) => {
    try {
      const now = Date.now();
      
      // Check cache
      if (popularityCache && (now - popularityCache.timestamp) < POPULARITY_CACHE_TTL) {
        return res.json(popularityCache.data);
      }
      
      // Fetch fresh data
      const orderCounts = await storage.getProductOrderCounts();
      const result: Record<string, number> = {};
      orderCounts.forEach((count, productId) => {
        result[productId] = count;
      });
      
      // Update cache
      popularityCache = { data: result, timestamp: now };
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching product popularity:", error);
      res.status(500).json({ message: "Failed to fetch product popularity" });
    }
  });

  // Get brand-wise top 10 popular products (for analytics)
  app.get('/api/analytics/products/top-by-brand', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { fromDate, toDate } = req.query;
      const filters: { fromDate?: Date; toDate?: Date } = {};
      
      if (fromDate) filters.fromDate = new Date(fromDate as string);
      if (toDate) filters.toDate = new Date(toDate as string);
      
      const result = await storage.getTopProductsByBrand(filters, 10);
      res.json(result);
    } catch (error) {
      console.error("Error fetching top products by brand:", error);
      res.status(500).json({ message: "Failed to fetch top products by brand" });
    }
  });

  // Get products (by name) that were not ordered in the given time frame
  app.get('/api/analytics/products/unordered', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { fromDate, toDate, limit } = req.query;
      const filters: { fromDate?: Date; toDate?: Date } = {};
      
      if (fromDate) filters.fromDate = new Date(fromDate as string);
      if (toDate) filters.toDate = new Date(toDate as string);
      
      const productLimit = parseInt(limit as string) || 5;
      const result = await storage.getUnorderedProducts(filters, productLimit);
      res.json(result);
    } catch (error) {
      console.error("Error fetching unordered products:", error);
      res.status(500).json({ message: "Failed to fetch unordered products" });
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
      
      // Check if target user exists
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found. Please refresh the page to see the latest user list." });
      }
      
      if (!Array.isArray(brands)) {
        return res.status(400).json({ message: "Brands must be an array" });
      }
      
      // Get valid brands from database
      const allBrands = await storage.getActiveBrands();
      const validBrandNames = allBrands.map(b => b.name);
      const validBrands = brands.filter((b: string) => validBrandNames.includes(b));
      await storage.setUserBrandAccess(targetUserId, validBrands);
      
      res.json({ message: "Brand access updated", brands: validBrands });
    } catch (error) {
      console.error("Error setting brand access:", error);
      res.status(500).json({ message: "Failed to set brand access" });
    }
  });

  // Get user's delivery company access
  app.get('/api/users/:userId/delivery-company-access', isAuthenticated, async (req: any, res) => {
    try {
      const requestingUserId = req.user.claims.sub;
      const requestingUser = await storage.getUser(requestingUserId);
      const targetUserId = req.params.userId;
      
      if (!requestingUser?.isAdmin && requestingUserId !== targetUserId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      const deliveryCompanies = await storage.getUserDeliveryCompanyAccess(targetUserId);
      res.json({ deliveryCompanies });
    } catch (error) {
      console.error("Error fetching delivery company access:", error);
      res.status(500).json({ message: "Failed to fetch delivery company access" });
    }
  });

  // Set user's delivery company access (Admin only)
  app.put('/api/users/:userId/delivery-company-access', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Only administrators can manage delivery company access" });
      }

      const targetUserId = req.params.userId;
      const { deliveryCompanies } = req.body;
      
      // Check if target user exists
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found. Please refresh the page to see the latest user list." });
      }
      
      if (!Array.isArray(deliveryCompanies)) {
        return res.status(400).json({ message: "Delivery companies must be an array" });
      }
      
      // Validate against known delivery companies
      const validDeliveryCompanies = deliveryCompanies.filter((dc: string) => 
        ["Guided", "Xmaple", "Elmeric"].includes(dc)
      );
      await storage.setUserDeliveryCompanyAccess(targetUserId, validDeliveryCompanies);
      
      res.json({ message: "Delivery company access updated", deliveryCompanies: validDeliveryCompanies });
    } catch (error) {
      console.error("Error setting delivery company access:", error);
      res.status(500).json({ message: "Failed to set delivery company access" });
    }
  });

  // Update user's party name (Admin only - for Customer role)
  app.patch('/api/admin/users/:id/party-name', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { partyName } = req.body;
      
      const updatedUser = await storage.updateUserPartyName(targetUserId, partyName || null);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user party name:", error);
      res.status(500).json({ message: "Failed to update party name" });
    }
  });

  // Verify party name against external debtor API
  app.get('/api/verify/debtor', isAuthenticated, async (req: any, res) => {
    try {
      const searchTerm = req.query.name as string;
      
      if (!searchTerm || searchTerm.trim().length < 2) {
        return res.status(400).json({ 
          verified: false, 
          message: "Search term must be at least 2 characters" 
        });
      }
      
      // Call external API to verify party name
      const externalApiUrl = `https://cash.guidedgateway.com/api/verify/debtor?name=${encodeURIComponent(searchTerm.trim())}`;
      
      const apiKey = process.env.CASHDESK_API_KEY;
      if (!apiKey) {
        console.error("CASHDESK_API_KEY not configured");
        return res.status(500).json({ 
          verified: false, 
          message: "API key not configured for party verification" 
        });
      }
      
      console.log(`Calling debtor API: ${externalApiUrl}`);
      
      const externalResponse = await fetch(externalApiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      });
      
      const responseText = await externalResponse.text();
      console.log(`Debtor API response status: ${externalResponse.status}, body: ${responseText.substring(0, 500)}`);
      
      if (!externalResponse.ok) {
        console.error(`External debtor API returned status: ${externalResponse.status}`);
        return res.status(502).json({ 
          verified: false, 
          message: "Failed to verify party with external service" 
        });
      }
      
      // Handle empty response
      if (!responseText || responseText.trim() === '') {
        return res.json({ 
          verified: false, 
          found: false,
          message: "Party not found in database" 
        });
      }
      
      // Check for "not found" text response from external API
      const notFoundMessages = [
        "couldn't find",
        "could not find",
        "no results",
        "not found",
        "search criteria"
      ];
      
      const lowerText = responseText.toLowerCase();
      const isNotFoundMessage = notFoundMessages.some(msg => lowerText.includes(msg));
      
      if (isNotFoundMessage) {
        return res.json({ 
          verified: false, 
          found: false,
          message: "Party not found in database" 
        });
      }
      
      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        // If it's not JSON and not a "not found" message, treat as unknown
        console.error("Failed to parse debtor API response:", responseText.substring(0, 200));
        return res.json({ 
          verified: false, 
          found: false,
          message: "Unexpected response from verification service" 
        });
      }
      
      // Check if we have any results
      // The API might return an array of debtors or a single object with found: true/false
      let hasResults = false;
      if (Array.isArray(data)) {
        hasResults = data.length > 0;
      } else if (data && typeof data === 'object') {
        // Explicitly check 'found' field first - external API returns {found: true/false}
        if ('found' in data) {
          hasResults = data.found === true;
        } else if ('exists' in data) {
          hasResults = data.exists === true;
        } else if ('count' in data) {
          hasResults = data.count > 0;
        } else {
          // Fallback for other response formats - only if no explicit found/exists field
          hasResults = Object.keys(data).length > 0 && !data.error && !data.message;
        }
      }
      
      if (hasResults) {
        // Extract the first match if it's an array
        // External API returns {found: true, match: {name: "...", ...}}
        const match = Array.isArray(data) ? data[0] : (data.match || data);
        return res.json({ 
          verified: true, 
          found: true,
          name: match.Name || match.name || searchTerm.trim(),
          data: match
        });
      } else {
        return res.json({ 
          verified: false, 
          found: false,
          message: "Party not found in database" 
        });
      }
    } catch (error) {
      console.error("Error verifying debtor:", error);
      res.status(500).json({ 
        verified: false, 
        message: "Error verifying party name" 
      });
    }
  });

  // Get available brand and delivery company options
  app.get('/api/options', isAuthenticated, async (req: any, res) => {
    try {
      // Seed brands if table is empty
      await storage.seedBrands();
      const brandRecords = await storage.getActiveBrands();
      const brandNames = brandRecords.map(b => b.name);
      res.json({
        brands: brandNames,
        deliveryCompanies: DELIVERY_COMPANY_OPTIONS,
      });
    } catch (error: any) {
      console.error("Error fetching options:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Create order
  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
      const { items, whatsappPhone, email, total, partyName, deliveryNote, deliveryCompany, brand, specialNotes, importText, orderUserId } = req.body;
      
      // Get current user to check permissions
      const currentUser = await storage.getUser(currentUserId);

      // Determine order owner: Admin can create on behalf of another user
      let orderOwnerUserId = currentUserId;
      if (orderUserId && orderUserId !== currentUserId) {
        // Only Admin can create orders on behalf of others
        if (!currentUser?.isAdmin) {
          return res.status(403).json({ message: "Only Admin can create orders on behalf of other users" });
        }
        // Verify the target user exists
        const targetUser = await storage.getUser(orderUserId);
        if (!targetUser) {
          return res.status(400).json({ message: "Selected user not found" });
        }
        orderOwnerUserId = orderUserId;
      }

      if (!items || items.length === 0) {
        return res.status(400).json({ message: "No items in order" });
      }

      if (!partyName || partyName.trim() === "") {
        return res.status(400).json({ message: "Party name is required" });
      }

      if (!brand || typeof brand !== 'string' || brand.trim() === '') {
        return res.status(400).json({ message: "Order brand is required" });
      }

      // Validate that brand exists and is active
      const brandRecord = await storage.getBrandByName(brand.trim());
      if (!brandRecord || !brandRecord.isActive) {
        return res.status(400).json({ message: `Brand "${brand}" is not valid or has been deactivated` });
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
        userId: orderOwnerUserId, // Order owner (sales user)
        createdBy: currentUserId, // Who actually created the order (for audit)
        brand: brand.trim(),
        total: String(total),
        whatsappPhone,
        email,
        partyName: partyName.trim(),
        deliveryNote: deliveryNote || null,
        deliveryCompany: deliveryCompany || "Guided",
        specialNotes: specialNotes || null,
        importText: importText || null,
        status: "Created",
      });

      const orderItemsData = items.map((item: any) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        freeQuantity: item.freeQuantity || 0,
        unitPrice: String(item.price || item.unitPrice || "0"),
      }));

      await storage.createOrderItems(orderItemsData);

      const orderItems = await storage.getOrderItems(order.id);
      const orderOwner = await storage.getUser(orderOwnerUserId);
      const createdByUser = orderOwnerUserId !== currentUserId ? await storage.getUser(currentUserId) : null;
      
      res.json({
        ...order,
        items: orderItems,
        user: orderOwner ? { firstName: orderOwner.firstName, lastName: orderOwner.lastName } : null,
        createdByUser: createdByUser ? { firstName: createdByUser.firstName, lastName: createdByUser.lastName } : null,
      });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Order Analytics endpoint
  app.get('/api/analytics/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Only Admin and BrandAdmin can view analytics
      if (!user?.isAdmin && user?.role !== 'BrandAdmin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Parse filters from query params
      const { fromDate, toDate, brand } = req.query;
      
      const filters: any = {};
      
      if (fromDate) {
        filters.fromDate = new Date(fromDate as string);
      }
      if (toDate) {
        filters.toDate = new Date(toDate as string);
      }
      if (brand && brand !== 'all') {
        filters.brand = brand as string;
      }
      
      
      // For BrandAdmin, filter by their assigned brands
      if (user?.role === 'BrandAdmin' && !user.isAdmin) {
        const userBrands = await storage.getUserBrandAccess(userId);
        if (brand && brand !== 'all') {
          // Verify user has access to this brand
          if (!userBrands.includes(brand as string)) {
            return res.status(403).json({ message: "Access denied to this brand" });
          }
        } else {
          // Default to first brand if multiple
          if (userBrands.length > 0) {
            filters.brand = userBrands[0];
          }
        }
      }
      
      // Use cached analytics to reduce DB calls (2-min TTL)
      const analytics = await getCachedAnalytics(filters);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching order analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
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

      const filters: { status?: string; deliveryCompany?: string; brand?: string; fromDate?: Date; toDate?: Date; includeActive?: boolean } = {};
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.deliveryCompany) filters.deliveryCompany = req.query.deliveryCompany as string;
      if (req.query.brand) filters.brand = req.query.brand as string;
      if (req.query.fromDate) filters.fromDate = new Date(req.query.fromDate as string);
      if (req.query.toDate) filters.toDate = new Date(req.query.toDate as string);
      if (req.query.includeActive === 'true') filters.includeActive = true;
      
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

  app.get('/api/admin/orders/bulk-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin && user?.role !== 'BrandAdmin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const filters: { status?: string; deliveryCompany?: string; brand?: string; fromDate?: Date; toDate?: Date } = {};
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.deliveryCompany) filters.deliveryCompany = req.query.deliveryCompany as string;
      if (req.query.brand) filters.brand = req.query.brand as string;
      if (req.query.fromDate) filters.fromDate = new Date(req.query.fromDate as string);
      if (req.query.toDate) filters.toDate = new Date(req.query.toDate as string);
      
      const summary = await storage.getBulkOrderSummary(filters);
      
      if (!user.isAdmin) {
        const brands = await storage.getUserBrandAccess(userId);
        const filtered = summary.filter(s => brands.includes(s.brand));
        return res.json(filtered);
      }
      
      res.json(summary);
    } catch (error) {
      console.error("Error fetching bulk summary:", error);
      res.status(500).json({ message: "Failed to fetch bulk summary" });
    }
  });

  // Get order analytics (Admin only)
  app.get('/api/admin/analytics/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const filters: { brand?: string; fromDate?: Date; toDate?: Date } = {};
      if (req.query.brand) filters.brand = req.query.brand as string;
      if (req.query.fromDate) filters.fromDate = new Date(req.query.fromDate as string);
      if (req.query.toDate) filters.toDate = new Date(req.query.toDate as string);
      
      const analytics = await storage.getOrderAnalytics(Object.keys(filters).length > 0 ? filters : undefined);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching order analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
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

      // Status transition restrictions
      if (req.body.status && req.body.status !== order.status) {
        // Delivered can only transition to PODReceived
        if (order.status === 'Delivered' && req.body.status !== 'PODReceived') {
          return res.status(400).json({ message: "Delivered orders can only be moved to POD Received status" });
        }
        // PODReceived cannot transition to any other status
        if (order.status === 'PODReceived') {
          return res.status(400).json({ message: "POD Received orders cannot be moved to another status" });
        }
      }

      if (!user.isAdmin && user.role === 'BrandAdmin') {
        const brands = await storage.getUserBrandAccess(userId);
        if (!order.brand || !brands.includes(order.brand)) {
          return res.status(403).json({ message: "Access denied to this order" });
        }

        // BrandAdmin can only update status (with restrictions)
        const allowedFields = ['status'];
        const requestedFields = Object.keys(req.body);
        const disallowedFields = requestedFields.filter(f => !allowedFields.includes(f));
        
        if (disallowedFields.length > 0) {
          return res.status(403).json({ message: `BrandAdmin cannot update: ${disallowedFields.join(', ')}` });
        }

        // Status change restriction: only Created -> Approved
        if (req.body.status && req.body.status !== order.status) {
          if (order.status !== 'Created' || req.body.status !== 'Approved') {
            return res.status(403).json({ message: "BrandAdmin can only change status from Created to Approved" });
          }
        }
      }

      // Set approvedBy and approvedAt when status changes to Approved
      if (req.body.status === 'Approved' && order.status !== 'Approved') {
        const approverName = user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.email || userId;
        req.body.approvedBy = approverName;
        req.body.approvedAt = new Date().toISOString();
      }

      // Auto-set actualDeliveryDate when status changes to Delivered
      if (req.body.status === 'Delivered' && order.status !== 'Delivered') {
        if (!req.body.actualDeliveryDate) {
          req.body.actualDeliveryDate = new Date().toISOString().split('T')[0];
        }
      }

      // Auto-set podTimestamp when POD status changes to Received or Digital Received
      console.log("[update-order] Incoming podStatus:", req.body.podStatus);
      console.log("[update-order] Current order podStatus:", order.podStatus);
      
      const isPodReceived = req.body.podStatus === 'Received' || req.body.podStatus === 'Digital Received';
      const wasPodReceived = order.podStatus === 'Received' || order.podStatus === 'Digital Received';
      console.log("[update-order] isPodReceived:", isPodReceived, "wasPodReceived:", wasPodReceived);
      
      if (isPodReceived && !wasPodReceived) {
        req.body.podTimestamp = new Date().toISOString();
      }

      // Auto-update order status to PODReceived when POD status is marked as Received or Digital Received
      if (isPodReceived && order.status === 'Delivered') {
        req.body.status = 'PODReceived';
      }
      
      console.log("[update-order] Final req.body before parse:", JSON.stringify(req.body));

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

  // Create pending order from approved order (fork with out-of-stock items)
  app.post('/api/orders/:id/pending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin && user?.role !== 'BrandAdmin') {
        return res.status(403).json({ message: "Admin or BrandAdmin access required" });
      }

      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (!['Created', 'Approved'].includes(order.status)) {
        return res.status(400).json({ message: "Can only create pending orders from Created or Approved orders" });
      }

      // Check brand access for BrandAdmin
      if (!user.isAdmin && user.role === 'BrandAdmin') {
        const brands = await storage.getUserBrandAccess(userId);
        if (!order.brand || !brands.includes(order.brand)) {
          return res.status(403).json({ message: "Access denied to this order" });
        }
      }

      const result = await storage.createPendingOrder(order.id, userId);
      if (!result) {
        return res.status(400).json({ message: "No out-of-stock items found. All items have sufficient stock." });
      }

      res.json({
        message: "Pending order created successfully",
        pendingOrder: result.pendingOrder,
        itemCount: result.pendingItems.length
      });
    } catch (error) {
      console.error("Error creating pending order:", error);
      res.status(500).json({ message: "Failed to create pending order" });
    }
  });

  // Add items to an existing order (only when status is Created, Approved, or Pending)
  app.post('/api/orders/:id/items', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const orderId = req.params.id;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if order is editable (Created, Approved, or Pending status)
      if (!['Created', 'Approved', 'Pending'].includes(order.status)) {
        return res.status(400).json({ 
          message: `Cannot modify order with status "${order.status}". Only Created, Approved, or Pending orders can be modified.` 
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
        const qty = item.quantity ?? 0;
        const freeQty = item.freeQuantity ?? 0;
        if (!item.productId || (qty < 1 && freeQty < 1)) {
          return res.status(400).json({ message: "Each item must have productId and either quantity > 0 or free quantity > 0" });
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
      const orderItemsData = await Promise.all(items.map(async (item: { productId: string; quantity: number; freeQuantity?: number }) => {
        const product = await storage.getProduct(item.productId);
        return {
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity || 0,
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

  // Update an order item (quantity/freeQuantity) - only when status is Created, Approved, or Pending
  app.patch('/api/orders/:orderId/items/:itemId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { orderId, itemId } = req.params;
      const { quantity, freeQuantity } = req.body;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if order is editable (Created, Approved, or Pending status)
      if (!['Created', 'Approved', 'Pending'].includes(order.status)) {
        return res.status(400).json({ 
          message: `Cannot modify order with status "${order.status}". Only Created, Approved, or Pending orders can be modified.` 
        });
      }

      // Check permissions: user owns the order, or is admin, or is brand admin for the brand
      const isOwner = order.userId === userId;
      const isAdmin = user?.isAdmin === true;
      let isBrandAdmin = false;
      
      if (user?.role === 'BrandAdmin' && order.brand) {
        const brandAccess = await storage.getUserBrandAccess(userId);
        // Case-insensitive brand comparison
        isBrandAdmin = brandAccess.some(b => b.toLowerCase() === order.brand!.toLowerCase());
      }

      if (!isOwner && !isAdmin && !isBrandAdmin) {
        return res.status(403).json({ message: "Access denied to this order" });
      }

      // Validate quantities
      const qty = quantity ?? 0;
      const freeQty = freeQuantity ?? 0;
      if (qty < 0 || freeQty < 0) {
        return res.status(400).json({ message: "Quantities cannot be negative" });
      }
      if (qty === 0 && freeQty === 0) {
        return res.status(400).json({ message: "Either quantity or free quantity must be greater than 0. Use delete to remove the item." });
      }

      const updatedItem = await storage.updateOrderItem(itemId, qty, freeQty);
      if (!updatedItem) {
        return res.status(404).json({ message: "Order item not found" });
      }

      // Recalculate order total
      const updatedOrder = await storage.recalculateOrderTotal(orderId);

      res.json({ item: updatedItem, order: updatedOrder });
    } catch (error) {
      console.error("Error updating order item:", error);
      res.status(500).json({ message: "Failed to update order item" });
    }
  });

  // Delete an order item - only when status is Created, Approved, or Pending
  app.delete('/api/orders/:orderId/items/:itemId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { orderId, itemId } = req.params;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if order is editable (Created, Approved, or Pending status)
      if (!['Created', 'Approved', 'Pending'].includes(order.status)) {
        return res.status(400).json({ 
          message: `Cannot modify order with status "${order.status}". Only Created, Approved, or Pending orders can be modified.` 
        });
      }

      // Check permissions: user owns the order, or is admin, or is brand admin for the brand
      const isOwner = order.userId === userId;
      const isAdmin = user?.isAdmin === true;
      let isBrandAdmin = false;
      
      if (user?.role === 'BrandAdmin' && order.brand) {
        const brandAccess = await storage.getUserBrandAccess(userId);
        // Case-insensitive brand comparison
        isBrandAdmin = brandAccess.some(b => b.toLowerCase() === order.brand!.toLowerCase());
      }

      if (!isOwner && !isAdmin && !isBrandAdmin) {
        return res.status(403).json({ message: "Access denied to this order" });
      }

      const result = await storage.deleteOrderItem(itemId);
      if (!result.deleted) {
        return res.status(404).json({ message: "Order item not found" });
      }

      // Recalculate order total
      const updatedOrder = await storage.recalculateOrderTotal(orderId);

      res.json({ message: "Item deleted", order: updatedOrder });
    } catch (error) {
      console.error("Error deleting order item:", error);
      res.status(500).json({ message: "Failed to delete order item" });
    }
  });

  // Delete an order (only creator or admin, only when status is Created)
  app.delete('/api/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const orderId = req.params.id;
      
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if order can be deleted (Created status only)
      if (order.status !== 'Created') {
        return res.status(400).json({ 
          message: `Cannot delete order with status "${order.status}". Only Created orders can be deleted.` 
        });
      }

      // Check permissions: only creator or admin can delete
      const isOwner = order.userId === userId;
      const isAdmin = user?.isAdmin === true;

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Only the order creator or admin can delete this order" });
      }

      const deleted = await storage.deleteOrder(orderId);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete order" });
      }

      res.json({ message: "Order deleted successfully" });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ message: "Failed to delete order" });
    }
  });

  // Import orders from Excel file (admin only)
  // Supports customer-wise sales summary format with hierarchical structure
  app.post('/api/admin/orders/import', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Parse Excel file as array of arrays to handle header rows
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (rawRows.length < 10) {
        return res.status(400).json({ message: "Excel file has insufficient data" });
      }

      // Get brand and invoice date from request body
      const requestedBrand = req.body?.brand || 'Biostige';
      const invoiceDate = req.body?.invoiceDate || null;

      // Get all products and brands for matching
      const allProducts = await storage.getAllProducts();
      const allBrands = await storage.getAllBrands();
      const activeBrandNames = allBrands
        .filter(b => b.isActive)
        .map(b => b.name.toLowerCase());

      // Validate brand
      if (!activeBrandNames.includes(requestedBrand.toLowerCase())) {
        return res.status(400).json({ message: `Brand "${requestedBrand}" not found or inactive` });
      }

      // Find header row (contains "Name To Display" or similar)
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(15, rawRows.length); i++) {
        const row = rawRows[i];
        if (row && row[0] && String(row[0]).toLowerCase().includes('name')) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        return res.status(400).json({ message: "Could not find header row in Excel file" });
      }

      // Parse data rows - structure: Customer row followed by product rows
      const dataRows = rawRows.slice(headerRowIndex + 1);
      
      // Customer-wise sales format: 
      // - Customer rows have location in parentheses like "ANJALI MEDISALES(DHANBAD)"
      // - Product rows have product names, some with codes like "(1000081)"
      // - Skip "All Customers" summary row
      
      const orderGroups = new Map<string, {
        partyName: string;
        brand: string;
        netAmount: number;
        items: Array<{ productId: string | null; productName: string; quantity: number; freeQuantity: number; unitPrice: number }>;
      }>();

      let currentCustomer: string | null = null;
      const customerPattern = /^([A-Z][A-Z\s&.']+)\(([A-Z]+)\)$/i; // Matches "NAME(LOCATION)"

      for (const row of dataRows) {
        if (!row || !row[0]) continue;
        
        const nameField = String(row[0]).trim();
        const qty = parseInt(row[1]) || 0;
        const freeQty = parseInt(row[2]) || 0;
        const amount = parseFloat(row[3]) || 0;
        const netAmount = parseFloat(row[4]) || 0; // Net Amount column

        // Skip "All Customers" summary
        if (nameField.toLowerCase().includes('all customers')) continue;
        
        // Skip rows with zero or negative quantities
        if (qty <= 0 && freeQty <= 0) continue;

        // Check if this is a customer row (has location in parentheses at end)
        const customerMatch = nameField.match(customerPattern);
        if (customerMatch) {
          currentCustomer = nameField;
          // Initialize order group for this customer with net amount from customer row
          if (!orderGroups.has(currentCustomer)) {
            orderGroups.set(currentCustomer, {
              partyName: customerMatch[1].trim(),
              brand: requestedBrand,
              netAmount: netAmount, // Customer's total net amount
              items: [],
            });
          }
          continue; // Customer rows are just headers, don't add as items
        }

        // This is a product row
        if (!currentCustomer) continue;

        // Extract product code if present (e.g., "(1000081)")
        let productName = nameField;
        let productCode = '';
        const codeMatch = nameField.match(/\((\d+)\)$/);
        if (codeMatch) {
          productCode = codeMatch[1];
          productName = nameField.replace(/\s*\(\d+\)$/, '').trim();
        }

        // Calculate unit price from amount and quantity
        const unitPrice = qty > 0 ? amount / qty : 0;

        // Try to match product - fuzzy match by name
        let matchedProduct = allProducts.find(p => {
          if (p.brand?.toLowerCase() !== requestedBrand.toLowerCase()) return false;
          const pName = p.name?.toLowerCase() || '';
          const searchName = productName.toLowerCase();
          // Match if product name contains the search term or vice versa
          return pName.includes(searchName) || searchName.includes(pName) ||
                 pName.split(' ').some(word => searchName.includes(word) && word.length > 3);
        });

        // If no match by name, try by SKU/code
        if (!matchedProduct && productCode) {
          matchedProduct = allProducts.find(p => 
            p.brand?.toLowerCase() === requestedBrand.toLowerCase() &&
            p.sku?.includes(productCode)
          );
        }

        const group = orderGroups.get(currentCustomer)!;
        group.items.push({
          productId: matchedProduct?.id || null,
          productName: matchedProduct?.name || productName,
          quantity: qty,
          freeQuantity: freeQty,
          unitPrice: matchedProduct?.price ? parseFloat(matchedProduct.price) : unitPrice,
        });
      }

      // Create orders
      let createdCount = 0;
      let skippedCount = 0;
      const skippedReasons: string[] = [];
      
      for (const [customerKey, group] of Array.from(orderGroups.entries())) {
        // Filter items to only those with matched products
        const validItems = group.items.filter((item: { productId: string | null }) => item.productId !== null);
        const unmatchedItems = group.items.filter((item: { productId: string | null }) => item.productId === null);
        
        if (validItems.length === 0) {
          skippedCount++;
          const unmatchedNames = unmatchedItems.map(i => i.productName).join(', ');
          skippedReasons.push(`${group.partyName}: No matching products (tried: ${unmatchedNames})`);
          continue;
        }

        // Calculate total
        const total = validItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

        // Generate invoice number from date + customer
        const invoiceNumber = `IMP-${Date.now().toString(36).toUpperCase()}`;

        // Create the order with Invoiced status for imported orders
        const order = await storage.createOrder({
          userId,
          partyName: group.partyName,
          brand: group.brand,
          status: 'Invoiced' as const,
          total: total.toFixed(2),
          specialNotes: unmatchedItems.length > 0 
            ? `Unmatched products: ${unmatchedItems.map(i => i.productName).join(', ')}`
            : null,
          deliveryCompany: null,
          invoiceNumber: null,
          invoiceDate: invoiceDate,
          actualOrderValue: group.netAmount > 0 ? group.netAmount.toFixed(2) : null,
        });

        // Create order items
        const orderItemsData = validItems.map(item => ({
          orderId: order.id,
          productId: item.productId!,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          unitPrice: item.unitPrice.toFixed(2),
        }));

        await storage.createOrderItems(orderItemsData);

        createdCount++;
        
        if (unmatchedItems.length > 0) {
          skippedReasons.push(`${group.partyName}: ${unmatchedItems.length} products unmatched`);
        }
      }

      const message = skippedCount > 0 || skippedReasons.length > 0
        ? `Imported ${createdCount} orders. ${skippedCount} skipped.`
        : `Imported ${createdCount} orders`;
      res.json({ 
        count: createdCount, 
        skipped: skippedCount, 
        message,
        ...(skippedReasons.length > 0 && { skippedReasons: skippedReasons.slice(0, 5) })
      });
    } catch (error) {
      console.error("Error importing orders:", error);
      res.status(500).json({ message: "Failed to import orders" });
    }
  });

  // Parse order from text - simple pattern matching
  app.post('/api/orders/parse-text', isAuthenticated, async (req: any, res) => {
    try {
      const { text, brand } = req.body;
      
      if (!text || !text.trim()) {
        return res.status(400).json({ message: "No text provided" });
      }

      // Simple text parsing - split by lines and extract patterns
      const allLines = text.split(/[\n]+/).map((l: string) => l.trim()).filter((l: string) => l);
      
      // First line is the party/customer name
      const partyName = allLines.length > 0 ? allLines[0] : "";
      const productLines = allLines.slice(1); // Skip first line for product parsing
      
      // Helper function to parse NAME-based multi-size format with SIZE/QTY pairs
      // Handles formats like: "soft collar with support -M/15,L/15", "KNEE CAP -M/20,L,/20,S/10"
      // Returns null if no pattern match, otherwise returns expanded items with [productName, size, qty]
      const tryExpandNameBasedMultiSize = (line: string): Array<{productName: string; size: string; qty: number}> | null => {
        // Remove leading line numbers like "1.", "2.", "10." etc.
        let cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        
        // Check if line contains SIZE/QTY pattern (uses / as separator)
        // Must have at least one pattern like M/15 or SHORT/6
        if (!cleanLine.includes('/')) {
          return null;
        }
        
        // Find the separator between product name and size/qty portion
        // Common patterns: " -", " - ", just "-" after space
        // Examples: "soft collar with support -M/15,L/15"
        //           "KNEE CAP -M/20,L,/20,S/10"
        
        // Try to find the split point - look for " -" followed by size/qty pattern
        const splitMatch = cleanLine.match(/^(.+?)\s*-\s*([A-Z0-9]+\s*\/\s*\d+.*)$/i);
        
        if (!splitMatch) {
          return null;
        }
        
        let productName = splitMatch[1].trim();
        let sizeQtyPortion = splitMatch[2].trim();
        
        // Handle directional qualifiers like "right", "left" at end of product name
        // Example: "Hand resting splint - right -M/1,L/1, LEFT -M/1,L/1"
        // This creates: right-M, right-L, left-M, left-L
        
        // Check for directional pattern: "right -M/1,L/1, LEFT -M/1,L/1"
        const directionalPattern = sizeQtyPortion.match(/^(right|left)\s*-\s*(.+)$/i);
        if (directionalPattern) {
          // Has directional prefix in the size portion
          const direction = directionalPattern[1].toUpperCase();
          sizeQtyPortion = directionalPattern[2];
          productName = `${productName} ${direction}`;
        }
        
        // Parse size/qty pairs - split by comma, handle typos
        // Clean up the portion: remove stray commas before slashes, normalize spaces
        sizeQtyPortion = sizeQtyPortion
          .replace(/,\s*\//g, '/') // Fix typos like "L,/20" -> "L/20"
          .replace(/\s*\/\s*/g, '/') // Normalize spaces around slashes
          .replace(/\s+/g, ' '); // Normalize multiple spaces
        
        // Check for multiple directional sections (e.g., "M/1,L/1, LEFT -M/1,L/1")
        const directionalSections = sizeQtyPortion.split(/,\s*(left|right)\s*-\s*/i);
        
        const results: Array<{productName: string; size: string; qty: number}> = [];
        
        if (directionalSections.length > 1) {
          // Has multiple directional sections
          // First section is for the current direction (or no direction)
          const firstPairs = directionalSections[0].split(/,/).map(s => s.trim()).filter(s => s);
          
          for (const pair of firstPairs) {
            const match = pair.match(/^([A-Z0-9]+)\s*\/\s*(\d+)\s*(?:pcs|pc)?$/i);
            if (match) {
              results.push({
                productName: productName,
                size: match[1].toUpperCase(),
                qty: parseInt(match[2]) || 1
              });
            }
          }
          
          // Process remaining directional sections
          for (let i = 1; i < directionalSections.length; i += 2) {
            if (i + 1 < directionalSections.length) {
              const direction = directionalSections[i].toUpperCase();
              const pairs = directionalSections[i + 1].split(/,/).map(s => s.trim()).filter(s => s);
              
              // Extract base product name (remove any previous direction)
              const baseProductName = productName.replace(/\s+(LEFT|RIGHT)$/i, '').trim();
              
              for (const pair of pairs) {
                const match = pair.match(/^([A-Z0-9]+)\s*\/\s*(\d+)\s*(?:pcs|pc)?$/i);
                if (match) {
                  results.push({
                    productName: `${baseProductName} ${direction}`,
                    size: match[1].toUpperCase(),
                    qty: parseInt(match[2]) || 1
                  });
                }
              }
            }
          }
        } else {
          // No multiple directional sections - simple comma-separated size/qty pairs
          const pairs = sizeQtyPortion.split(/,/).map(s => s.trim()).filter(s => s);
          
          for (const pair of pairs) {
            // Match patterns like: M/15, SHORT/6, XL/5, S/10, ADULT/10
            const match = pair.match(/^([A-Z0-9]+)\s*\/\s*(\d+)\s*(?:pcs|pc)?$/i);
            if (match) {
              results.push({
                productName: productName,
                size: match[1].toUpperCase(),
                qty: parseInt(match[2]) || 1
              });
            }
          }
        }
        
        return results.length > 0 ? results : null;
      };
      
      // Helper function to parse simple PCS format like "WRIST BRACE WITH THUMB - 30PCS"
      // Returns null if no pattern match
      const tryParsePcsFormat = (line: string): {productName: string; qty: number} | null => {
        // Remove leading line numbers
        let cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        
        // Pattern: "PRODUCT NAME - QTYpcs" or "PRODUCT NAME -QTY PCS"
        const match = cleanLine.match(/^(.+?)\s*-\s*(\d+)\s*(?:pcs|pc|units?)$/i);
        if (match) {
          return {
            productName: match[1].trim(),
            qty: parseInt(match[2]) || 1
          };
        }
        
        return null;
      };
      
      // Helper function to parse single quantity format like "UNIVERSAL SHOULDER IMMOBILIZER -6"
      // Returns null if no pattern match
      const tryParseSingleQtyFormat = (line: string): {productName: string; qty: number} | null => {
        // Remove leading line numbers
        let cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        
        // Pattern: "PRODUCT NAME -QTY" (just a number after dash, no size)
        // But NOT if it looks like a size/qty pattern with /
        if (cleanLine.includes('/')) {
          return null;
        }
        
        const match = cleanLine.match(/^(.+?)\s*-\s*(\d+)$/);
        if (match) {
          return {
            productName: match[1].trim(),
            qty: parseInt(match[2]) || 1
          };
        }
        
        return null;
      };
      
      // Helper function to check if a line matches multi-size pattern and expand it
      // Returns null if no pattern match, otherwise returns expanded items
      const tryExpandMultiSizePattern = (line: string): string[] | null => {
        // Check if line looks like multi-size pattern with commas
        // Must have: base SKU, then size-qty pairs separated by commas
        // Examples: "F-01 M-3p,L-3p,S-3p" or "F-10-M-5p,S-2p,L-2p"
        
        if (!line.includes(',')) {
          return null; // No commas, not a multi-size pattern
        }
        
        // Pattern 1: "SKU SIZE-QTYp,SIZE-QTYp,..." (with space between SKU and first size)
        // e.g., "F-01 M-3p,L-3p,S-3p"
        const spaceSeparated = line.match(/^([A-Z0-9\-]+)\s+([A-Z]{1,3})-?(\d+)p?(.*)$/i);
        
        if (spaceSeparated) {
          const baseSku = spaceSeparated[1];
          const firstSize = spaceSeparated[2].toUpperCase();
          const firstQty = spaceSeparated[3];
          const rest = spaceSeparated[4];
          
          // Verify rest contains comma-separated size-qty pairs
          const remaining = rest.split(',').map(s => s.trim()).filter(s => s);
          const validRemaining = remaining.every(part => /^([A-Z]{1,3})-?(\d+)p?$/i.test(part));
          
          if (remaining.length > 0 && validRemaining) {
            // Output format: "SKU-SIZE QTY" which the existing parser can handle
            const results: string[] = [`${baseSku}-${firstSize} ${firstQty}`];
            
            for (const part of remaining) {
              const match = part.match(/^([A-Z]{1,3})-?(\d+)p?$/i);
              if (match) {
                results.push(`${baseSku}-${match[1].toUpperCase()} ${match[2]}`);
              }
            }
            
            return results;
          }
        }
        
        // Pattern 2: "SKU-SIZE-QTYp,SIZE-QTYp,..." (connected by dashes)
        // e.g., "F-10-M-5p,S-2p,L-2p" or "B-02-M-5p,S-2p,L-2p"
        const dashSeparated = line.match(/^([A-Z0-9]+(?:-[A-Z0-9]+)*?)-([A-Z]{1,3})-(\d+)p?(.*)$/i);
        
        if (dashSeparated) {
          const baseSku = dashSeparated[1];
          const firstSize = dashSeparated[2].toUpperCase();
          const firstQty = dashSeparated[3];
          const rest = dashSeparated[4];
          
          // Verify rest contains comma-separated size-qty pairs
          const remaining = rest.split(',').map(s => s.trim()).filter(s => s);
          const validRemaining = remaining.every(part => /^([A-Z]{1,3})-?(\d+)p?$/i.test(part));
          
          if (remaining.length > 0 && validRemaining) {
            // Output format: "SKU-SIZE QTY" which the existing parser can handle
            const results: string[] = [`${baseSku}-${firstSize} ${firstQty}`];
            
            for (const part of remaining) {
              const match = part.match(/^([A-Z]{1,3})-?(\d+)p?$/i);
              if (match) {
                results.push(`${baseSku}-${match[1].toUpperCase()} ${match[2]}`);
              }
            }
            
            return results;
          }
        }
        
        // No multi-size pattern found
        return null;
      };
      
      // Known size codes that can appear as continuation lines
      const KNOWN_SIZE_CODES = new Set(['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'UNI', 'CH', 'SPL', 'LT', 'RT']);
      
      // Known variant names that can appear as continuation lines (product sub-types)
      const KNOWN_VARIANT_NAMES = new Set([
        'ERGO', 'NEOPRENE', 'WO WHEEL', 'WITH WHEEL', 'QUADRATIC', 'QUADRIOPOD',
        'HEAVY DUTY', 'ALUMINIUM', 'REGULAR', 'PLUS', 'SHORT', 'LONG'
      ]);
      
      // Helper function to detect if a line is a "Do" prefix continuation line
      // "Do" means same product as previous line but with different sizing
      // Formats: "Do (M) 60", "do M-10", "Do (XL) 20", "DO (uni) 5"
      const isDoPrefixContinuationLine = (line: string): { size: string; qty: number } | null => {
        const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        
        // Pattern 1: "Do (SIZE) QTY" or "Do (SIZE) QTYpcs" - e.g., "Do (M) 60", "do (XL) 20", "Do (L) 48pcs"
        const parenMatch = cleanLine.match(/^do\s*\(([A-Za-z0-9"]+)\)\s*(\d+)\s*(?:pcs|pc)?$/i);
        if (parenMatch) {
          return { size: parenMatch[1].toUpperCase(), qty: parseInt(parenMatch[2]) || 1 };
        }
        
        // Pattern 2: "Do SIZE-QTY" or "Do SIZE QTY" or with pcs suffix - e.g., "Do M-10", "Do XL 5", "Do 50gr 60"
        const spaceMatch = cleanLine.match(/^do\s+([A-Za-z0-9"]+)\s*[-\s]\s*(\d+)\s*(?:pcs|pc)?$/i);
        if (spaceMatch) {
          return { size: spaceMatch[1].toUpperCase(), qty: parseInt(spaceMatch[2]) || 1 };
        }
        
        return null;
      };
      
      // Helper function to detect if a line is a STRICT "continuation line" (size-only + quantity)
      // These inherit the product name from the previous full product line
      // Only matches: "L- 10", "Xl- 8", "S- 2", "uni- 5", "14"- 1", "19"- 2" (measurements)
      const isStrictContinuationLine = (line: string): { type: 'size' | 'measurement' | 'variant'; value: string; qty: number } | null => {
        const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        
        // Pattern 1: Standard size code - "L- 10", "XL- 8", "uni- 5"
        const sizeMatch = cleanLine.match(/^(S|M|L|XL|XXL|XXXL|UNI|CH|SPL|LT|RT)\s*-\s*(\d+)$/i);
        if (sizeMatch && KNOWN_SIZE_CODES.has(sizeMatch[1].toUpperCase())) {
          return { type: 'size', value: sizeMatch[1].toUpperCase(), qty: parseInt(sizeMatch[2]) || 1 };
        }
        
        // Pattern 2: Measurement size - "14"- 1", "19"- m- 2" -> extract the measurement
        const measurementMatch = cleanLine.match(/^(\d+)"?\s*-\s*(?:([A-Z]{1,3})\s*-\s*)?(\d+)$/i);
        if (measurementMatch) {
          const size = measurementMatch[2] ? `${measurementMatch[1]}"-${measurementMatch[2].toUpperCase()}` : `${measurementMatch[1]}"`;
          return { type: 'measurement', value: size, qty: parseInt(measurementMatch[3]) || 1 };
        }
        
        // Pattern 3: Known variant names - "Ergo- 1", "Wo wheel- 2"
        const variantMatch = cleanLine.match(/^(.+?)\s*-\s*(\d+)$/i);
        if (variantMatch) {
          const potentialVariant = variantMatch[1].trim().toUpperCase();
          if (KNOWN_VARIANT_NAMES.has(potentialVariant)) {
            return { type: 'variant', value: potentialVariant, qty: parseInt(variantMatch[2]) || 1 };
          }
        }
        
        return null;
      };
      
      // Helper to parse full product line: "PRODUCT NAME- SIZE- QTY"
      // Only matches lines with exactly 2 dashes in the pattern "name - size - qty"
      const parseFullProductSizeLine = (line: string): { productName: string; size: string; qty: number } | null => {
        const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        // Pattern: "product name- size- qty" 
        // Examples: "knee cap- m- 10", "Ankel binder-m- 8", "Cervical collar with supp- m- 8"
        // The size part should be a known size code or measurement
        const match = cleanLine.match(/^(.+?)\s*-\s*([A-Za-z0-9"]+)\s*-\s*(\d+)$/i);
        if (match) {
          const productName = match[1].trim();
          const potentialSize = match[2].trim().toUpperCase();
          
          // DON'T match if the product name is just a number/measurement (e.g., "14"")
          // These should be treated as measurement continuations, not new products
          if (/^\d+"?$/.test(productName)) {
            return null;
          }
          
          // Verify size is a known size code or looks like a measurement
          if (KNOWN_SIZE_CODES.has(potentialSize) || /^\d+"?$/.test(potentialSize)) {
            return {
              productName: productName,
              size: potentialSize,
              qty: parseInt(match[3]) || 1
            };
          }
        }
        return null;
      };
      
      // Parsed items array - shared across all parsing phases
      const parsedItems: Array<{rawText: string; productRef: string; quantity: number; freeQuantity: number}> = [];
      
      // Process continuation patterns and add directly to parsedItems
      // This is done BEFORE other parsing to handle the specific format
      const processedByContinuation = new Set<number>();
      
      // Two-track context tracking:
      // 1. lastProductFromSizeLine - for SIZE continuations (S, M, L, XL, etc.) 
      //    Only set from product-size-qty lines like "knee cap- m- 10"
      // 2. lastProductFromAnyLine - for VARIANT continuations (ERGO, NEOPRENE, etc.)
      //    Set from any product line including "Commod chair - 1"
      let lastProductFromSizeLine: string | null = null;
      let lastProductFromAnyLine: string | null = null;
      
      console.log('[PARSE DEBUG] Starting continuation parsing, productLines:', productLines.length);
      
      for (let i = 0; i < productLines.length; i++) {
        const line = productLines[i];
        const cleanLine = line.replace(/^\d+\.\s*/, '').trim();
        if (!cleanLine) continue;
        
        console.log(`[PARSE DEBUG] Line ${i}: "${cleanLine}", lastSizeProduct: "${lastProductFromSizeLine}", lastAnyProduct: "${lastProductFromAnyLine}"`);
        
        // Try to parse as full product-size-qty line first (2 dashes pattern)
        const fullProduct = parseFullProductSizeLine(cleanLine);
        if (fullProduct) {
          // Set both contexts from full product-size-qty lines
          lastProductFromSizeLine = fullProduct.productName;
          lastProductFromAnyLine = fullProduct.productName;
          console.log(`[PARSE DEBUG] -> Full product: ${fullProduct.productName} ${fullProduct.size} x${fullProduct.qty}`);
          parsedItems.push({
            rawText: cleanLine,
            productRef: `${fullProduct.productName} ${fullProduct.size}`,
            quantity: fullProduct.qty,
            freeQuantity: 0,
          });
          processedByContinuation.add(i);
          continue;
        }
        
        // Check if this is a "Do" prefix continuation (same product, different size)
        // "Do (M) 60" means: use previous product with size M and quantity 60
        const doContinuation = isDoPrefixContinuationLine(cleanLine);
        if (doContinuation) {
          // "Do" continuations prefer lastProductFromSizeLine (from product-size-qty lines)
          // but can also use lastProductFromAnyLine as fallback
          const contextProduct = lastProductFromSizeLine || lastProductFromAnyLine;
          
          if (contextProduct) {
            console.log(`[PARSE DEBUG] -> "Do" continuation to ${contextProduct}: ${doContinuation.size} x${doContinuation.qty}`);
            parsedItems.push({
              rawText: cleanLine,
              productRef: `${contextProduct} ${doContinuation.size}`,
              quantity: doContinuation.qty,
              freeQuantity: 0,
            });
            processedByContinuation.add(i);
            continue;
          } else {
            console.log(`[PARSE DEBUG] -> "Do" continuation found but no context product - marking as unmatched`);
            // No context product - this will fall through to be handled by other parsers
            // and likely end up as unmatched, which is the intended behavior
          }
        }
        
        // Check if this is a strict continuation line (size-only or known variant)
        const continuation = isStrictContinuationLine(cleanLine);
        console.log(`[PARSE DEBUG] -> Continuation check: ${continuation ? JSON.stringify(continuation) : 'null'}`);
        
        if (continuation) {
          // Size continuations (S, M, L, XL, etc.) need lastProductFromSizeLine
          // Variant/measurement continuations can use lastProductFromAnyLine
          const contextProduct = (continuation.type === 'size') 
            ? lastProductFromSizeLine 
            : (lastProductFromAnyLine || lastProductFromSizeLine);
          
          if (contextProduct) {
            console.log(`[PARSE DEBUG] -> Attaching ${continuation.type} to ${contextProduct}: ${continuation.value} x${continuation.qty}`);
            parsedItems.push({
              rawText: cleanLine,
              productRef: `${contextProduct} ${continuation.value}`,
              quantity: continuation.qty,
              freeQuantity: 0,
            });
            processedByContinuation.add(i);
            continue;
          }
        }
        
        // Check if this is a simple "product - qty" line (single dash, qty only)
        // This sets lastProductFromAnyLine for variant continuations but NOT lastProductFromSizeLine
        const simpleProductQty = cleanLine.match(/^(.+?)\s*-\s*(\d+)$/i);
        if (simpleProductQty) {
          const productName = simpleProductQty[1].trim();
          // Only update if it looks like a product name (not a size code or variant)
          if (!KNOWN_SIZE_CODES.has(productName.toUpperCase()) && !KNOWN_VARIANT_NAMES.has(productName.toUpperCase())) {
            console.log(`[PARSE DEBUG] -> Simple product-qty: "${productName}" x${simpleProductQty[2]}, setting lastProductFromAnyLine`);
            lastProductFromAnyLine = productName;
            // Reset size context since this isn't a size-based line
            lastProductFromSizeLine = null;
            // Don't add to processedByContinuation - let other parsers handle this line
            continue;
          }
        }
        
        // Check if this is a "product size qty" line (spaces only, no dashes)
        // Examples: "Emoform 150grm 40", "Nipple(m) 288", "Cotton buds 36"
        // This sets context for "Do" continuation lines
        // Pattern: product name + optional size + quantity at end (separated by spaces)
        const spaceProductQty = cleanLine.match(/^(.+?)\s+(\d+)$/);
        if (spaceProductQty) {
          const beforeQty = spaceProductQty[1].trim();
          const qty = spaceProductQty[2];
          
          // Try to extract product name and size from the beforeQty portion
          // Could be "Emoform 150grm" or just "Cotton buds"
          // Size patterns: "150grm", "50gr", "100ml", parenthesized like "(m)", "(L)"
          const sizeMatch = beforeQty.match(/^(.+?)\s+(\d+(?:grm?|ml|pcs|pc)?)$/i);
          const parenSizeMatch = beforeQty.match(/^(.+?)\s*\(([A-Za-z0-9]+)\)$/i);
          
          if (sizeMatch) {
            // Has size like "Emoform 150grm"
            const productName = sizeMatch[1].trim();
            console.log(`[PARSE DEBUG] -> Space-separated product-size-qty: "${productName}" size="${sizeMatch[2]}" x${qty}, setting both contexts`);
            lastProductFromAnyLine = productName;
            lastProductFromSizeLine = productName;
            continue;
          } else if (parenSizeMatch) {
            // Has parenthesized size like "Nipple(m)"
            const productName = parenSizeMatch[1].trim();
            console.log(`[PARSE DEBUG] -> Paren-size product-qty: "${productName}" size="(${parenSizeMatch[2]})" x${qty}, setting both contexts`);
            lastProductFromAnyLine = productName;
            lastProductFromSizeLine = productName;
            continue;
          } else {
            // Just product and qty, no size - set anyLine context only
            console.log(`[PARSE DEBUG] -> Space-separated product-qty: "${beforeQty}" x${qty}, setting lastProductFromAnyLine`);
            lastProductFromAnyLine = beforeQty;
            lastProductFromSizeLine = null;
            continue;
          }
        }
        
        // Not a continuation pattern - reset contexts
        console.log(`[PARSE DEBUG] -> Not matched, resetting contexts`);
        lastProductFromSizeLine = null;
        lastProductFromAnyLine = null;
      }
      
      console.log(`[PARSE DEBUG] Continuation parsing complete. Processed ${processedByContinuation.size} lines, parsedItems: ${parsedItems.length}`);
      
      // Filter out lines already processed by continuation parser
      const remainingLines = productLines.filter((_: string, i: number) => !processedByContinuation.has(i));
      
      const lines: string[] = [];
      
      for (const line of remainingLines) {
        // First split by semicolon for multiple products on same line
        const semicolonParts = line.split(/;+/).map((p: string) => p.trim()).filter((p: string) => p);
        
        for (const part of semicolonParts) {
          // 1. Try new NAME-based multi-size format first (uses / separator)
          // Examples: "soft collar with support -M/15,L/15", "KNEE CAP -M/20,L,/20,S/10"
          const nameBasedExpanded = tryExpandNameBasedMultiSize(part);
          
          if (nameBasedExpanded) {
            // NAME-based multi-size pattern matched - add directly to parsedItems
            for (const item of nameBasedExpanded) {
              parsedItems.push({
                rawText: part,
                productRef: `${item.productName} ${item.size}`,
                quantity: item.qty,
                freeQuantity: 0,
              });
            }
            continue;
          }
          
          // 2. Try PCS format (e.g., "WRIST BRACE WITH THUMB - 30PCS")
          const pcsFormat = tryParsePcsFormat(part);
          if (pcsFormat) {
            parsedItems.push({
              rawText: part,
              productRef: pcsFormat.productName,
              quantity: pcsFormat.qty,
              freeQuantity: 0,
            });
            continue;
          }
          
          // 3. Try single qty format (e.g., "UNIVERSAL SHOULDER IMMOBILIZER -6")
          const singleQtyFormat = tryParseSingleQtyFormat(part);
          if (singleQtyFormat) {
            parsedItems.push({
              rawText: part,
              productRef: singleQtyFormat.productName,
              quantity: singleQtyFormat.qty,
              freeQuantity: 0,
            });
            continue;
          }
          
          // 4. Try existing SKU-based multi-size pattern (uses - separator)
          // Examples: "F-01 M-3p,L-3p,S-3p" or "F-10-M-5p,S-2p,L-2p"
          const skuBasedExpanded = tryExpandMultiSizePattern(part);
          
          if (skuBasedExpanded) {
            // SKU-based multi-size pattern matched and expanded
            lines.push(...skuBasedExpanded);
          } else {
            // 5. Not any multi-size pattern - use original comma/semicolon splitting
            const commaParts = part.split(/,+/).map((p: string) => p.trim()).filter((p: string) => p);
            lines.push(...commaParts);
          }
        }
      }
      
      for (const line of lines) {
        // Structure: Product Name, Optional Size, then Qty (with possible punctuation before qty)
        // Can include free quantity in format: "Qty + FreeQty" or "Qty+FreeQty"
        // Examples: "Bentfix 1300+130", "Pea plus 300 + 30", "Etobix T 60", "Item.5"
        
        // First try to match quantity + free quantity pattern (e.g., "1300+130" or "300 + 30")
        const qtyFreeMatch = line.match(/^(.+?)[\s\-x.:;]*(\d+)\s*\+\s*(\d+)\s*(?:case|cse|pcs|pc|units?)?\.?$/i) ||
                             line.match(/^(.+?)\s+(\d+)\s*\+\s*(\d+)\.?$/i);
        
        if (qtyFreeMatch) {
          parsedItems.push({
            rawText: line,
            productRef: qtyFreeMatch[1].trim(),
            quantity: parseInt(qtyFreeMatch[2]) || 1,
            freeQuantity: parseInt(qtyFreeMatch[3]) || 0,
          });
        } else {
          // Try regular quantity pattern without free qty
          // Added pattern for trailing "p" like "A-27-UNI-5p" or "F-10-M-5P"
          const qtyMatch = line.match(/^(.+?)[\s\-x.:;]+(\d+)\s*(?:case|cse|pcs|pc|units?)?\.?$/i) ||
                           line.match(/^(.+?)\s+(\d+)\.?$/i) ||
                           line.match(/^(.+?)\.(\d+)$/i) ||
                           line.match(/^(.+?)-(\d+)[pP]$/i);
          
          if (qtyMatch) {
            parsedItems.push({
              rawText: line,
              productRef: qtyMatch[1].trim(),
              quantity: parseInt(qtyMatch[2]) || 1,
              freeQuantity: 0,
            });
          } else if (line.length > 0) {
            // No quantity found, assume 1
            parsedItems.push({
              rawText: line,
              productRef: line,
              quantity: 1,
              freeQuantity: 0,
            });
          }
        }
      }

      // Try to match parsed items with user's products using fuzzy matching
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Get products based on user role - admins get all, others get brand-based access
      let userProducts = await storage.getUserProductsByBrand(userId, user?.isAdmin ?? false);
      
      // If a brand filter is specified, filter products to only that brand
      if (brand && brand.trim()) {
        userProducts = userProducts.filter(p => p.brand.toLowerCase() === brand.toLowerCase());
      }
      
      // Helper to extract base product name from productRef (strip size)
      const getBaseProductName = (productRef: string): string => {
        const { queryWithoutSize } = extractSizeFromQuery(productRef);
        // Also strip measurement sizes like "19"", "14""
        return queryWithoutSize.replace(/\s*-?\s*\d+"?\s*$/, '').trim();
      };
      
      // Helper to extract product base name without size (for family matching)
      const getProductBaseName = (productName: string): string => {
        const normalized = normalizeText(productName);
        // Remove size tokens at the end: - M, - L, - XL, etc.
        const sizePatterns = ['xxxl', 'xxl', 'xl', 'xs', 'uni', 'spl', 'ch', 'lt', 'rt', 'left', 'right', 's', 'm', 'l'];
        let baseName = normalized;
        for (const size of sizePatterns) {
          const endPattern = new RegExp(`\\s*-?\\s*${size}$`, 'i');
          baseName = baseName.replace(endPattern, '');
        }
        return baseName.trim();
      };
      
      // Helper to check if product name contains all words from the base query
      const productContainsAllWords = (productName: string, baseWords: string[]): boolean => {
        const normalizedProduct = normalizeText(productName);
        const productWords = normalizedProduct.split(' ').filter(w => w.length > 0);
        
        for (const queryWord of baseWords) {
          if (queryWord.length < 2) continue;
          // Check if any product word matches or contains the query word
          const found = productWords.some(pw => 
            pw === queryWord || pw.includes(queryWord) || queryWord.includes(pw)
          );
          if (!found) return false;
        }
        return true;
      };
      
      // Group parsed items by base product name for continuation handling
      // Items with the same base name should match the same product family
      type ParsedItemWithGroup = typeof parsedItems[0] & { groupKey: string; baseWords: string[] };
      const itemsWithGroups: ParsedItemWithGroup[] = parsedItems.map(item => {
        const baseName = getBaseProductName(item.productRef).toLowerCase();
        const baseWords = normalizeText(baseName).split(' ').filter(w => w.length >= 2);
        return {
          ...item,
          groupKey: baseName,
          baseWords: baseWords
        };
      });
      
      // Track matched products by group key - use the first matched product's base name to constrain continuations
      const matchedProductBases: Map<string, string> = new Map();

      const matchedItems = itemsWithGroups.map((item, index) => {
        const productRef = item.productRef.trim();
        const groupKey = item.groupKey;
        const baseWords = item.baseWords;
        
        let matchedProduct = null;
        
        // Check if we already matched a product for this group
        const existingProductBase = matchedProductBases.get(groupKey);
        
        // Use higher threshold (0.5) for confident matching - better to fail than match wrong
        const HIGH_CONFIDENCE_THRESHOLD = 0.5;
        
        if (existingProductBase) {
          // This is a continuation - STRICTLY filter to products with the same base name
          const strictFamilyProducts = userProducts.filter(p => 
            getProductBaseName(p.name) === existingProductBase
          );
          
          if (strictFamilyProducts.length > 0) {
            matchedProduct = findBestMatch(productRef, strictFamilyProducts, HIGH_CONFIDENCE_THRESHOLD);
          }
          
          // If strict matching fails, try products containing all query words (still high threshold)
          if (!matchedProduct && baseWords.length > 0) {
            const looseFamilyProducts = userProducts.filter(p => productContainsAllWords(p.name, baseWords));
            if (looseFamilyProducts.length > 0) {
              matchedProduct = findBestMatch(productRef, looseFamilyProducts, HIGH_CONFIDENCE_THRESHOLD);
            }
          }
        } else {
          // First item in this group - filter by query words, then match
          const familyProducts = baseWords.length > 0 
            ? userProducts.filter(p => productContainsAllWords(p.name, baseWords))
            : userProducts;
          
          if (familyProducts.length > 0) {
            matchedProduct = findBestMatch(productRef, familyProducts, HIGH_CONFIDENCE_THRESHOLD);
          }
        }
        
        // NO FALLBACK to full catalog - if we can't match with high confidence, return null
        // This prevents matching wrong products when confidence is low
        
        // Store the matched product's base name for future continuations
        if (matchedProduct && !matchedProductBases.has(groupKey)) {
          matchedProductBases.set(groupKey, getProductBaseName(matchedProduct.name));
        }

        return {
          rawText: item.rawText,
          productRef: item.productRef,
          quantity: item.quantity,
          freeQuantity: item.freeQuantity,
          matchedProduct: matchedProduct ? {
            id: matchedProduct.id,
            sku: matchedProduct.sku,
            name: matchedProduct.name,
            brand: matchedProduct.brand,
            price: Number(matchedProduct.price),
            distributorPrice: matchedProduct.distributorPrice ? Number(matchedProduct.distributorPrice) : null,
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
      
      // Get brand access and delivery company access for each user
      const usersWithAccess = await Promise.all(
        allUsers.map(async (u) => {
          const brands = await storage.getUserBrandAccess(u.id);
          const deliveryCompanies = await storage.getUserDeliveryCompanyAccess(u.id);
          return { ...u, brandAccess: brands, deliveryCompanyAccess: deliveryCompanies };
        })
      );
      
      res.json(usersWithAccess);
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

  // Update user name (Admin only)
  app.patch('/api/admin/users/:id/name', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { firstName, lastName } = req.body;

      const updatedUser = await storage.updateUserName(targetUserId, firstName ?? null, lastName ?? null);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user name:", error);
      res.status(500).json({ message: "Failed to update user name" });
    }
  });

  // Reset user password (Admin only)
  app.patch('/api/admin/users/:id/password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const targetUserId = req.params.id;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!targetUser.phone) {
        return res.status(400).json({ message: "User does not have a phone number for password login" });
      }

      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 10);
      
      const updatedUser = await storage.updateUserPassword(targetUserId, passwordHash);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
      console.error("Error resetting user password:", error);
      res.status(500).json({ message: "Failed to reset password" });
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

  // Brand management routes
  app.get('/api/brands', isAuthenticated, async (req: any, res) => {
    try {
      // Seed brands if table is empty
      await storage.seedBrands();
      const brandList = await storage.getActiveBrands();
      res.json(brandList);
    } catch (error: any) {
      console.error("Error fetching brands:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get('/api/admin/brands', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.isAdmin && user?.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      // Seed brands if table is empty
      await storage.seedBrands();
      const brandList = await storage.getAllBrands();
      res.json(brandList);
    } catch (error: any) {
      console.error("Error fetching brands:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post('/api/admin/brands', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.isAdmin && user?.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const parseResult = insertBrandSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid brand data", errors: parseResult.error.errors });
      }
      
      const brand = await storage.createBrand(parseResult.data);
      res.status(201).json(brand);
    } catch (error: any) {
      console.error("Error creating brand:", error);
      if (error.code === "23505") {
        return res.status(400).json({ message: "Brand already exists" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.patch('/api/admin/brands/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.isAdmin && user?.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { id } = req.params;
      const { name, isActive } = req.body;
      
      const updated = await storage.updateBrand(id, { name, isActive });
      if (!updated) {
        return res.status(404).json({ message: "Brand not found" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating brand:", error);
      if (error.code === "23505") {
        return res.status(400).json({ message: "Brand name already exists" });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.delete('/api/admin/brands/:id', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.claims.sub);
      if (!user?.isAdmin && user?.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const { id } = req.params;
      
      // Get the brand first to check usage
      const allBrands = await storage.getAllBrands();
      const brand = allBrands.find(b => b.id === id);
      if (!brand) {
        return res.status(404).json({ message: "Brand not found" });
      }
      
      // Check if brand is in use by products or orders
      const usage = await storage.getBrandUsage(brand.name);
      if (usage.productCount > 0 || usage.orderCount > 0) {
        return res.status(409).json({ 
          message: `Cannot delete brand "${brand.name}". It is used by ${usage.productCount} product(s) and ${usage.orderCount} order(s). Consider deactivating the brand instead.` 
        });
      }
      
      const deleted = await storage.deleteBrand(id);
      if (!deleted) {
        return res.status(404).json({ message: "Brand not found" });
      }
      res.json({ message: "Brand deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting brand:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Create new user account (Admin only) - supports all roles
  app.post('/api/admin/customers', isAuthenticated, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      const admin = await storage.getUser(adminId);
      if (!admin?.isAdmin && admin?.role !== "Admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { email, phone, initialPassword, firstName, lastName, partyName, brands, deliveryCompanies, role } = req.body;
      const userRole = role || "Customer";
      const validRoles = ["Admin", "BrandAdmin", "User", "Customer"];
      
      if (!validRoles.includes(userRole)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Require either email or phone
      const hasEmail = email && email.trim();
      const hasPhone = phone && phone.trim();
      if (!hasEmail && !hasPhone) {
        return res.status(400).json({ message: "Either email or phone number is required" });
      }
      
      // If phone is provided, initial password is required
      if (hasPhone && (!initialPassword || initialPassword.length < 6)) {
        return res.status(400).json({ message: "Initial password (min 6 characters) is required for phone login users" });
      }
      
      // Party name is required only for Customer role
      if (userRole === "Customer" && (!partyName || !partyName.trim())) {
        return res.status(400).json({ message: "Party name is required for Customer accounts" });
      }

      // Check if user with this email already exists
      if (hasEmail) {
        const existingUser = await storage.getUserByEmail(email.toLowerCase().trim());
        if (existingUser) {
          return res.status(400).json({ message: "A user with this email already exists" });
        }
      }

      // Check if user with this phone already exists
      if (hasPhone) {
        const existingPhoneUser = await storage.getUserByPhone(phone.trim());
        if (existingPhoneUser) {
          return res.status(400).json({ message: "A user with this phone number already exists" });
        }
      }

      // Hash the initial password if provided
      const bcrypt = await import('bcryptjs');
      let passwordHash = null;
      if (hasPhone && initialPassword) {
        const saltRounds = 10;
        passwordHash = await bcrypt.hash(initialPassword, saltRounds);
      }

      // Generate a unique ID for the user (using email or phone hash for consistency)
      const crypto = await import('crypto');
      const idSource = hasEmail ? email.toLowerCase().trim() : phone.trim();
      const userId = crypto.createHash('md5').update(idSource).digest('hex');

      // Create the user
      const userData = {
        id: userId,
        email: hasEmail ? email.toLowerCase().trim() : null,
        phone: hasPhone ? phone.trim() : null,
        passwordHash: passwordHash,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        profileImageUrl: null,
        isAdmin: userRole === "Admin",
        role: userRole as "Admin" | "BrandAdmin" | "User" | "Customer",
        partyName: partyName?.trim() || null,
      };

      const newUser = await storage.upsertUser(userData);

      // Set brand access if provided
      if (brands && Array.isArray(brands) && brands.length > 0) {
        await storage.setUserBrandAccess(userId, brands);
      }

      // Set delivery company access if provided
      if (deliveryCompanies && Array.isArray(deliveryCompanies) && deliveryCompanies.length > 0) {
        await storage.setUserDeliveryCompanyAccess(userId, deliveryCompanies);
      }

      // Return the user with their access info
      const brandAccess = await storage.getUserBrandAccess(userId);
      const deliveryCompanyAccess = await storage.getUserDeliveryCompanyAccess(userId);

      res.status(201).json({
        ...newUser,
        brandAccess,
        deliveryCompanyAccess,
      });
    } catch (error: any) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: error.message || "Failed to create user" });
    }
  });

  // API Key authentication middleware for external agent endpoints
  const validateApiKey = (req: any, res: any, next: any) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    const validApiKey = process.env.CASHDESK_API_KEY;
    
    if (!validApiKey) {
      console.error("CASHDESK_API_KEY not configured");
      return res.status(500).json({ message: "API key not configured on server" });
    }
    
    if (!apiKey || apiKey !== validApiKey) {
      return res.status(401).json({ message: "Invalid or missing API key" });
    }
    
    next();
  };

  // Get Dispatch Summary - Returns orders dispatched within a date range
  // Required: startDate and endDate (format: YYYY-MM-DD)
  // Optional: brand filter (case-insensitive partial match)
  app.get('/api/dispatch/summary', validateApiKey, async (req: any, res) => {
    try {
      const { startDate, endDate, brand } = req.query;
      
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ message: "Valid startDate parameter required (format: YYYY-MM-DD)" });
      }
      if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ message: "Valid endDate parameter required (format: YYYY-MM-DD)" });
      }
      
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      rangeEnd.setDate(rangeEnd.getDate() + 1); // Include the end date
      
      if (rangeStart > rangeEnd) {
        return res.status(400).json({ message: "startDate must be before or equal to endDate" });
      }
      
      // Get all orders with Dispatched status
      const allOrders = await storage.getAllOrders({ status: 'Dispatched' });
      
      // Filter orders dispatched within the date range and optionally by brand
      const dispatchedOrders = allOrders.filter(order => {
        if (!order.dispatchDate) return false;
        const dispatchDate = new Date(order.dispatchDate);
        const dateMatch = dispatchDate >= rangeStart && dispatchDate < rangeEnd;
        if (!dateMatch) return false;
        
        // Apply brand filter if provided (case-insensitive partial match)
        if (brand) {
          const brandFilter = String(brand).toLowerCase();
          return order.brand?.toLowerCase().includes(brandFilter);
        }
        return true;
      });
      
      // Get order items for each order
      const summary = await Promise.all(dispatchedOrders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        return {
          orderId: order.id,
          partyName: order.partyName,
          brand: order.brand,
          invoiceNumber: order.invoiceNumber,
          invoiceDate: order.invoiceDate,
          dispatchDate: order.dispatchDate,
          dispatchBy: order.dispatchBy,
          cases: order.cases,
          deliveryCompany: order.deliveryCompany,
          estimatedDeliveryDate: order.estimatedDeliveryDate,
          deliveryAddress: order.deliveryAddress,
          orderValue: order.actualOrderValue || order.total,
          itemCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity + item.freeQuantity, 0),
        };
      }));
      
      res.json({
        startDate,
        endDate,
        count: summary.length,
        orders: summary,
      });
    } catch (error: any) {
      console.error("Error getting dispatch summary:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get Delivery Summary - Returns orders delivered within a date range
  // Required: startDate and endDate (format: YYYY-MM-DD)
  // Optional: brand filter (case-insensitive partial match)
  app.get('/api/delivery/summary', validateApiKey, async (req: any, res) => {
    try {
      const { startDate, endDate, brand } = req.query;
      
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ message: "Valid startDate parameter required (format: YYYY-MM-DD)" });
      }
      if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ message: "Valid endDate parameter required (format: YYYY-MM-DD)" });
      }
      
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      rangeEnd.setDate(rangeEnd.getDate() + 1); // Include the end date
      
      if (rangeStart > rangeEnd) {
        return res.status(400).json({ message: "startDate must be before or equal to endDate" });
      }
      
      // Get all orders with Delivered status
      const allOrders = await storage.getAllOrders({ status: 'Delivered' });
      
      // Filter orders delivered within the date range and optionally by brand
      const deliveredOrders = allOrders.filter(order => {
        if (!order.actualDeliveryDate) return false;
        const deliveryDate = new Date(order.actualDeliveryDate);
        const dateMatch = deliveryDate >= rangeStart && deliveryDate < rangeEnd;
        if (!dateMatch) return false;
        
        // Apply brand filter if provided (case-insensitive partial match)
        if (brand) {
          const brandFilter = String(brand).toLowerCase();
          return order.brand?.toLowerCase().includes(brandFilter);
        }
        return true;
      });
      
      // Get order items for each order
      const summary = await Promise.all(deliveredOrders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        
        // Calculate if delivered on time
        let onTime = order.deliveredOnTime;
        if (onTime === null && order.estimatedDeliveryDate && order.actualDeliveryDate) {
          onTime = new Date(order.actualDeliveryDate) <= new Date(order.estimatedDeliveryDate);
        }
        
        return {
          orderId: order.id,
          partyName: order.partyName,
          brand: order.brand,
          invoiceNumber: order.invoiceNumber,
          deliveryCompany: order.deliveryCompany,
          estimatedDeliveryDate: order.estimatedDeliveryDate,
          actualDeliveryDate: order.actualDeliveryDate,
          deliveredOnTime: onTime,
          deliveryAddress: order.deliveryAddress,
          deliveryNote: order.deliveryNote,
          orderValue: order.actualOrderValue || order.total,
          itemCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity + item.freeQuantity, 0),
        };
      }));
      
      // Calculate summary stats
      const onTimeCount = summary.filter(o => o.deliveredOnTime === true).length;
      
      res.json({
        startDate,
        endDate,
        count: summary.length,
        onTimeCount,
        onTimePercentage: summary.length > 0 ? Math.round((onTimeCount / summary.length) * 100) : 0,
        orders: summary,
      });
    } catch (error: any) {
      console.error("Error getting delivery summary:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get Created Orders Summary - Returns orders created within a date range
  // Required: startDate and endDate (format: YYYY-MM-DD)
  // Optional: brand filter (case-insensitive partial match)
  app.get('/api/created/summary', validateApiKey, async (req: any, res) => {
    try {
      const { startDate, endDate, brand } = req.query;
      
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ message: "Valid startDate parameter required (format: YYYY-MM-DD)" });
      }
      if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ message: "Valid endDate parameter required (format: YYYY-MM-DD)" });
      }
      
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      rangeEnd.setDate(rangeEnd.getDate() + 1); // Include the end date
      
      if (rangeStart > rangeEnd) {
        return res.status(400).json({ message: "startDate must be before or equal to endDate" });
      }
      
      // Get all orders (any status)
      const allOrders = await storage.getAllOrders({});
      
      // Filter orders created within the date range and optionally by brand
      const createdOrders = allOrders.filter(order => {
        if (!order.createdAt) return false;
        const createdDate = new Date(order.createdAt);
        const dateMatch = createdDate >= rangeStart && createdDate < rangeEnd;
        if (!dateMatch) return false;
        
        // Apply brand filter if provided (case-insensitive partial match)
        if (brand) {
          const brandFilter = String(brand).toLowerCase();
          return order.brand?.toLowerCase().includes(brandFilter);
        }
        return true;
      });
      
      // Get order items for each order
      const summary = await Promise.all(createdOrders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        // Get user who created the order
        const user = await storage.getUser(order.userId);
        return {
          orderId: order.id,
          partyName: order.partyName,
          brand: order.brand,
          status: order.status,
          createdAt: order.createdAt,
          createdBy: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.id || 'Unknown',
          deliveryCompany: order.deliveryCompany,
          deliveryNote: order.deliveryNote,
          specialNotes: order.specialNotes,
          orderValue: order.total,
          itemCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity + item.freeQuantity, 0),
          items: items.map(item => ({
            productName: item.productName,
            size: item.size,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            unitPrice: item.unitPrice,
          })),
        };
      }));
      
      // Calculate summary stats by status
      const statusCounts: Record<string, number> = {};
      const totalValue = summary.reduce((sum, order) => {
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
        return sum + Number(order.orderValue || 0);
      }, 0);
      
      res.json({
        startDate,
        endDate,
        count: summary.length,
        totalValue,
        statusCounts,
        orders: summary,
      });
    } catch (error: any) {
      console.error("Error getting created orders summary:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get All Orders Summary - Returns all orders within a date range across all statuses
  // Required: startDate and endDate (format: YYYY-MM-DD)
  // Optional: brand filter (case-insensitive partial match)
  app.get('/api/summary', validateApiKey, async (req: any, res) => {
    try {
      const { startDate, endDate, brand } = req.query;
      
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ message: "Valid startDate parameter required (format: YYYY-MM-DD)" });
      }
      if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ message: "Valid endDate parameter required (format: YYYY-MM-DD)" });
      }
      
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      rangeEnd.setDate(rangeEnd.getDate() + 1); // Include the end date
      
      if (rangeStart > rangeEnd) {
        return res.status(400).json({ message: "startDate must be before or equal to endDate" });
      }
      
      // Get all orders
      const allOrders = await storage.getAllOrders({});
      
      // Filter orders created within the date range and optionally by brand
      const filteredOrders = allOrders.filter(order => {
        if (!order.createdAt) return false;
        const createdDate = new Date(order.createdAt);
        const dateMatch = createdDate >= rangeStart && createdDate < rangeEnd;
        if (!dateMatch) return false;
        
        // Apply brand filter if provided (case-insensitive partial match)
        if (brand) {
          const brandFilter = String(brand).toLowerCase();
          return order.brand?.toLowerCase().includes(brandFilter);
        }
        return true;
      });
      
      // Group orders by status
      const ordersByStatus: Record<string, any[]> = {};
      
      // Process each order
      await Promise.all(filteredOrders.map(async (order) => {
        const items = await storage.getOrderItems(order.id);
        const user = await storage.getUser(order.userId);
        
        const orderData = {
          orderId: order.id,
          partyName: order.partyName,
          brand: order.brand,
          status: order.status,
          createdAt: order.createdAt,
          createdBy: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.id || 'Unknown',
          approvedBy: order.approvedBy,
          approvedAt: order.approvedAt,
          invoiceNumber: order.invoiceNumber,
          invoiceDate: order.invoiceDate,
          dispatchDate: order.dispatchDate,
          dispatchBy: order.dispatchBy,
          cases: order.cases,
          deliveryCompany: order.deliveryCompany,
          estimatedDeliveryDate: order.estimatedDeliveryDate,
          actualDeliveryDate: order.actualDeliveryDate,
          deliveryNote: order.deliveryNote,
          specialNotes: order.specialNotes,
          orderValue: order.actualOrderValue || order.total,
          itemCount: items.length,
          totalQuantity: items.reduce((sum, item) => sum + item.quantity + item.freeQuantity, 0),
          items: items.map(item => ({
            productName: item.productName,
            size: item.size,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            unitPrice: item.unitPrice,
          })),
        };
        
        const status = order.status || 'Unknown';
        if (!ordersByStatus[status]) {
          ordersByStatus[status] = [];
        }
        ordersByStatus[status].push(orderData);
      }));
      
      // Calculate summary stats
      const statusCounts: Record<string, number> = {};
      const statusValues: Record<string, number> = {};
      let totalValue = 0;
      
      Object.entries(ordersByStatus).forEach(([status, orders]) => {
        statusCounts[status] = orders.length;
        const statusTotal = orders.reduce((sum, order) => sum + Number(order.orderValue || 0), 0);
        statusValues[status] = statusTotal;
        totalValue += statusTotal;
      });
      
      res.json({
        startDate,
        endDate,
        brand: brand || null,
        totalOrders: filteredOrders.length,
        totalValue,
        statusCounts,
        statusValues,
        ordersByStatus,
      });
    } catch (error: any) {
      console.error("Error getting orders summary:", error);
      res.status(500).json({ message: error.message });
    }
  });

  return httpServer;
}
