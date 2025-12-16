import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import BrandFilter from "@/components/BrandFilter";
import ProductCard from "@/components/ProductCard";
import UploadDropzone from "@/components/UploadDropzone";
import CartPanel from "@/components/CartPanel";
import EmptyState from "@/components/EmptyState";
import ImportOrder from "@/components/ImportOrder";
import ParsedOrderReview from "@/components/ParsedOrderReview";
import OrderTab from "@/components/OrderTab";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { CartItemData } from "@/components/CartItem";
import type { Product } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

interface ParsedItem {
  rawText: string;
  productRef: string;
  size?: string;
  quantity: number;
  matchedProduct: {
    id: string;
    sku: string;
    name: string;
    brand: string;
    price: number;
  } | null;
}

interface UploadedFile {
  name: string;
  brand: string;
  productCount: number;
}

export default function Home() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"products" | "order" | "import" | "upload">("order");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItemData[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [partyName, setPartyName] = useState("");
  const [orderDetails, setOrderDetails] = useState({
    partyName: "",
    brand: "",
    deliveryNotes: "",
    specialNotes: "",
  });
  
  const isAdmin = user?.isAdmin === true;

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/products/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setUploadedFiles(prev => [...prev, {
        name: data.fileName || "uploaded-file.xlsx",
        brand: data.brand,
        productCount: data.count,
      }]);
      toast({
        title: "Upload successful",
        description: `Imported ${data.count} products`,
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Session expired",
          description: "Please log in again",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Upload failed",
        description: "Could not parse the file",
        variant: "destructive",
      });
    },
  });

  const brands = useMemo(() => {
    const uniqueBrands = Array.from(new Set(products.map(p => p.brand)));
    return uniqueBrands.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.brand.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBrand = selectedBrand === null || product.brand === selectedBrand;
      return matchesSearch && matchesBrand;
    });
  }, [products, searchQuery, selectedBrand]);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleAddToCart = useCallback((product: { id: string; sku: string; name: string; brand: string; price: string | number; stock: number }, quantity: number = 1) => {
    const productForCart = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      price: Number(product.price),
      stock: product.stock,
    };
    
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + quantity, product.stock || 999) }
            : item
        );
      }
      return [...prevCart, { product: productForCart, quantity: Math.min(quantity, product.stock || 999) }];
    });
    toast({
      title: "Added to cart",
      description: `${product.name} x${quantity} has been added to your cart.`,
    });
  }, [toast]);

  const handleQuantityChange = useCallback((productId: string, quantity: number) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const handleRemoveItem = useCallback((productId: string) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("brand", file.name.split(/[-_.]/)[0].toUpperCase());
    uploadMutation.mutate(formData);
  }, [uploadMutation]);

  const handleRemoveFile = useCallback((fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  }, []);

  const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const generateOrderMessage = useCallback(() => {
    const lines = [
      "NEW ORDER",
      "─".repeat(20),
    ];

    if (orderDetails.partyName) {
      lines.push(`Party: ${orderDetails.partyName}`);
    }
    if (orderDetails.brand) {
      lines.push(`Brand: ${orderDetails.brand}`);
    }
    if (orderDetails.partyName || orderDetails.brand) {
      lines.push("─".repeat(20));
    }
    lines.push("");

    cart.forEach(item => {
      lines.push(`${item.product.name}`);
      lines.push(`  SKU: ${item.product.sku}`);
      lines.push(`  Qty: ${item.quantity} x ${formatINR(item.product.price)} = ${formatINR(item.quantity * item.product.price)}`);
      lines.push("");
    });

    const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const safeDiscount = Math.min(100, Math.max(0, discountPercent));
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
  }, [cart, discountPercent, orderDetails]);

  const handleSendWhatsApp = useCallback((phone: string) => {
    if (!phone.trim()) {
      toast({
        title: "Phone number required",
        description: "Please enter a WhatsApp number.",
        variant: "destructive",
      });
      return;
    }

    const message = encodeURIComponent(generateOrderMessage());
    const cleanPhone = phone.replace(/\D/g, "");
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
    
    toast({
      title: "Opening WhatsApp",
      description: "Your order message is ready to send.",
    });
  }, [generateOrderMessage, toast]);

  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleSendEmail = useCallback(async (email: string) => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }

    if (cart.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Add items to your cart before sending.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const response = await fetch("/api/orders/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          orderDetails,
          cart,
          discountPercent,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send email");
      }

      toast({
        title: "Order sent!",
        description: `Order email sent to ${email} with CSV attachment.`,
      });
    } catch (error: any) {
      toast({
        title: "Email failed",
        description: error.message || "Could not send the order email.",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  }, [cart, discountPercent, orderDetails, toast]);

  const handleCopyMessage = useCallback(() => {
    navigator.clipboard.writeText(generateOrderMessage());
    toast({
      title: "Copied!",
      description: "Order message copied to clipboard.",
    });
  }, [generateOrderMessage, toast]);

  const handleParsedItems = useCallback((name: string, items: ParsedItem[]) => {
    setPartyName(name);
    setParsedItems(items);
  }, []);

  const handleUpdateParsedQuantity = useCallback((index: number, quantity: number) => {
    setParsedItems(prev => 
      prev.map((item, i) => i === index ? { ...item, quantity } : item)
    );
  }, []);

  const handleRemoveParsedItem = useCallback((index: number) => {
    setParsedItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddParsedToCart = useCallback(() => {
    const matchedItems = parsedItems.filter(item => item.matchedProduct);
    
    matchedItems.forEach(item => {
      if (item.matchedProduct) {
        const product = products.find(p => p.id === item.matchedProduct!.id);
        if (product) {
          setCart(prevCart => {
            const existingItem = prevCart.find(ci => ci.product.id === product.id);
            if (existingItem) {
              return prevCart.map(ci =>
                ci.product.id === product.id
                  ? { ...ci, quantity: Math.min(ci.quantity + item.quantity, product.stock) }
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
                stock: product.stock,
              }, 
              quantity: Math.min(item.quantity, product.stock) 
            }];
          });
        }
      }
    });

    toast({
      title: "Added to cart",
      description: `${matchedItems.length} item(s) added to cart`,
    });
    setParsedItems([]);
  }, [parsedItems, products, toast]);

  const handleClearParsedItems = useCallback(() => {
    setParsedItems([]);
    setPartyName("");
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header
            cartItemCount={cartItemCount}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onCartClick={() => setIsCartOpen(true)}
            isAdmin={isAdmin}
          />
          
          {user && (
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback>
                  {user.firstName?.[0] || user.email?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm hidden sm:block">
                {user.firstName || user.email}
              </span>
              <Button
                variant="ghost"
                size="icon"
                asChild
                data-testid="button-logout"
              >
                <a href="/api/logout">
                  <LogOut className="w-5 h-5" />
                </a>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {activeTab === "products" && (
          <div className="h-full flex flex-col">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-muted-foreground">Loading products...</p>
              </div>
            ) : products.length === 0 ? (
              <EmptyState type="no-products" onUploadClick={() => setActiveTab(isAdmin ? "upload" : "import")} />
            ) : (
              <>
                <div className="p-4 space-y-4 border-b bg-background sticky top-16 z-40">
                  <SearchBar value={searchQuery} onChange={setSearchQuery} />
                  <BrandFilter
                    brands={brands}
                    selectedBrand={selectedBrand}
                    onSelectBrand={setSelectedBrand}
                  />
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {filteredProducts.length === 0 ? (
                      <EmptyState type="no-results" />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredProducts.map(product => (
                          <ProductCard
                            key={product.id}
                            product={{
                              id: product.id,
                              sku: product.sku,
                              name: product.name,
                              brand: product.brand,
                              price: Number(product.price),
                              stock: product.stock,
                            }}
                            onAddToCart={(p, qty) => handleAddToCart(product, qty)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        )}

        {activeTab === "order" && (
          <OrderTab
            products={products.map(p => ({
              id: p.id,
              sku: p.sku,
              name: p.name,
              brand: p.brand,
              size: p.size,
              price: Number(p.price),
              stock: p.stock,
            }))}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedBrand={selectedBrand}
            onBrandSelect={setSelectedBrand}
            orderDetails={orderDetails}
            onOrderDetailsChange={setOrderDetails}
            cart={cart}
            onAddToCart={handleAddToCart}
            onOpenCart={() => setIsCartOpen(true)}
          />
        )}

        {activeTab === "import" && (
          <div className="p-4 max-w-2xl mx-auto space-y-4">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Import Order</h2>
              <p className="text-muted-foreground">
                Paste or type order text to quickly add items to your cart. The system will match product names and SKUs.
              </p>
            </div>
            <ImportOrder onItemsParsed={handleParsedItems} />
            {(parsedItems.length > 0 || partyName) && (
              <ParsedOrderReview
                partyName={partyName}
                items={parsedItems}
                onPartyNameChange={setPartyName}
                onUpdateQuantity={handleUpdateParsedQuantity}
                onRemoveItem={handleRemoveParsedItem}
                onAddToCart={handleAddParsedToCart}
                onClear={handleClearParsedItems}
              />
            )}
          </div>
        )}

        {activeTab === "upload" && isAdmin && (
          <div className="p-4 max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Upload Product Inventory</h2>
              <p className="text-muted-foreground">
                Import product lists from your brands. Upload Excel files (.xlsx, .xls) with columns: Brand, Name, Product SKU ID, Size, and optionally MRP.
              </p>
            </div>
            <UploadDropzone
              onFileUpload={handleFileUpload}
              uploadedFiles={uploadedFiles}
              onRemoveFile={handleRemoveFile}
              isUploading={uploadMutation.isPending}
            />
          </div>
        )}
      </main>

      <CartPanel
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        discountPercent={discountPercent}
        onDiscountChange={setDiscountPercent}
        orderDetails={orderDetails}
        onOrderDetailsChange={setOrderDetails}
        onQuantityChange={handleQuantityChange}
        onRemoveItem={handleRemoveItem}
        onSendWhatsApp={handleSendWhatsApp}
        onSendEmail={handleSendEmail}
        onCopyMessage={handleCopyMessage}
        isSendingEmail={isSendingEmail}
      />
    </div>
  );
}
