import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, AlertTriangle, ShoppingCart } from "lucide-react";
import { formatINR } from "./ProductCard";

interface ParsedItem {
  rawText: string;
  productRef: string;
  size?: string;
  quantity: number;
  confidence: number;
  matchedProduct: {
    id: string;
    sku: string;
    name: string;
    brand: string;
    price: number;
  } | null;
}

interface ParsedOrderReviewProps {
  partyName: string;
  items: ParsedItem[];
  onPartyNameChange: (name: string) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onRemoveItem: (index: number) => void;
  onAddToCart: () => void;
  onClear: () => void;
}

export default function ParsedOrderReview({
  partyName,
  items,
  onPartyNameChange,
  onUpdateQuantity,
  onRemoveItem,
  onAddToCart,
  onClear,
}: ParsedOrderReviewProps) {
  const matchedItems = items.filter(item => item.matchedProduct);
  const unmatchedItems = items.filter(item => !item.matchedProduct);
  
  const total = matchedItems.reduce((sum, item) => {
    if (item.matchedProduct) {
      return sum + item.matchedProduct.price * item.quantity;
    }
    return sum;
  }, 0);

  return (
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

      <ScrollArea className="max-h-[400px]">
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
                      <p className="font-medium">{item.matchedProduct.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.matchedProduct.sku} | {item.matchedProduct.brand}
                      </p>
                      <p className="text-sm font-medium mt-1">
                        {formatINR(item.matchedProduct.price)} each
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 font-medium text-destructive">
                      "{item.productRef}" not found in catalog
                    </p>
                  )}
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {item.matchedProduct && (
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => onUpdateQuantity(index, parseInt(e.target.value) || 1)}
                      className="w-16 h-8 text-center"
                      data-testid={`input-quantity-${index}`}
                    />
                  )}
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
            {unmatchedItems.length} item(s) could not be matched to your product catalog.
            They will be skipped when adding to cart.
          </p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">
            {matchedItems.length} matched item(s)
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
  );
}
