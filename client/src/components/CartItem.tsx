import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import QuantitySelector from "./QuantitySelector";
import type { Product } from "./ProductCard";

export interface CartItemData {
  product: Product;
  quantity: number;
}

interface CartItemProps {
  item: CartItemData;
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}

export default function CartItem({ item, onQuantityChange, onRemove }: CartItemProps) {
  const subtotal = item.product.price * item.quantity;

  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate" data-testid={`cart-name-${item.product.id}`}>
          {item.product.name}
        </p>
        <p className="text-sm text-muted-foreground font-mono" data-testid={`cart-sku-${item.product.id}`}>
          {item.product.sku}
        </p>
        <p className="text-sm text-muted-foreground">
          ${item.product.price.toFixed(2)} each
        </p>
      </div>
      <QuantitySelector
        quantity={item.quantity}
        onQuantityChange={(qty) => onQuantityChange(item.product.id, qty)}
        max={item.product.stock}
      />
      <div className="text-right min-w-[80px]">
        <p className="font-semibold" data-testid={`cart-subtotal-${item.product.id}`}>
          ${subtotal.toFixed(2)}
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
