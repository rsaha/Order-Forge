import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2, Minus, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import OrderSummary, { type OrderDetails } from "./OrderSummary";
import OrderDetailsForm from "./OrderDetailsForm";
import { formatINR, type Product } from "./ProductCard";

export interface CartItemData {
  product: Product;
  quantity: number;
  freeQuantity: number;
}

interface MobileCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItemData[];
  orderDetails: OrderDetails;
  onOrderDetailsChange: (details: OrderDetails) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onFreeQuantityChange: (productId: string, freeQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onSendOrder: () => void;
  isSending?: boolean;
}

function MobileCartItem({ 
  item, 
  onQuantityChange, 
  onFreeQuantityChange,
  onRemove 
}: { 
  item: CartItemData;
  onQuantityChange: (productId: string, quantity: number) => void;
  onFreeQuantityChange: (productId: string, freeQuantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  const subtotal = item.product.price * item.quantity;

  return (
    <div className="p-3 bg-muted/30 rounded-md space-y-3" data-testid={`mobile-cart-item-${item.product.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight" data-testid={`mobile-cart-name-${item.product.id}`}>
            {item.product.name}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {item.product.sku}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatINR(item.product.price)} each
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => onRemove(item.product.id)}
          data-testid={`mobile-button-remove-${item.product.id}`}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Qty:</span>
          <div className="flex items-center border rounded-md">
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-r-none"
              onClick={() => onQuantityChange(item.product.id, Math.max(1, item.quantity - 1))}
              data-testid={`mobile-button-decrease-${item.product.id}`}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <div className="w-12 h-10 flex items-center justify-center text-sm font-medium border-x">
              {item.quantity}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-l-none"
              onClick={() => onQuantityChange(item.product.id, item.quantity + 1)}
              data-testid={`mobile-button-increase-${item.product.id}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Free:</span>
          <div className="flex items-center border rounded-md">
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-r-none"
              onClick={() => onFreeQuantityChange(item.product.id, Math.max(0, item.freeQuantity - 1))}
              data-testid={`mobile-button-decrease-free-${item.product.id}`}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <div className="w-10 h-10 flex items-center justify-center text-sm font-medium border-x">
              {item.freeQuantity}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-l-none"
              onClick={() => onFreeQuantityChange(item.product.id, item.freeQuantity + 1)}
              data-testid={`mobile-button-increase-free-${item.product.id}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      <div className="text-right">
        <span className="font-semibold" data-testid={`mobile-cart-subtotal-${item.product.id}`}>
          {formatINR(subtotal)}
        </span>
      </div>
    </div>
  );
}

export default function MobileCartDrawer({
  isOpen,
  onClose,
  cartItems,
  orderDetails,
  onOrderDetailsChange,
  onQuantityChange,
  onFreeQuantityChange,
  onRemoveItem,
  onClearCart,
  onSendOrder,
  isSending = false
}: MobileCartDrawerProps) {
  const cartBrand = cartItems.length > 0 ? cartItems[0].product.brand : null;
  
  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-center justify-between gap-2">
            <DrawerTitle>Shopping Cart ({cartItems.length})</DrawerTitle>
            {cartItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearCart}
                className="text-destructive"
                data-testid="mobile-button-clear-cart"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </DrawerHeader>
        
        {cartItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
            <p>Your cart is empty</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 max-h-[40vh]">
              <div className="p-4 space-y-3">
                {cartItems.map((item) => (
                  <MobileCartItem
                    key={item.product.id}
                    item={item}
                    onQuantityChange={onQuantityChange}
                    onFreeQuantityChange={onFreeQuantityChange}
                    onRemove={onRemoveItem}
                  />
                ))}
              </div>
            </ScrollArea>
            
            <div className="px-4 pb-2 border-t pt-4">
              <OrderDetailsForm
                orderDetails={orderDetails}
                onOrderDetailsChange={onOrderDetailsChange}
                cartBrand={cartBrand}
              />
            </div>
            
            <DrawerFooter className="border-t bg-muted/30">
              <OrderSummary
                cartItems={cartItems}
                orderDetails={orderDetails}
                onSendOrder={onSendOrder}
                isSending={isSending}
              />
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
