import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import { BRAND } from "@/config/brand";
import CartPanel from "@/components/CartPanel";
import MobileCartDrawer from "@/components/MobileCartDrawer";
import MobileCartPage from "@/components/MobileCartPage";
import FloatingCartButton from "@/components/FloatingCartButton";
import ImportOrder from "@/components/ImportOrder";
import ParsedOrderReview from "@/components/ParsedOrderReview";
import OrderTab from "@/components/OrderTab";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/useIsMobile";
import { queryClient } from "@/lib/queryClient";
import { generateWhatsAppMessage, openWhatsApp } from "@/lib/whatsapp";
import type { CartItemData } from "@/components/CartItem";
import type { Product, Order } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ShoppingCart, MessageCircle, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface ParsedItem {
  rawText: string;
  productRef: string;
  size?: string;
  quantity: number;
  freeQuantity: number;
  matchedProduct: {
    id: string;
    sku: string;
    name: string;
    brand: string;
    price: number;
    distributorPrice?: number | null;
  } | null;
}

function getEffectivePrice(product: { price: number; distributorPrice?: number | string | null }): number {
  if (product.distributorPrice) {
    const dp = Number(product.distributorPrice);
    if (!isNaN(dp) && dp > 0) return dp;
  }
  return product.price;
}

interface StoredCartItem {
  productId: string;
  quantity: number;
  freeQuantity: number;
}

const CART_STORAGE_KEY = "order_entry_cart";

function saveCartToStorage(cart: CartItemData[]): void {
  try {
    const storedItems: StoredCartItem[] = cart.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      freeQuantity: item.freeQuantity,
    }));
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(storedItems));
  } catch (e) {
    console.warn("Failed to save cart to localStorage:", e);
  }
}

function loadCartFromStorage(): StoredCartItem[] {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("Failed to load cart from localStorage:", e);
  }
  return [];
}

export default function Home() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isVerySmallScreen = useIsMobile(376);
  
  // Read tab from URL query parameter
  const getInitialTab = (): "order" | "import" => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "order" || tab === "import") {
      return tab;
    }
    return "order";
  };
  
  const [activeTab, setActiveTab] = useState<"order" | "import">(getInitialTab);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItemData[]>([]);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [partyName, setPartyName] = useState("");
  const [importText, setImportText] = useState("");
  const [importBrandFilter, setImportBrandFilter] = useState<string>("all");
  const [orderDetails, setOrderDetails] = useState({
    partyName: "",
    deliveryCompany: "Guided",
    deliveryNotes: "",
    specialNotes: "",
    proposedDiscount: 0,
  });
  
  // Party verification state
  const [partyVerificationStatus, setPartyVerificationStatus] = useState<"idle" | "verifying" | "verified" | "not_found" | "error">("idle");
  const [verifiedPartyName, setVerifiedPartyName] = useState<string>("");
  
  // Wrapper to reset verification when party name changes
  const handleOrderDetailsChange = useCallback((newDetails: typeof orderDetails) => {
    // Reset verification if party name changed
    if (newDetails.partyName !== orderDetails.partyName) {
      setPartyVerificationStatus("idle");
      setVerifiedPartyName("");
    }
    setOrderDetails(newDetails);
  }, [orderDetails.partyName]);
  
  const [createdOrder, setCreatedOrder] = useState<any>(null);
  const [showOrderSuccessDialog, setShowOrderSuccessDialog] = useState(false);
  
  const isAdmin = user?.isAdmin === true;
  const isBrandAdmin = user?.role === 'BrandAdmin';
  const isCustomer = user?.role === "Customer";
  const cartRestoredRef = useRef(false);
  
  // State for Admin to create orders on behalf of other users
  const [selectedOrderUserId, setSelectedOrderUserId] = useState<string | null>(null);

  const { data: orderProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products/by-brand"],
    retry: false,
    staleTime: 30 * 1000, // 30 seconds - short enough to pick up photo uploads quickly
    refetchOnWindowFocus: true,
  });

  // Fetch product popularity counts for smart sorting
  const { data: popularityCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/products/popularity"],
    retry: false,
    staleTime: 10 * 60 * 1000, // 10 minutes - doesn't need frequent updates
    refetchOnWindowFocus: false,
  });
  
  // Fetch delivery company access for Customer role
  const { data: deliveryCompanyAccess } = useQuery<{ deliveryCompanies: string[] }>({
    queryKey: ["/api/users", user?.id, "delivery-company-access"],
    enabled: isCustomer && !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 minutes - rarely changes
    refetchOnWindowFocus: false,
  });
  
  // Fetch users for Admin to create orders on behalf of sales users
  const { data: allUsers = [] } = useQuery<Array<{ id: string; firstName: string | null; lastName: string | null; email: string | null; role: string | null }>>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
    staleTime: 10 * 60 * 1000, // 10 minutes - users don't change often
    refetchOnWindowFocus: false,
  });
  
  // Filter to get sales users (User and BrandAdmin roles, exclude Customers)
  const salesUsers = useMemo(() => 
    allUsers.filter(u => u.role === "User" || u.role === "BrandAdmin"),
    [allUsers]
  );
  
  const allowedDeliveryCompanies = isCustomer ? deliveryCompanyAccess?.deliveryCompanies : undefined;
  
  // Auto-populate party name for Customer role
  useEffect(() => {
    if (isCustomer && user?.partyName && !orderDetails.partyName) {
      setOrderDetails(prev => ({ ...prev, partyName: user.partyName || "" }));
    }
  }, [isCustomer, user?.partyName, orderDetails.partyName]);

  // Restore cart from localStorage when products are loaded (only once)
  useEffect(() => {
    if (orderProducts.length > 0 && !cartRestoredRef.current) {
      const storedItems = loadCartFromStorage();
      if (storedItems.length > 0) {
        const productMap = new Map(orderProducts.map(p => [p.id, p]));
        const restoredCart: CartItemData[] = [];
        let droppedCount = 0;
        
        for (const stored of storedItems) {
          const product = productMap.get(stored.productId);
          if (product) {
            restoredCart.push({
              product: {
                id: product.id,
                sku: product.sku,
                name: product.name,
                brand: product.brand,
                price: Number(product.price),
                distributorPrice: product.distributorPrice ? Number(product.distributorPrice) : undefined,
                stock: product.stock || 0,
                caseSize: product.caseSize || 1,
              },
              quantity: stored.quantity,
              freeQuantity: stored.freeQuantity,
            });
          } else {
            droppedCount++;
          }
        }
        
        if (restoredCart.length > 0) {
          setCart(restoredCart);
          if (droppedCount > 0) {
            toast({
              title: "Cart restored",
              description: `${restoredCart.length} items restored. ${droppedCount} items were removed (products no longer available).`,
            });
          }
        } else if (droppedCount > 0) {
          toast({
            title: "Cart cleared",
            description: `${droppedCount} items were removed (products no longer available).`,
            variant: "destructive",
          });
          localStorage.removeItem(CART_STORAGE_KEY);
        }
      }
      cartRestoredRef.current = true;
    }
  }, [orderProducts, toast]);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    saveCartToStorage(cart);
  }, [cart]);


  const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const brands = useMemo(() => {
    const uniqueBrands = Array.from(new Set(orderProducts.map(p => p.brand)));
    return uniqueBrands.sort();
  }, [orderProducts]);

  const cartItemCount = cart.length;

  const cartBrand = useMemo(() => {
    if (cart.length === 0) return null;
    return cart[0].product.brand;
  }, [cart]);

  const cartQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach(item => {
      map[item.product.id] = item.quantity;
    });
    return map;
  }, [cart]);

  const handleAddToCart = useCallback((product: { id: string; sku: string; name: string; brand: string; price: string | number; distributorPrice?: string | number | null; stock: number; caseSize?: number }, quantity: number = 1) => {
    if (cart.length > 0 && cart[0].product.brand !== product.brand) {
      toast({
        title: "Cannot mix brands",
        description: `Your cart contains ${cart[0].product.brand} products. Clear the cart to add ${product.brand} products.`,
        variant: "destructive",
      });
      return;
    }

    const productForCart = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      price: Number(product.price),
      distributorPrice: product.distributorPrice ? Number(product.distributorPrice) : null,
      stock: product.stock,
      caseSize: product.caseSize || 1,
    };
    
    const clampedQuantity = Math.min(quantity, 9999);
    
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: clampedQuantity }
            : item
        );
      }
      return [...prevCart, { product: productForCart, quantity: clampedQuantity, freeQuantity: 0 }];
    });
    
    const existingCartItem = cart.find(item => item.product.id === product.id);
    toast({
      title: existingCartItem ? "Updated cart" : "Added to cart",
      description: existingCartItem 
        ? `${product.name} quantity updated to ${clampedQuantity}.`
        : `${product.name} x${clampedQuantity} added to cart.`,
    });
  }, [toast, cart]);

  const handleQuantityChange = useCallback((productId: string, quantity: number) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const handleFreeQuantityChange = useCallback((productId: string, freeQuantity: number) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.product.id === productId ? { ...item, freeQuantity } : item
      )
    );
  }, []);

  const handleRemoveItem = useCallback((productId: string) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
  }, []);


  const generateOrderMessage = useCallback(() => {
    const lines = [
      "NEW ORDER",
      "─".repeat(20),
    ];

    if (orderDetails.partyName) {
      lines.push(`Party: ${orderDetails.partyName}`);
      lines.push("");
    }
    if (orderDetails.partyName) {
      lines.push("─".repeat(20));
    }
    lines.push("");

    cart.forEach(item => {
      const effectivePrice = getEffectivePrice(item.product);
      lines.push(`${item.product.name}`);
      lines.push(`  SKU: ${item.product.sku}`);
      lines.push(`  Qty: ${item.quantity} x ${formatINR(effectivePrice)} = ${formatINR(item.quantity * effectivePrice)}`);
      lines.push("");
    });

    const subtotal = cart.reduce((sum, item) => sum + getEffectivePrice(item.product) * item.quantity, 0);
    const safeDiscount = Math.min(100, Math.max(0, orderDetails.proposedDiscount || 0));
    const discountAmount = subtotal * (safeDiscount / 100);
    const finalTotal = subtotal - discountAmount;
    
    lines.push("─".repeat(20));
    lines.push(`SUBTOTAL: ${formatINR(subtotal)}`);
    if (safeDiscount > 0) {
      lines.push(`DISCOUNT (${safeDiscount}%): -${formatINR(discountAmount)}`);
    }
    lines.push(`TOTAL: ${formatINR(finalTotal)}`);

    if (orderDetails.deliveryNotes) {
      lines.push("");
      lines.push("─".repeat(20));
      lines.push(`DELIVERY NOTES: ${orderDetails.deliveryNotes}`);
    }
    if (orderDetails.specialNotes) {
      lines.push("");
      lines.push(`SPECIAL NOTES: ${orderDetails.specialNotes}`);
    }

    return lines.join("\n");
  }, [cart, orderDetails]);

  const [isSendingOrder, setIsSendingOrder] = useState(false);

  // Verify party name against external API
  const verifyPartyName = useCallback(async (name: string) => {
    if (!name.trim()) {
      setPartyVerificationStatus("idle");
      setVerifiedPartyName("");
      return;
    }
    
    setPartyVerificationStatus("verifying");
    try {
      const response = await fetch(`/api/verify/debtor?name=${encodeURIComponent(name.trim())}&limit=5`, {
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        if ((data.verified || data.found) && Array.isArray(data.matches) && data.matches.length > 0) {
          setPartyVerificationStatus("verified");
          setVerifiedPartyName(data.matches[0].name || name.trim());
        } else {
          setPartyVerificationStatus("not_found");
          setVerifiedPartyName("");
        }
      } else {
        // API error (401, 502, etc.) - show warning but allow order submission
        console.warn("Party verification API returned error status:", response.status);
        setPartyVerificationStatus("error");
        setVerifiedPartyName("");
      }
    } catch (error) {
      console.error("Party verification error:", error);
      // Network error - show warning but allow order submission
      setPartyVerificationStatus("error");
      setVerifiedPartyName("");
    }
  }, []);

  const handleSendOrder = useCallback(async () => {
    if (cart.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Add items to your cart before sending.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingOrder(true);
    try {
      const subtotal = cart.reduce((sum, item) => sum + getEffectivePrice(item.product) * item.quantity, 0);
      const safeDiscount = Math.min(100, Math.max(0, orderDetails.proposedDiscount || 0));
      const discountAmount = subtotal * (safeDiscount / 100);
      const finalTotal = subtotal - discountAmount;

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map(item => ({
            productId: item.product.id,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity || 0,
            price: String(getEffectivePrice(item.product)),
          })),
          total: String(finalTotal),
          brand: cart[0]?.product.brand || null,
          partyName: orderDetails.partyName || null,
          deliveryNote: orderDetails.deliveryNotes || null,
          deliveryCompany: orderDetails.deliveryCompany || "Guided",
          specialNotes: orderDetails.specialNotes || null,
          importText: importText || null,
          // Admin can create orders on behalf of sales users
          orderUserId: isAdmin && selectedOrderUserId ? selectedOrderUserId : undefined,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create order");
      }

      const orderData = await response.json();
      
      const orderWithProducts = {
        ...orderData,
        items: orderData.items.map((item: any) => {
          const cartItem = cart.find(c => c.product.id === item.productId);
          return {
            ...item,
            price: item.unitPrice || String(cartItem ? getEffectivePrice(cartItem.product) : 0),
            product: cartItem?.product,
          };
        }),
        user: user ? { firstName: user.firstName, lastName: user.lastName } : orderData.user,
      };
      
      setCreatedOrder(orderWithProducts);
      setShowOrderSuccessDialog(true);
      
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      
      setCart([]);
      setOrderDetails({
        partyName: "",
        deliveryCompany: "Guided",
        deliveryNotes: "",
        specialNotes: "",
        proposedDiscount: 0,
      });
      setPartyVerificationStatus("idle");
      setVerifiedPartyName("");
      setSelectedOrderUserId(null);
      setIsCartOpen(false);
      setImportText("");
      setParsedItems([]);
      setPartyName("");
    } catch (error: any) {
      toast({
        title: "Order failed",
        description: error.message || "Could not submit the order.",
        variant: "destructive",
      });
    } finally {
      setIsSendingOrder(false);
    }
  }, [cart, orderDetails, toast, importText]);

  const handleParsedItems = useCallback((name: string, items: ParsedItem[], originalText: string) => {
    setPartyName(name);
    setParsedItems(items);
    setImportText(originalText);
  }, []);

  const handleUpdateParsedQuantity = useCallback((index: number, quantity: number, freeQuantity?: number) => {
    setParsedItems(prev => 
      prev.map((item, i) => {
        if (i !== index) return item;
        if (freeQuantity !== undefined) {
          return { ...item, freeQuantity };
        }
        return { ...item, quantity };
      })
    );
  }, []);

  const handleRemoveParsedItem = useCallback((index: number) => {
    setParsedItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddParsedToCart = useCallback(() => {
    const matchedItems = parsedItems.filter(item => item.matchedProduct);
    
    if (matchedItems.length === 0) {
      toast({
        title: "No items to add",
        description: "No matched products found to add to cart",
        variant: "destructive",
      });
      return;
    }

    const brands = new Set(matchedItems.map(item => item.matchedProduct!.brand));
    if (brands.size > 1) {
      toast({
        title: "Cannot mix brands",
        description: "All items in an order must be from the same brand. Please select items from only one brand.",
        variant: "destructive",
      });
      return;
    }

    const parsedBrand = matchedItems[0].matchedProduct!.brand;
    if (cart.length > 0 && cart[0].product.brand !== parsedBrand) {
      toast({
        title: "Cannot mix brands",
        description: `Your cart contains ${cart[0].product.brand} products. Clear the cart to add ${parsedBrand} products.`,
        variant: "destructive",
      });
      return;
    }
    
    matchedItems.forEach(item => {
      if (item.matchedProduct) {
        const product = orderProducts.find(p => p.id === item.matchedProduct!.id);
        if (product) {
          setCart(prevCart => {
            const existingItem = prevCart.find(ci => ci.product.id === product.id);
            if (existingItem) {
              return prevCart.map(ci =>
                ci.product.id === product.id
                  ? { 
                      ...ci, 
                      quantity: ci.quantity + item.quantity,
                      freeQuantity: (ci.freeQuantity || 0) + (item.freeQuantity || 0)
                    }
                  : ci
              );
            }
            return [...prevCart, { 
              product: {
                id: product.id,
                sku: product.sku,
                name: product.name,
                brand: product.brand,
                price: Number(product.price),
                distributorPrice: product.distributorPrice ? Number(product.distributorPrice) : null,
                stock: product.stock,
                caseSize: product.caseSize || 1,
              }, 
              quantity: item.quantity,
              freeQuantity: item.freeQuantity || 0
            }];
          });
        }
      }
    });

    setOrderDetails(prev => ({
      ...prev,
      partyName: partyName || prev.partyName,
    }));

    toast({
      title: "Added to cart",
      description: `${matchedItems.length} item(s) added to cart`,
    });
    setParsedItems([]);
    setPartyName("");
    setIsCartOpen(true);
  }, [parsedItems, orderProducts, toast, cart, partyName]);

  const handleClearParsedItems = useCallback(() => {
    setParsedItems([]);
    setPartyName("");
  }, []);

  return (
    <div className="flex flex-col h-screen min-h-0 bg-background">
      <header className="flex-shrink-0 sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header
            cartItemCount={cartItemCount}
            onCartClick={() => setIsCartOpen(true)}
            isAdmin={isAdmin}
            isBrandAdmin={isBrandAdmin}
          />
        </div>
      </header>

      {cart.length > 0 && (
        <div className="flex-shrink-0 z-40 bg-primary text-primary-foreground border-b shadow-md">
          <div className="flex items-center justify-between gap-4 px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingCart className="w-4 h-4" />
              <span className="font-medium">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
              <span className="text-primary-foreground/80">
                {formatINR(cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsCartOpen(true)}
                data-testid="button-view-cart-bar"
              >
                View Cart
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-primary-foreground text-primary"
                onClick={handleSendOrder}
                disabled={isSendingOrder || !orderDetails.partyName}
                data-testid="button-send-order-bar"
              >
                {isSendingOrder ? "Sending..." : "Send Order"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="px-4 pt-4">
          <AnnouncementBanner userBrands={brands} />
        </div>
        {!isCustomer && (
          <div className="px-4 pt-3 pb-1 flex gap-2">
            <Button
              variant={activeTab === "order" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("order")}
              data-testid="tab-order"
            >
              Order
            </Button>
            <Button
              variant={activeTab === "import" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("import")}
              data-testid="tab-import"
            >
              Import
            </Button>
          </div>
        )}
        {(isCustomer || activeTab === "order") && (
          productsLoading ? (
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-lg border bg-card p-3 space-y-3 animate-pulse">
                    <div className="w-full h-24 bg-muted rounded-md" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="flex items-center justify-between mt-2">
                      <div className="h-3 bg-muted rounded w-1/4" />
                      <div className="h-8 w-20 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !isAdmin && orderProducts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-semibold mb-4">Welcome to {BRAND.appFullName}</h2>
                <p className="text-muted-foreground">
                  Please contact Tuhin Ghosh or Sujoy Kar for required access.
                </p>
              </div>
            </div>
          ) : (
            <OrderTab
              products={orderProducts.map(p => ({
                id: p.id,
                sku: p.sku,
                name: p.name,
                brand: p.brand,
                size: p.size,
                price: Number(p.price),
                distributorPrice: p.distributorPrice,
                alias1: (p as any).alias1 || null,
                alias2: (p as any).alias2 || null,
                stock: p.stock,
                caseSize: p.caseSize || 1,
              }))}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedBrand={selectedBrand}
              onBrandSelect={setSelectedBrand}
              cart={cart}
              onAddToCart={handleAddToCart}
              onOpenCart={() => setIsCartOpen(true)}
              popularityCounts={popularityCounts}
            />
          )
        )}

        {activeTab === "import" && !isCustomer && (
          productsLoading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm">Loading products…</p>
              </div>
            </div>
          ) : !isAdmin && orderProducts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <h2 className="text-2xl font-semibold mb-4">Welcome to {BRAND.appFullName}</h2>
                <p className="text-muted-foreground">
                  Please contact Tuhin Ghosh or Sujoy Kar for required access.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 max-w-2xl mx-auto space-y-4">
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">Import Order</h2>
                <p className="text-muted-foreground">
                  Paste or type order text to quickly add items to your cart. The system will match product names and SKUs.
                </p>
              </div>
              <ImportOrder 
                onItemsParsed={handleParsedItems} 
                availableBrands={Array.from(new Set(orderProducts.map(p => p.brand))).sort()}
                selectedBrand={importBrandFilter}
                onBrandChange={setImportBrandFilter}
              />
              {(parsedItems.length > 0 || partyName) && (
                <ParsedOrderReview
                  partyName={partyName}
                  items={parsedItems}
                  products={orderProducts}
                  brandFilter={importBrandFilter}
                  isAdmin={isAdmin}
                  onPartyNameChange={setPartyName}
                  onUpdateQuantity={handleUpdateParsedQuantity}
                  onUpdateProduct={(index, product) => {
                    setParsedItems(prev => prev.map((item, i) => 
                      i === index ? { ...item, matchedProduct: product } : item
                    ));
                  }}
                  onRemoveItem={handleRemoveParsedItem}
                  onAddToCart={handleAddParsedToCart}
                  onClear={handleClearParsedItems}
                />
              )}
            </div>
          )
        )}

      </main>

      {/* Cart - Desktop uses Sheet, Larger Mobile uses Drawer, Small Mobile uses Full Page */}
      {isMobile && isCartOpen && isVerySmallScreen ? (
        <MobileCartPage
          cartItems={cart}
          orderDetails={orderDetails}
          onOrderDetailsChange={handleOrderDetailsChange}
          onQuantityChange={handleQuantityChange}
          onFreeQuantityChange={handleFreeQuantityChange}
          onRemoveItem={handleRemoveItem}
          onClearCart={() => {
            setCart([]);
            setOrderDetails({
              partyName: isCustomer && user?.partyName ? user.partyName : "",
              deliveryCompany: "Guided",
              deliveryNotes: "",
              specialNotes: "",
              proposedDiscount: 0,
            });
            setPartyVerificationStatus("idle");
            setVerifiedPartyName("");
            setSelectedOrderUserId(null);
          }}
          onSendOrder={handleSendOrder}
          onClose={() => setIsCartOpen(false)}
          isSending={isSendingOrder}
          partyVerificationStatus={partyVerificationStatus}
          onVerifyParty={verifyPartyName}
          isCustomer={isCustomer}
          allowedDeliveryCompanies={allowedDeliveryCompanies}
          isAdmin={isAdmin}
          salesUsers={salesUsers}
          selectedOrderUserId={selectedOrderUserId}
          onSelectOrderUser={setSelectedOrderUserId}
        />
      ) : isMobile ? (
        <MobileCartDrawer
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          cartItems={cart}
          orderDetails={orderDetails}
          onOrderDetailsChange={handleOrderDetailsChange}
          onQuantityChange={handleQuantityChange}
          onFreeQuantityChange={handleFreeQuantityChange}
          onRemoveItem={handleRemoveItem}
          onClearCart={() => {
            setCart([]);
            setOrderDetails({
              partyName: isCustomer && user?.partyName ? user.partyName : "",
              deliveryCompany: "Guided",
              deliveryNotes: "",
              specialNotes: "",
              proposedDiscount: 0,
            });
            setPartyVerificationStatus("idle");
            setVerifiedPartyName("");
            setSelectedOrderUserId(null);
          }}
          onSendOrder={handleSendOrder}
          isSending={isSendingOrder}
          partyVerificationStatus={partyVerificationStatus}
          onVerifyParty={verifyPartyName}
          isCustomer={isCustomer}
          allowedDeliveryCompanies={allowedDeliveryCompanies}
          isAdmin={isAdmin}
          salesUsers={salesUsers}
          selectedOrderUserId={selectedOrderUserId}
          onSelectOrderUser={setSelectedOrderUserId}
        />
      ) : (
        <CartPanel
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          cartItems={cart}
          orderDetails={orderDetails}
          onOrderDetailsChange={handleOrderDetailsChange}
          onQuantityChange={handleQuantityChange}
          onFreeQuantityChange={handleFreeQuantityChange}
          onRemoveItem={handleRemoveItem}
          onClearCart={() => {
            setCart([]);
            setOrderDetails({
              partyName: isCustomer && user?.partyName ? user.partyName : "",
              deliveryCompany: "Guided",
              deliveryNotes: "",
              specialNotes: "",
              proposedDiscount: 0,
            });
            setPartyVerificationStatus("idle");
            setVerifiedPartyName("");
            setSelectedOrderUserId(null);
          }}
          onSendOrder={handleSendOrder}
          isSending={isSendingOrder}
          partyVerificationStatus={partyVerificationStatus}
          onVerifyParty={verifyPartyName}
          isCustomer={isCustomer}
          allowedDeliveryCompanies={allowedDeliveryCompanies}
          isAdmin={isAdmin}
          salesUsers={salesUsers}
          selectedOrderUserId={selectedOrderUserId}
          onSelectOrderUser={setSelectedOrderUserId}
        />
      )}

      {/* Floating Cart Button for Mobile */}
      {isMobile && (
        <FloatingCartButton
          itemCount={cart.reduce((sum, item) => sum + item.quantity + (item.freeQuantity || 0), 0)}
          onClick={() => setIsCartOpen(true)}
        />
      )}

      <Dialog open={showOrderSuccessDialog} onOpenChange={setShowOrderSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Order Sent Successfully
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Your order has been submitted. Would you like to share it via WhatsApp?
            </p>
            {createdOrder && (
              <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                <p><span className="font-medium">Party:</span> {createdOrder.partyName}</p>
                <p><span className="font-medium">Brand:</span> {createdOrder.brand}</p>
                <p><span className="font-medium">Items:</span> {createdOrder.items?.length || 0}</p>
                <p><span className="font-medium">Total:</span> ₹{parseFloat(createdOrder.total).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowOrderSuccessDialog(false)}
              data-testid="button-close-success"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                if (createdOrder) {
                  const message = generateWhatsAppMessage(createdOrder, "created");
                  openWhatsApp(message, createdOrder.whatsappPhone);
                }
                setShowOrderSuccessDialog(false);
              }}
              className="gap-2"
              data-testid="button-share-whatsapp"
            >
              <MessageCircle className="w-4 h-4" />
              Share on WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
