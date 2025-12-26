import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, ShoppingCart, Check } from "lucide-react";

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  brand: string;
  size: string | null;
  price: number;
  distributorPrice?: number | string | null;
  stock: number;
}

function getEffectivePrice(variant: ProductVariant): number {
  if (variant.distributorPrice) {
    const dp = Number(variant.distributorPrice);
    if (!isNaN(dp) && dp > 0) return dp;
  }
  return Number(variant.price) || 0;
}

export interface GroupedProduct {
  baseKey: string;
  name: string;
  brand: string;
  variants: ProductVariant[];
}

interface ProductCardCompactProps {
  group: GroupedProduct;
  cartQuantityMap?: Record<string, number>;
  onAddToCart: (variant: ProductVariant, quantity: number) => void;
}

export function groupProductsByName(products: ProductVariant[]): GroupedProduct[] {
  const groups = new Map<string, GroupedProduct>();
  
  for (const product of products) {
    const baseKey = `${product.brand}::${product.name}`;
    
    if (!groups.has(baseKey)) {
      groups.set(baseKey, {
        baseKey,
        name: product.name,
        brand: product.brand,
        variants: [],
      });
    }
    
    groups.get(baseKey)!.variants.push(product);
  }
  
  const result = Array.from(groups.values());
  
  for (const group of result) {
    group.variants.sort((a: ProductVariant, b: ProductVariant) => {
      const sizeA = a.size || '';
      const sizeB = b.size || '';
      const numA = parseFloat(sizeA);
      const numB = parseFloat(sizeB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return sizeA.localeCompare(sizeB);
    });
  }
  
  return result.sort((a: GroupedProduct, b: GroupedProduct) => 
    a.name.localeCompare(b.name)
  );
}

export default function ProductCardCompact({ group, cartQuantityMap = {}, onAddToCart }: ProductCardCompactProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    group.variants.length === 1 ? group.variants[0] : null
  );
  
  const cartQuantity = selectedVariant ? cartQuantityMap[selectedVariant.id] : undefined;
  const isInCart = cartQuantity !== undefined && cartQuantity > 0;
  
  const [quantity, setQuantity] = useState(() => {
    if (selectedVariant && cartQuantityMap[selectedVariant.id]) {
      return cartQuantityMap[selectedVariant.id];
    }
    return 1;
  });

  useEffect(() => {
    if (selectedVariant) {
      const cartQty = cartQuantityMap[selectedVariant.id];
      if (cartQty !== undefined && cartQty > 0) {
        setQuantity(cartQty);
      }
    }
  }, [selectedVariant, cartQuantityMap]);

  const priceRange = useMemo(() => {
    const prices = group.variants.map(v => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max, isSame: min === max };
  }, [group.variants]);

  const handleQuantityChange = (value: number) => {
    const maxStock = selectedVariant?.stock || 999;
    const newQty = Math.max(1, Math.min(value, maxStock));
    setQuantity(newQty);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleAdd = () => {
    if (selectedVariant) {
      onAddToCart(selectedVariant, quantity);
    }
  };

  const handleSizeClick = (variant: ProductVariant) => {
    setSelectedVariant(variant);
    const cartQty = cartQuantityMap[variant.id];
    if (cartQty !== undefined && cartQty > 0) {
      setQuantity(cartQty);
    } else {
      setQuantity(1);
    }
  };

  const hasChanges = !isInCart || quantity !== cartQuantity;

  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate" data-testid={`text-brand-${group.baseKey}`}>
          {group.brand}
        </p>
        <h3 className="font-medium text-sm leading-tight line-clamp-2" data-testid={`text-name-${group.baseKey}`}>
          {group.name}
        </h3>
      </div>

      {group.variants.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {group.variants.map(variant => {
            const variantInCart = cartQuantityMap[variant.id] !== undefined && cartQuantityMap[variant.id] > 0;
            return (
              <Badge
                key={variant.id}
                variant={selectedVariant?.id === variant.id ? "default" : variantInCart ? "secondary" : "outline"}
                className="cursor-pointer text-xs px-2 py-0.5"
                onClick={() => handleSizeClick(variant)}
                data-testid={`badge-size-${variant.id}`}
              >
                {variant.size || 'One Size'}
                {variantInCart && selectedVariant?.id !== variant.id && (
                  <Check className="w-3 h-3 ml-1" />
                )}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex flex-col" data-testid={`text-price-${group.baseKey}`}>
          {selectedVariant ? (
            <>
              <span className="text-xs text-muted-foreground">
                MRP: {formatINR(Number(selectedVariant.price))}
              </span>
              {selectedVariant.distributorPrice && Number(selectedVariant.distributorPrice) > 0 && (
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                  PTS: {formatINR(getEffectivePrice(selectedVariant))}
                </span>
              )}
            </>
          ) : priceRange.isSame ? (
            <span className="text-xs text-muted-foreground">MRP: {formatINR(priceRange.min)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">MRP: {formatINR(priceRange.min)} - {formatINR(priceRange.max)}</span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {selectedVariant && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
                data-testid={`button-qty-minus-${selectedVariant.id}`}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <Input
                type="number"
                min={1}
                max={selectedVariant.stock || 999}
                value={quantity}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                onFocus={handleFocus}
                className="w-10 h-7 text-center text-xs p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid={`input-qty-${selectedVariant.id}`}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => handleQuantityChange(quantity + 1)}
                data-testid={`button-qty-plus-${selectedVariant.id}`}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            className="h-7 px-2"
            onClick={handleAdd}
            disabled={!selectedVariant || !hasChanges}
            variant={isInCart && !hasChanges ? "secondary" : "default"}
            data-testid={`button-add-${group.baseKey}`}
          >
            {isInCart && !hasChanges ? (
              <Check className="w-3 h-3" />
            ) : isInCart ? (
              <Check className="w-3 h-3" />
            ) : (
              <ShoppingCart className="w-3 h-3" />
            )}
          </Button>
        </div>
      </div>

      {group.variants.length > 1 && !selectedVariant && (
        <p className="text-xs text-muted-foreground text-center">
          Select a size
        </p>
      )}
    </Card>
  );
}
