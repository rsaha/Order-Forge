import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Minus, Plus, X, Send, Loader2, ArrowLeft, ChevronRight } from "lucide-react";
import { type OrderDetails } from "./OrderSummary";
import OrderDetailsForm from "./OrderDetailsForm";
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

type DrawerStep = "cart" | "details";

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
  const effectivePrice = getEffectivePrice(item.product);
  const subtotal = effectivePrice * item.quantity;

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
            {item.product.distributorPrice && Number(item.product.distributorPrice) > 0 ? "PTS: " : ""}{formatINR(effectivePrice)} each
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
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
              className="rounded-r-none"
              onClick={() => onQuantityChange(item.product.id, Math.max(1, item.quantity - 1))}
              data-testid={`mobile-button-decrease-${item.product.id}`}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Input
              type="number"
              value={item.quantity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) {
                  onQuantityChange(item.product.id, val);
                }
              }}
              onFocus={(e) => e.target.select()}
              className="w-14 h-9 text-center text-sm font-medium border-0 border-x rounded-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={1}
              data-testid={`mobile-input-quantity-${item.product.id}`}
            />
            <Button
              size="icon"
              variant="ghost"
              className="rounded-l-none"
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
              className="rounded-r-none"
              onClick={() => onFreeQuantityChange(item.product.id, Math.max(0, item.freeQuantity - 1))}
              data-testid={`mobile-button-decrease-free-${item.product.id}`}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Input
              type="number"
              value={item.freeQuantity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 0) {
                  onFreeQuantityChange(item.product.id, val);
                }
              }}
              onFocus={(e) => e.target.select()}
              className="w-12 h-9 text-center text-sm font-medium border-0 border-x rounded-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={0}
              data-testid={`mobile-input-free-${item.product.id}`}
            />
            <Button
              size="icon"
              variant="ghost"
              className="rounded-l-none"
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
  const [step, setStep] = useState<DrawerStep>("cart");
  
  useEffect(() => {
    if (!isOpen) {
      setStep("cart");
    }
  }, [isOpen]);

  const cartBrand = cartItems.length > 0 ? cartItems[0].product.brand : null;
  
  const subtotal = cartItems.reduce(
    (sum, item) => sum + getEffectivePrice(item.product) * item.quantity,
    0
  );
  const discountPercent = orderDetails.proposedDiscount || 0;
  const safeDiscount = Math.min(100, Math.max(0, discountPercent));
  const discountAmount = subtotal * (safeDiscount / 100);
  const finalTotal = subtotal - discountAmount;
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const canSendOrder = cartItems.length > 0 && orderDetails.partyName.trim() !== "";

  const handleClose = () => {
    setStep("cart");
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DrawerContent className="max-h-[85vh] overflow-hidden">
        <div className="flex flex-col w-full h-full overflow-hidden">
        {step === "cart" ? (
          <>
            <DrawerHeader className="flex-none border-b pb-3">
              <div className="flex items-center justify-between gap-2">
                <DrawerTitle>Cart ({itemCount} items)</DrawerTitle>
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
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
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
                </div>
                
                <DrawerFooter className="flex-none border-t pt-3 pb-6 space-y-3">
                  <div className="flex justify-between items-center text-lg font-semibold">
                    <span>Total</span>
                    <span data-testid="mobile-text-total">{formatINR(subtotal)}</span>
                  </div>
                  
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setStep("details")}
                    disabled={cartItems.length === 0}
                    data-testid="mobile-button-add-order-details"
                  >
                    Add Order Details
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </Button>
                </DrawerFooter>
              </>
            )}
          </>
        ) : (
          <>
            <DrawerHeader className="flex-none border-b pb-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStep("cart")}
                  data-testid="mobile-button-back-to-cart"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <DrawerTitle>Order Details</DrawerTitle>
              </div>
            </DrawerHeader>
            
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
              <div className="p-4">
                <OrderDetailsForm
                  orderDetails={orderDetails}
                  onOrderDetailsChange={onOrderDetailsChange}
                  cartBrand={cartBrand}
                />
              </div>
            </div>
            
            <DrawerFooter className="flex-none border-t pt-3 pb-6 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{itemCount} items</span>
                <span data-testid="mobile-text-subtotal">{formatINR(subtotal)}</span>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between items-center text-sm text-green-600 dark:text-green-400">
                  <span>Discount ({discountPercent}%)</span>
                  <span>-{formatINR(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-lg font-semibold border-t pt-2">
                <span>Total</span>
                <span data-testid="mobile-text-final-total">{formatINR(finalTotal)}</span>
              </div>
              
              {!orderDetails.partyName.trim() && (
                <p className="text-sm text-destructive">Party name required</p>
              )}
              
              <Button
                className="w-full"
                size="lg"
                onClick={onSendOrder}
                disabled={!canSendOrder || isSending}
                data-testid="mobile-button-send-order"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Send Order
                  </>
                )}
              </Button>
            </DrawerFooter>
          </>
        )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
