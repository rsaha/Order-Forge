import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import QuantitySelector from "./QuantitySelector";
import { formatINR, type Product } from "./ProductCard";

function getEffectivePrice(product: Product): number {
  if (product.distributorPrice) {
    const dp = Number(product.distributorPrice);
    if (!isNaN(dp) && dp > 0) return dp;
  }
  return product.price;
}

export interface CartItemData {
  product: Product;
  quantity: number;
  freeQuantity: number;
}

interface CartItemProps {
  item: CartItemData;
  onQuantityChange: (productId: string, quantity: number) => void;
  onFreeQuantityChange: (productId: string, freeQuantity: number) => void;
  onRemove: (productId: string) => void;
}

export default function CartItem({ item, onQuantityChange, onFreeQuantityChange, onRemove }: CartItemProps) {
  const effectivePrice = getEffectivePrice(item.product);
  const subtotal = effectivePrice * item.quantity;

  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium break-words whitespace-normal leading-tight" data-testid={`cart-name-${item.product.id}`}>
          {item.product.name}
        </p>
        <p className="text-sm text-muted-foreground font-mono" data-testid={`cart-sku-${item.product.id}`}>
          {item.product.sku}
        </p>
        <p className="text-sm text-muted-foreground">
          {item.product.distributorPrice && Number(item.product.distributorPrice) > 0 ? "PTS: " : ""}{formatINR(effectivePrice)} each
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <QuantitySelector
          quantity={item.quantity}
          onQuantityChange={(qty) => onQuantityChange(item.product.id, qty)}
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Free:</span>
          <Input
            type="number"
            min={0}
            value={item.freeQuantity}
            onChange={(e) => onFreeQuantityChange(item.product.id, Math.max(0, parseInt(e.target.value) || 0))}
            className="w-14 h-7 text-center text-sm"
            data-testid={`input-free-qty-${item.product.id}`}
          />
        </div>
      </div>
      <div className="text-right min-w-[70px]">
        <p className="font-semibold" data-testid={`cart-subtotal-${item.product.id}`}>
          {formatINR(subtotal)}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => onRemove(item.product.id)}
        data-testid={`button-remove-${item.product.id}`}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
