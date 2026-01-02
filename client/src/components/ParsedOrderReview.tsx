import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, X, AlertTriangle, ShoppingCart, Search, Pencil, Save, Loader2 } from "lucide-react";
import { formatINR } from "./ProductCard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface MatchedProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: number;
  distributorPrice?: number | null;
}

interface ParsedItem {
  rawText: string;
  productRef: string;
  size?: string;
  quantity: number;
  freeQuantity: number;
  matchedProduct: MatchedProduct | null;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: string | number;
  distributorPrice?: string | number | null;
  stock: number;
  alias1?: string | null;
  alias2?: string | null;
}

interface ParsedOrderReviewProps {
  partyName: string;
  items: ParsedItem[];
  products: Product[];
  brandFilter?: string;
  isAdmin?: boolean;
  onPartyNameChange: (name: string) => void;
  onUpdateQuantity: (index: number, quantity: number, freeQuantity?: number) => void;
  onUpdateProduct: (index: number, product: MatchedProduct | null) => void;
  onRemoveItem: (index: number) => void;
  onAddToCart: () => void;
  onClear: () => void;
}

export default function ParsedOrderReview({
  partyName,
  items,
  products,
  brandFilter,
  isAdmin,
  onPartyNameChange,
  onUpdateQuantity,
  onUpdateProduct,
  onRemoveItem,
  onAddToCart,
  onClear,
}: ParsedOrderReviewProps) {
  const { toast } = useToast();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [saveAsAlias, setSaveAsAlias] = useState(false);
  const [originalSearchTerm, setOriginalSearchTerm] = useState("");
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  
  const matchedItems = items.filter(item => item.matchedProduct);
  const unmatchedItems = items.filter(item => !item.matchedProduct);
  
  // Check if all matched items have PTS (distributorPrice)
  const allHavePTS = matchedItems.every(item => 
    item.matchedProduct?.distributorPrice != null && item.matchedProduct.distributorPrice > 0
  );
  
  const total = matchedItems.reduce((sum, item) => {
    if (item.matchedProduct) {
      // Use distributorPrice (PTS) if available, otherwise MRP
      const effectivePrice = item.matchedProduct.distributorPrice != null && item.matchedProduct.distributorPrice > 0
        ? item.matchedProduct.distributorPrice
        : item.matchedProduct.price;
      return sum + effectivePrice * item.quantity;
    }
    return sum;
  }, 0);

  const filteredProducts = products.filter(p => {
    // Apply brand filter first if specified
    if (brandFilter && brandFilter !== "all" && p.brand.toLowerCase() !== brandFilter.toLowerCase()) {
      return false;
    }
    const search = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(search) ||
           p.sku.toLowerCase().includes(search) ||
           p.brand.toLowerCase().includes(search);
  });

  const handleSelectProduct = async (product: Product) => {
    if (editingIndex === null) return;
    
    const currentItem = items[editingIndex];
    const wasUnmatched = !currentItem.matchedProduct;
    
    // If admin wants to save alias and item was previously unmatched
    if (isAdmin && saveAsAlias && wasUnmatched && originalSearchTerm) {
      setIsSavingAlias(true);
      try {
        await apiRequest("POST", `/api/products/${product.id}/add-alias`, {
          alias: originalSearchTerm,
        });
        toast({
          title: "Alias saved",
          description: `"${originalSearchTerm}" saved as alias for ${product.name}`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      } catch (error: any) {
        toast({
          title: "Failed to save alias",
          description: error.message || "Could not save alias",
          variant: "destructive",
        });
      }
      setIsSavingAlias(false);
    }
    
    onUpdateProduct(editingIndex, {
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      price: Number(product.price),
      distributorPrice: product.distributorPrice ? Number(product.distributorPrice) : null,
    });
    setEditingIndex(null);
    setProductSearch("");
    setSaveAsAlias(false);
    setOriginalSearchTerm("");
  };

  const openProductPicker = (index: number) => {
    const item = items[index];
    setEditingIndex(index);
    setProductSearch(item.productRef);
    // Only track original search term for unmatched items
    if (!item.matchedProduct) {
      setOriginalSearchTerm(item.productRef);
      setSaveAsAlias(true); // Default to saving alias for unmatched items
    } else {
      setOriginalSearchTerm("");
      setSaveAsAlias(false);
    }
  };

  return (
    <>
      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h3 className="font-semibold text-lg">Parsed Order</h3>
          <Button variant="ghost" size="sm" onClick={onClear} data-testid="button-clear-parsed">
            Clear All
          </Button>
        </div>

        <div className="mb-4">
          <label className="text-sm font-medium mb-1 block">Party / Customer Name</label>
          <Input
            value={partyName}
            onChange={(e) => onPartyNameChange(e.target.value)}
            placeholder="Enter party name"
            data-testid="input-party-name"
          />
        </div>

        <ScrollArea className="h-[50vh] min-h-[300px] max-h-[500px] pr-4">
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className={`p-3 rounded-md border ${
                  item.matchedProduct ? "bg-background" : "bg-destructive/5 border-destructive/20"
                }`}
                data-testid={`parsed-item-${index}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.matchedProduct ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Matched
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-destructive border-destructive">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Not Found
                        </Badge>
                      )}
                      {item.size && (
                        <Badge variant="secondary">Size: {item.size}</Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      Original: {item.rawText}
                    </p>
                    
                    {item.matchedProduct ? (
                      <div className="mt-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{item.matchedProduct.name}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => openProductPicker(index)}
                            data-testid={`button-edit-product-${index}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.matchedProduct.sku}
                        </p>
                        <p className="text-sm font-medium mt-1">
                          {formatINR(
                            item.matchedProduct.distributorPrice != null && item.matchedProduct.distributorPrice > 0
                              ? item.matchedProduct.distributorPrice
                              : item.matchedProduct.price
                          )} each
                          <span className="text-xs text-muted-foreground ml-1">
                            ({item.matchedProduct.distributorPrice != null && item.matchedProduct.distributorPrice > 0 ? "PTS" : "MRP"})
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="font-medium text-destructive mb-2">
                          "{item.productRef}" not found
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openProductPicker(index)}
                          data-testid={`button-select-product-${index}`}
                        >
                          <Search className="w-3 h-3 mr-1" />
                          Select Product
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col items-center">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => onUpdateQuantity(index, parseInt(e.target.value) || 1)}
                          className="w-20 h-8 text-center text-sm"
                          data-testid={`input-quantity-${index}`}
                        />
                        <span className="text-xs text-muted-foreground">Qty</span>
                      </div>
                      <span className="text-muted-foreground text-sm font-medium">+</span>
                      <div className="flex flex-col items-center">
                        <Input
                          type="number"
                          min="0"
                          value={item.freeQuantity || 0}
                          onChange={(e) => onUpdateQuantity(index, item.quantity, parseInt(e.target.value) || 0)}
                          className="w-20 h-8 text-center text-sm"
                          data-testid={`input-free-quantity-${index}`}
                        />
                        <span className="text-xs text-muted-foreground">Free</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveItem(index)}
                        data-testid={`button-remove-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {unmatchedItems.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              {unmatchedItems.length} item(s) need product selection.
              Click "Select Product" to match them.
            </p>
          </div>
        )}

        <div className="mt-4 pt-4 border-t space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">
              {matchedItems.length} of {items.length} item(s) matched
            </span>
            <div className="text-right">
              <span className="font-semibold text-lg" data-testid="text-parsed-total">
                {formatINR(total)}
              </span>
              <p className="text-xs text-muted-foreground">
                {allHavePTS ? "Order Value (PTS)" : "Order Value (MRP)"}
              </p>
            </div>
          </div>
          
          <Button
            className="w-full"
            onClick={onAddToCart}
            disabled={matchedItems.length === 0}
            data-testid="button-add-parsed-to-cart"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Add {matchedItems.length} Item(s) to Cart
          </Button>
        </div>
      </Card>

      <Dialog open={editingIndex !== null} onOpenChange={(open) => {
        if (!open) {
          setEditingIndex(null);
          setSaveAsAlias(false);
          setOriginalSearchTerm("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Product</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9"
                data-testid="input-product-search"
              />
            </div>

            {isAdmin && originalSearchTerm && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                <Checkbox
                  id="save-as-alias"
                  checked={saveAsAlias}
                  onCheckedChange={(checked) => setSaveAsAlias(checked === true)}
                  data-testid="checkbox-save-as-alias"
                />
                <label htmlFor="save-as-alias" className="text-sm flex-1 cursor-pointer">
                  <Save className="w-3 h-3 inline mr-1" />
                  Save "{originalSearchTerm}" as alias
                </label>
              </div>
            )}
            
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {isSavingAlias ? (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-muted-foreground">Saving alias...</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No products found
                  </p>
                ) : (
                  filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="p-3 rounded-md border hover-elevate cursor-pointer"
                      onClick={() => handleSelectProduct(product)}
                      data-testid={`product-option-${product.id}`}
                    >
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {product.sku} | {product.brand}
                      </p>
                      <p className="text-sm font-medium mt-1">
                        {formatINR(Number(product.price))}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
