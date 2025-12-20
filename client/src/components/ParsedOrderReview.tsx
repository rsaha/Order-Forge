import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, AlertTriangle, ShoppingCart, Search, Pencil } from "lucide-react";
import { formatINR } from "./ProductCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MatchedProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: number;
}

interface ParsedItem {
  rawText: string;
  productRef: string;
  size?: string;
  quantity: number;
  matchedProduct: MatchedProduct | null;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: string | number;
  stock: number;
}

interface ParsedOrderReviewProps {
  partyName: string;
  items: ParsedItem[];
  products: Product[];
  onPartyNameChange: (name: string) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onUpdateProduct: (index: number, product: MatchedProduct | null) => void;
  onRemoveItem: (index: number) => void;
  onAddToCart: () => void;
  onClear: () => void;
}

export default function ParsedOrderReview({
  partyName,
  items,
  products,
  onPartyNameChange,
  onUpdateQuantity,
  onUpdateProduct,
  onRemoveItem,
  onAddToCart,
  onClear,
}: ParsedOrderReviewProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  
  const matchedItems = items.filter(item => item.matchedProduct);
  const unmatchedItems = items.filter(item => !item.matchedProduct);
  
  const total = matchedItems.reduce((sum, item) => {
    if (item.matchedProduct) {
      return sum + item.matchedProduct.price * item.quantity;
    }
    return sum;
  }, 0);

  const filteredProducts = products.filter(p => {
    const search = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(search) ||
           p.sku.toLowerCase().includes(search) ||
           p.brand.toLowerCase().includes(search);
  });

  const handleSelectProduct = (product: Product) => {
    if (editingIndex !== null) {
      onUpdateProduct(editingIndex, {
        id: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        price: Number(product.price),
      });
      setEditingIndex(null);
      setProductSearch("");
    }
  };

  const openProductPicker = (index: number) => {
    setEditingIndex(index);
    setProductSearch(items[index].productRef);
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
                          {formatINR(item.matchedProduct.price)} each
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
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => onUpdateQuantity(index, parseInt(e.target.value) || 1)}
                      className="w-16 h-8 text-center"
                      data-testid={`input-quantity-${index}`}
                    />
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
            <span className="font-semibold text-lg" data-testid="text-parsed-total">
              {formatINR(total)}
            </span>
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

      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && setEditingIndex(null)}>
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
            
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {filteredProducts.length === 0 ? (
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
