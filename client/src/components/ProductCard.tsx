import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, Check, Package } from "lucide-react";
import { transformImageUrl } from "@/lib/imageUtils";

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: number;
  distributorPrice?: number | string | null;
  stock: number;
  caseSize?: number;
  category?: string;
  photoUrl?: string | null;
}

interface ProductCardProps {
  product: Product;
  cartQuantity?: number;
  onAddToCart: (product: Product, quantity: number) => void;
}

export default function ProductCard({ product, cartQuantity, onAddToCart }: ProductCardProps) {
  const caseSize = product.caseSize && product.caseSize > 1 ? product.caseSize : null;
  const isInCart = cartQuantity !== undefined && cartQuantity > 0;
  const [casesMode, setCasesMode] = useState(false);

  // displayed quantity: in cases or units depending on mode
  const [inputValue, setInputValue] = useState(() => {
    if (isInCart && cartQuantity) {
      return casesMode && caseSize ? Math.floor(cartQuantity / caseSize) : cartQuantity;
    }
    return 1;
  });

  // sync when cartQuantity changes from outside
  useEffect(() => {
    if (cartQuantity !== undefined && cartQuantity > 0) {
      setInputValue(casesMode && caseSize ? Math.floor(cartQuantity / caseSize) : cartQuantity);
    }
  }, [cartQuantity, casesMode, caseSize]);

  // when toggling modes, convert displayed value
  const handleToggleMode = (newCasesMode: boolean) => {
    if (newCasesMode && caseSize) {
      setInputValue(Math.max(1, Math.floor(inputValue / caseSize)));
    } else if (!newCasesMode && caseSize) {
      setInputValue(Math.max(1, inputValue * caseSize));
    }
    setCasesMode(newCasesMode);
  };

  // unit quantity (what gets submitted)
  const unitQty = casesMode && caseSize ? inputValue * caseSize : inputValue;

  const handleQuantityChange = (value: number) => {
    setInputValue(Math.max(1, Math.min(value, casesMode && caseSize ? Math.floor(9999 / caseSize) : 9999)));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleAdd = () => {
    onAddToCart(product, unitQty);
  };

  const hasChanges = !isInCart || unitQty !== cartQuantity;

  const photoSrc = transformImageUrl(product.photoUrl);
  const [imgError, setImgError] = useState(false);

  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="w-full h-28 rounded-md overflow-hidden bg-muted flex items-center justify-center">
        {photoSrc && !imgError ? (
          <img
            src={photoSrc}
            alt={product.name}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
            data-testid={`img-product-${product.id}`}
          />
        ) : (
          <Package className="w-10 h-10 text-muted-foreground/30" data-testid={`icon-no-photo-${product.id}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm text-muted-foreground truncate" data-testid={`text-sku-${product.id}`}>
          {product.sku}
        </p>
        <h3 className="font-medium text-base break-words whitespace-normal leading-tight" data-testid={`text-name-${product.id}`}>
          {product.name}
        </h3>
        <p className="text-sm text-muted-foreground" data-testid={`text-brand-${product.id}`}>
          {product.brand}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground" data-testid={`text-mrp-${product.id}`}>
            MRP: {formatINR(product.price)}
          </span>
          {product.distributorPrice && Number(product.distributorPrice) > 0 && (
            <span className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid={`text-distributor-price-${product.id}`}>
              PTS: {formatINR(Number(product.distributorPrice))}
            </span>
          )}
          {caseSize && (
            <span className="text-xs text-muted-foreground/70">1 case = {caseSize} units</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {caseSize && (
            <div className="flex items-center text-xs" data-testid={`toggle-mode-${product.id}`}>
              <button
                className={`px-2 py-0.5 rounded-l border text-xs font-medium transition-colors ${!casesMode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
                onClick={() => handleToggleMode(false)}
                data-testid={`button-units-${product.id}`}
              >
                Units
              </button>
              <button
                className={`px-2 py-0.5 rounded-r border-t border-b border-r text-xs font-medium transition-colors ${casesMode ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border"}`}
                onClick={() => handleToggleMode(true)}
                data-testid={`button-cases-${product.id}`}
              >
                Cases
              </button>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              onClick={() => handleQuantityChange(inputValue - 1)}
              disabled={inputValue <= 1}
              data-testid={`button-qty-minus-${product.id}`}
            >
              <Minus className="w-3 h-3" />
            </Button>
            <Input
              type="number"
              min={1}
              value={inputValue}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
              onFocus={handleFocus}
              className="w-14 h-9 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              data-testid={`input-qty-${product.id}`}
            />
            <Button
              size="icon"
              variant="outline"
              onClick={() => handleQuantityChange(inputValue + 1)}
              data-testid={`button-qty-plus-${product.id}`}
            >
              <Plus className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!hasChanges}
              variant={isInCart && !hasChanges ? "secondary" : "default"}
              data-testid={`button-add-${product.id}`}
            >
              {isInCart && !hasChanges ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  In Cart
                </>
              ) : isInCart ? (
                <>
                  <Check className="w-4 h-4 mr-1" />
                  Update
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </>
              )}
            </Button>
          </div>
          {casesMode && caseSize && (
            <span className="text-xs text-muted-foreground" data-testid={`text-unit-equiv-${product.id}`}>
              = {unitQty} units
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
