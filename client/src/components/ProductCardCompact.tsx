import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, ShoppingCart } from "lucide-react";

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
  stock: number;
}

export interface GroupedProduct {
  baseKey: string;
  name: string;
  brand: string;
  variants: ProductVariant[];
}

interface ProductCardCompactProps {
  group: GroupedProduct;
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

export default function ProductCardCompact({ group, onAddToCart }: ProductCardCompactProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    group.variants.length === 1 ? group.variants[0] : null
  );
  const [quantity, setQuantity] = useState(1);

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

  const handleAdd = () => {
    if (selectedVariant) {
      onAddToCart(selectedVariant, quantity);
      setQuantity(1);
    }
  };

  const handleSizeClick = (variant: ProductVariant) => {
    setSelectedVariant(variant);
    setQuantity(1);
  };

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
          {group.variants.map(variant => (
            <Badge
              key={variant.id}
              variant={selectedVariant?.id === variant.id ? "default" : "outline"}
              className="cursor-pointer text-xs px-2 py-0.5"
              onClick={() => handleSizeClick(variant)}
              data-testid={`badge-size-${variant.id}`}
            >
              {variant.size || 'One Size'}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="text-sm font-semibold" data-testid={`text-price-${group.baseKey}`}>
          {selectedVariant ? (
            formatINR(selectedVariant.price)
          ) : priceRange.isSame ? (
            formatINR(priceRange.min)
          ) : (
            <span className="text-xs">{formatINR(priceRange.min)} - {formatINR(priceRange.max)}</span>
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
                className="w-10 h-7 text-center text-xs p-0"
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
            disabled={!selectedVariant}
            data-testid={`button-add-${group.baseKey}`}
          >
            <ShoppingCart className="w-3 h-3" />
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
