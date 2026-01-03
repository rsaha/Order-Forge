import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Minus, Plus, X, Send, Loader2, ArrowLeft, ChevronRight } from "lucide-react";
import { type CartItemData } from "./CartItem";
import { type OrderDetails } from "./OrderSummary";
import OrderDetailsForm, { type PartyVerificationStatus } from "./OrderDetailsForm";
import { formatINR, type Product } from "./ProductCard";

function getEffectivePrice(product: Product): number {
  if (product.distributorPrice) {
    const dp = Number(product.distributorPrice);
    if (!isNaN(dp) && dp > 0) return dp;
  }
  return product.price;
}

interface CartPanelProps {
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
  partyVerificationStatus?: PartyVerificationStatus;
  onVerifyParty?: (name: string) => void;
}

type PanelStep = "cart" | "details";

function CartPanelItem({ 
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
    <div className="p-3 bg-muted/30 rounded-md space-y-3" data-testid={`cart-item-${item.product.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight" data-testid={`cart-name-${item.product.id}`}>
            {item.product.name}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {item.product.sku}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatINR(effectivePrice)} each
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          onClick={() => onRemove(item.product.id)}
          data-testid={`button-remove-${item.product.id}`}
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
              data-testid={`button-decrease-${item.product.id}`}
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
              data-testid={`input-quantity-${item.product.id}`}
            />
            <Button
              size="icon"
              variant="ghost"
              className="rounded-l-none"
              onClick={() => onQuantityChange(item.product.id, item.quantity + 1)}
              data-testid={`button-increase-${item.product.id}`}
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
              data-testid={`button-decrease-free-${item.product.id}`}
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
              data-testid={`input-free-${item.product.id}`}
            />
            <Button
              size="icon"
              variant="ghost"
              className="rounded-l-none"
              onClick={() => onFreeQuantityChange(item.product.id, item.freeQuantity + 1)}
              data-testid={`button-increase-free-${item.product.id}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      <div className="text-right">
        <span className="font-semibold" data-testid={`cart-subtotal-${item.product.id}`}>
          {formatINR(subtotal)}
        </span>
      </div>
    </div>
  );
}

export default function CartPanel({
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
  isSending = false,
  partyVerificationStatus = "idle",
  onVerifyParty,
}: CartPanelProps) {
  const [step, setStep] = useState<PanelStep>("cart");
  
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
  
  // Check if all cart items have PTS (distributorPrice)
  const allHavePTS = cartItems.length > 0 && cartItems.every(item => {
    const dp = item.product.distributorPrice;
    return dp != null && Number(dp) > 0;
  });
  
  const discountPercent = orderDetails.proposedDiscount || 0;
  const safeDiscount = Math.min(100, Math.max(0, discountPercent));
  const discountAmount = subtotal * (safeDiscount / 100);
  const finalTotal = subtotal - discountAmount;
  const itemCount = cartItems.length;
  const totalUnits = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const isElmericBrand = cartBrand === "Elmeric";
  // Allow order when: Elmeric brand (no verification needed), verified, or verification service failed (error)
  const canSendOrder = cartItems.length > 0 && orderDetails.partyName.trim() !== "" && (isElmericBrand || partyVerificationStatus === "verified" || partyVerificationStatus === "error");

  const handleClose = () => {
    setStep("cart");
    onClose();
  };
  
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        {step === "cart" ? (
          <>
            <SheetHeader className="p-4 border-b flex-none">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle>Cart ({itemCount} items)</SheetTitle>
                {cartItems.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearCart}
                    className="text-destructive"
                    data-testid="button-clear-cart"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </SheetHeader>
            
            <div className="flex-1 flex flex-col overflow-hidden">
              {cartItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
                  <p>Your cart is empty</p>
                </div>
              ) : (
                <>
                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-3">
                      {cartItems.map((item) => (
                        <CartPanelItem
                          key={item.product.id}
                          item={item}
                          onQuantityChange={onQuantityChange}
                          onFreeQuantityChange={onFreeQuantityChange}
                          onRemove={onRemoveItem}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                  
                  <div className="p-4 border-t bg-muted/30 space-y-3 flex-none">
                    <div className="flex justify-between items-center text-lg font-semibold">
                      <div>
                        <span>Total</span>
                        <span className="text-xs text-muted-foreground font-normal ml-1">
                          ({allHavePTS ? "PTS" : "MRP"})
                        </span>
                      </div>
                      <span data-testid="text-cart-total">{formatINR(subtotal)}</span>
                    </div>
                    
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => setStep("details")}
                      disabled={cartItems.length === 0}
                      data-testid="button-add-order-details"
                    >
                      Add Order Details
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <SheetHeader className="p-4 border-b flex-none">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStep("cart")}
                  data-testid="button-back-to-cart"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <SheetTitle>Order Details</SheetTitle>
              </div>
            </SheetHeader>
            
            <div className="flex-1 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="p-4">
                  <OrderDetailsForm
                    orderDetails={orderDetails}
                    onOrderDetailsChange={onOrderDetailsChange}
                    cartBrand={cartBrand}
                    partyVerificationStatus={partyVerificationStatus}
                    onVerifyParty={onVerifyParty}
                  />
                </div>
              </ScrollArea>
              
              <div className="p-4 border-t bg-muted/30 space-y-3 flex-none">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{itemCount} items ({totalUnits} units)</span>
                  <span data-testid="text-subtotal">{formatINR(subtotal)}</span>
                </div>
                {discountPercent > 0 && (
                  <div className="flex justify-between items-center text-sm text-green-600 dark:text-green-400">
                    <span>Discount ({discountPercent}%)</span>
                    <span>-{formatINR(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-lg font-semibold border-t pt-2">
                  <span>Total</span>
                  <span data-testid="text-final-total">{formatINR(finalTotal)}</span>
                </div>
                
                {!orderDetails.partyName.trim() && (
                  <p className="text-sm text-destructive">Party name required</p>
                )}
                {orderDetails.partyName.trim() && !isElmericBrand && partyVerificationStatus !== "verified" && (
                  <p className="text-sm text-destructive">Party must be verified before submitting</p>
                )}
                
                <Button
                  className="w-full"
                  size="lg"
                  onClick={onSendOrder}
                  disabled={!canSendOrder || isSending}
                  data-testid="button-send-order"
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
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
