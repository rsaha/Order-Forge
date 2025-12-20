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
import { LogOut, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [partyName, setPartyName] = useState("");
  const [orderDetails, setOrderDetails] = useState({
    partyName: "",
    deliveryCompany: "Guided",
    deliveryNotes: "",
    specialNotes: "",
    proposedDiscount: 0,
  });
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    brand: "",
    sku: "",
    size: "",
    aliases: "",
    price: "",
    stock: "",
  });
  
  const isAdmin = user?.isAdmin === true;

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    retry: false,
  });

  const { data: orderProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products/by-brand"],
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

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/products/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product updated successfully" });
      setSelectedProduct(null);
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted successfully" });
      setProductToDelete(null);
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  const handleProductClick = useCallback((product: Product) => {
    setSelectedProduct(product);
    setEditFormData({
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      size: product.size || "",
      aliases: (product as any).aliases || "",
      price: String(product.price),
      stock: String(product.stock),
    });
  }, []);

  const handleSaveProduct = useCallback(() => {
    if (!selectedProduct) return;
    updateProductMutation.mutate({
      id: selectedProduct.id,
      updates: {
        name: editFormData.name,
        brand: editFormData.brand,
        sku: editFormData.sku,
        size: editFormData.size || null,
        aliases: editFormData.aliases || null,
        price: editFormData.price,
        stock: parseInt(editFormData.stock) || 0,
      },
    });
  }, [selectedProduct, editFormData, updateProductMutation]);

  const handleDeleteProduct = useCallback(() => {
    if (!productToDelete) return;
    deleteProductMutation.mutate(productToDelete.id);
  }, [productToDelete, deleteProductMutation]);

  const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const brands = useMemo(() => {
    const uniqueBrands = Array.from(new Set(products.map(p => p.brand)));
    return uniqueBrands.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(product => {
        const matchesSearch = 
          product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product.brand.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesBrand = selectedBrand === null || product.brand === selectedBrand;
        return matchesSearch && matchesBrand;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [products, searchQuery, selectedBrand]);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const cartBrand = useMemo(() => {
    if (cart.length === 0) return null;
    return cart[0].product.brand;
  }, [cart]);

  const handleAddToCart = useCallback((product: { id: string; sku: string; name: string; brand: string; price: string | number; stock: number }, quantity: number = 1) => {
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
  }, [toast, cart]);

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
      lines.push(`${item.product.name}`);
      lines.push(`  SKU: ${item.product.sku}`);
      lines.push(`  Qty: ${item.quantity} x ${formatINR(item.product.price)} = ${formatINR(item.quantity * item.product.price)}`);
      lines.push("");
    });

    const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
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
      const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
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
            price: String(item.product.price),
          })),
          total: String(finalTotal),
          brand: cart[0]?.product.brand || null,
          partyName: orderDetails.partyName || null,
          deliveryAddress: orderDetails.deliveryNotes || null,
          deliveryCompany: orderDetails.deliveryCompany || "Guided",
          remarks: orderDetails.specialNotes || null,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create order");
      }

      toast({
        title: "Order sent!",
        description: "Your order has been submitted successfully.",
      });
      
      setCart([]);
      setOrderDetails({
        partyName: "",
        deliveryCompany: "Guided",
        deliveryNotes: "",
        specialNotes: "",
        proposedDiscount: 0,
      });
      setIsCartOpen(false);
    } catch (error: any) {
      toast({
        title: "Order failed",
        description: error.message || "Could not submit the order.",
        variant: "destructive",
      });
    } finally {
      setIsSendingOrder(false);
    }
  }, [cart, orderDetails, toast]);

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
        const product = products.find(p => p.id === item.matchedProduct!.id);
        if (product) {
          setCart(prevCart => {
            const existingItem = prevCart.find(ci => ci.product.id === product.id);
            if (existingItem) {
              return prevCart.map(ci =>
                ci.product.id === product.id
                  ? { ...ci, quantity: ci.quantity + item.quantity }
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
              quantity: item.quantity 
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
  }, [parsedItems, products, toast, cart, partyName]);

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

      {cart.length > 0 && (
        <div className="sticky top-16 z-40 bg-primary text-primary-foreground border-b shadow-md">
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
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr className="border-b">
                              <th className="p-3 text-left font-medium">SKU</th>
                              <th className="p-3 text-left font-medium">Name</th>
                              <th className="p-3 text-left font-medium">Brand</th>
                              <th className="p-3 text-left font-medium">Size</th>
                              <th className="p-3 text-right font-medium">MRP</th>
                              <th className="p-3 text-center font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredProducts.map(product => (
                              <tr
                                key={product.id}
                                className="border-b hover-elevate cursor-pointer"
                                onClick={() => handleProductClick(product)}
                                data-testid={`row-product-${product.id}`}
                              >
                                <td className="p-3 font-mono text-muted-foreground" data-testid={`text-sku-${product.id}`}>
                                  {product.sku}
                                </td>
                                <td className="p-3 font-medium" data-testid={`text-name-${product.id}`}>
                                  {product.name}
                                </td>
                                <td className="p-3" data-testid={`text-brand-${product.id}`}>
                                  {product.brand}
                                </td>
                                <td className="p-3" data-testid={`text-size-${product.id}`}>
                                  {product.size || "-"}
                                </td>
                                <td className="p-3 text-right" data-testid={`text-mrp-${product.id}`}>
                                  {formatINR(Number(product.price))}
                                </td>
                                <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleProductClick(product)}
                                      data-testid={`button-edit-${product.id}`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setProductToDelete(product)}
                                      data-testid={`button-delete-${product.id}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
            products={orderProducts.map(p => ({
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
                products={products}
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
        orderDetails={orderDetails}
        onOrderDetailsChange={setOrderDetails}
        onQuantityChange={handleQuantityChange}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => {
          setCart([]);
          setOrderDetails({
            partyName: "",
            deliveryCompany: "Guided",
            deliveryNotes: "",
            specialNotes: "",
            proposedDiscount: 0,
          });
        }}
        onSendOrder={handleSendOrder}
        isSending={isSendingOrder}
      />

      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-sku">SKU</Label>
              <Input
                id="edit-sku"
                value={editFormData.sku}
                onChange={(e) => setEditFormData({ ...editFormData, sku: e.target.value })}
                data-testid="input-edit-sku"
              />
            </div>
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                data-testid="input-edit-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-brand">Brand</Label>
              <Input
                id="edit-brand"
                value={editFormData.brand}
                onChange={(e) => setEditFormData({ ...editFormData, brand: e.target.value })}
                data-testid="input-edit-brand"
              />
            </div>
            <div>
              <Label htmlFor="edit-size">Size</Label>
              <Input
                id="edit-size"
                value={editFormData.size}
                onChange={(e) => setEditFormData({ ...editFormData, size: e.target.value })}
                data-testid="input-edit-size"
              />
            </div>
            <div>
              <Label htmlFor="edit-aliases">Aliases (comma-separated)</Label>
              <Input
                id="edit-aliases"
                value={editFormData.aliases}
                onChange={(e) => setEditFormData({ ...editFormData, aliases: e.target.value })}
                placeholder="e.g., short name, abbreviation"
                data-testid="input-edit-aliases"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Short names used in import order matching
              </p>
            </div>
            <div>
              <Label htmlFor="edit-price">MRP</Label>
              <Input
                id="edit-price"
                type="number"
                step="0.01"
                value={editFormData.price}
                onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })}
                data-testid="input-edit-price"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedProduct(null)} data-testid="button-cancel-edit">
              Cancel
            </Button>
            <Button onClick={handleSaveProduct} disabled={updateProductMutation.isPending} data-testid="button-save-product">
              {updateProductMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{productToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProduct}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteProductMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
