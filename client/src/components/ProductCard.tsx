import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Minus, Check } from "lucide-react";

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
  category?: string;
}

interface ProductCardProps {
  product: Product;
  cartQuantity?: number;
  onAddToCart: (product: Product, quantity: number) => void;
}

export default function ProductCard({ product, cartQuantity, onAddToCart }: ProductCardProps) {
  const isInCart = cartQuantity !== undefined && cartQuantity > 0;
  const [quantity, setQuantity] = useState(isInCart ? cartQuantity : 1);

  useEffect(() => {
    if (cartQuantity !== undefined && cartQuantity > 0) {
      setQuantity(cartQuantity);
    }
  }, [cartQuantity]);

  const handleQuantityChange = (value: number) => {
    const newQty = Math.max(1, Math.min(value, 9999));
    setQuantity(newQty);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleAdd = () => {
    onAddToCart(product, quantity);
  };

  const hasChanges = !isInCart || quantity !== cartQuantity;

  return (
    <Card className="p-4 flex flex-col gap-2">
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
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={() => handleQuantityChange(quantity - 1)}
            disabled={quantity <= 1}
            data-testid={`button-qty-minus-${product.id}`}
          >
            <Minus className="w-3 h-3" />
          </Button>
          <Input
            type="number"
            min={1}
            max={9999}
            value={quantity}
            onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
            onFocus={handleFocus}
            className="w-14 h-9 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            data-testid={`input-qty-${product.id}`}
          />
          <Button
            size="icon"
            variant="outline"
            onClick={() => handleQuantityChange(quantity + 1)}
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
      </div>
    </Card>
  );
}
