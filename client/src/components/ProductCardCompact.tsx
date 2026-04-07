import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  alias1?: string | null;
  alias2?: string | null;
  stock: number;
  caseSize?: number;
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
  
  // Preserve original order (don't sort alphabetically - preserve popularity order)
  return result;
}

export default function ProductCardCompact({ group, cartQuantityMap = {}, onAddToCart }: ProductCardCompactProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(
    group.variants.length === 1 ? group.variants[0] : null
  );
  const [casesMode, setCasesMode] = useState(false);
  
  const cartQuantity = selectedVariant ? cartQuantityMap[selectedVariant.id] : undefined;
  const isInCart = cartQuantity !== undefined && cartQuantity > 0;
  const caseSize = selectedVariant?.caseSize && selectedVariant.caseSize > 1 ? selectedVariant.caseSize : null;
  
  const [inputValue, setInputValue] = useState(() => {
    if (selectedVariant && cartQuantityMap[selectedVariant.id]) {
      return cartQuantityMap[selectedVariant.id];
    }
    return 1;
  });

  useEffect(() => {
    if (selectedVariant) {
      const cartQty = cartQuantityMap[selectedVariant.id];
      if (cartQty !== undefined && cartQty > 0) {
        setInputValue(casesMode && caseSize ? Math.floor(cartQty / caseSize) : cartQty);
      }
    }
  }, [selectedVariant, cartQuantityMap, casesMode, caseSize]);

  // reset cases mode when variant changes (different caseSize)
  useEffect(() => {
    setCasesMode(false);
  }, [selectedVariant?.id]);

  const priceRange = useMemo(() => {
    const prices = group.variants.map(v => v.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return { min, max, isSame: min === max };
  }, [group.variants]);

  const unitQty = casesMode && caseSize ? inputValue * caseSize : inputValue;

  const handleQuantityChange = (value: number) => {
    const max = casesMode && caseSize ? Math.floor(9999 / caseSize) : 9999;
    setInputValue(Math.max(1, Math.min(value, max)));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleAdd = () => {
    if (selectedVariant) {
      onAddToCart(selectedVariant, unitQty);
    }
  };

  const handleToggleMode = (newCasesMode: boolean) => {
    if (!caseSize) return;
    if (newCasesMode) {
      setInputValue(Math.max(1, Math.floor(inputValue / caseSize)));
    } else {
      setInputValue(Math.max(1, inputValue * caseSize));
    }
    setCasesMode(newCasesMode);
  };

  const handleSizeClick = (variant: ProductVariant) => {
    setSelectedVariant(variant);
    const cartQty = cartQuantityMap[variant.id];
    if (cartQty !== undefined && cartQty > 0) {
      setInputValue(cartQty);
    } else {
      setInputValue(1);
    }
  };

  const hasChanges = !isInCart || unitQty !== cartQuantity;

  return (
    <Card className="p-3 flex flex-col gap-2 overflow-hidden">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate" data-testid={`text-brand-${group.baseKey}`}>
          {group.brand}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <h3 className="font-medium text-sm leading-tight break-words cursor-default" data-testid={`text-name-${group.baseKey}`}>
              {group.name}
            </h3>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[250px] hidden sm:block">
            <p className="text-sm">{group.name}</p>
          </TooltipContent>
        </Tooltip>
        {(group.variants[0]?.alias1 || group.variants[0]?.alias2) && (
          <p className="text-xs text-muted-foreground italic mt-0.5" data-testid={`text-alias-${group.baseKey}`}>
            {[group.variants[0]?.alias1, group.variants[0]?.alias2].filter(Boolean).join(', ')}
          </p>
        )}
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
            {caseSize && (
              <span className="text-xs text-muted-foreground/70">1 case = {caseSize} units</span>
            )}
          </>
        ) : priceRange.isSame ? (
          <span className="text-xs text-muted-foreground">MRP: {formatINR(priceRange.min)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">MRP: {formatINR(priceRange.min)} - {formatINR(priceRange.max)}</span>
        )}
      </div>

      {caseSize && selectedVariant && (
        <div className="flex items-center gap-1 text-xs" data-testid={`toggle-mode-compact-${selectedVariant.id}`}>
          <button
            className={`px-1.5 py-0.5 rounded-l border text-xs font-medium transition-colors ${!casesMode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
            onClick={() => handleToggleMode(false)}
            data-testid={`button-units-compact-${selectedVariant.id}`}
          >
            Units
          </button>
          <button
            className={`px-1.5 py-0.5 rounded-r border-t border-b border-r text-xs font-medium transition-colors ${casesMode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
            onClick={() => handleToggleMode(true)}
            data-testid={`button-cases-compact-${selectedVariant.id}`}
          >
            Cases
          </button>
        </div>
      )}
      
      <div className="flex flex-col items-end gap-1 mt-auto">
        <div className="flex items-center gap-1 w-full justify-end">
          {selectedVariant && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => handleQuantityChange(inputValue - 1)}
                disabled={inputValue <= 1}
                data-testid={`button-qty-minus-${selectedVariant.id}`}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <Input
                type="number"
                min={1}
                value={inputValue}
                onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                onFocus={handleFocus}
                className="w-10 h-7 text-center text-xs p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid={`input-qty-${selectedVariant.id}`}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => handleQuantityChange(inputValue + 1)}
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
        {casesMode && caseSize && selectedVariant && (
          <span className="text-xs text-muted-foreground" data-testid={`text-unit-equiv-compact-${selectedVariant.id}`}>
            = {unitQty} units
          </span>
        )}
      </div>

      {group.variants.length > 1 && !selectedVariant && (
        <p className="text-xs text-muted-foreground text-center">
          Select a size
        </p>
      )}
    </Card>
  );
}
