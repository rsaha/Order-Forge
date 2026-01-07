import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Trash2, Minus, Plus, Send, Loader2, ArrowLeft, ChevronRight } from "lucide-react";
import { type OrderDetails } from "./OrderSummary";
import OrderDetailsForm, { type PartyVerificationStatus } from "./OrderDetailsForm";
import { formatINR, type Product } from "./ProductCard";
import type { CartItemData } from "./CartItem";

function getEffectivePrice(product: Product): number {
  if (product.distributorPrice) {
    const dp = Number(product.distributorPrice);
    if (!isNaN(dp) && dp > 0) return dp;
  }
  return product.price;
}

interface MobileCartPageProps {
  cartItems: CartItemData[];
  orderDetails: OrderDetails;
  onOrderDetailsChange: (details: OrderDetails) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onFreeQuantityChange: (productId: string, freeQuantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onSendOrder: () => void;
  onClose: () => void;
  isSending?: boolean;
  partyVerificationStatus?: PartyVerificationStatus;
  onVerifyParty?: (name: string) => void;
  isCustomer?: boolean;
  allowedDeliveryCompanies?: string[];
}

type PageStep = "cart" | "details";

function FullPageCartItem({ 
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
    <Card className="p-4 space-y-4" data-testid={`fullpage-cart-item-${item.product.id}`}>
      <div className="space-y-1">
        <p className="font-medium text-base leading-tight" data-testid={`fullpage-cart-name-${item.product.id}`}>
          {item.product.name}
        </p>
        <p className="text-sm text-muted-foreground font-mono">
          {item.product.sku}
        </p>
        <p className="text-sm text-muted-foreground">
          {item.product.distributorPrice && Number(item.product.distributorPrice) > 0 ? "PTS: " : "MRP: "}{formatINR(effectivePrice)} each
        </p>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Quantity:</span>
          <div className="flex items-center border rounded-md">
            <Button
              size="lg"
              variant="ghost"
              className="rounded-r-none h-12 w-12"
              onClick={() => onQuantityChange(item.product.id, Math.max(0, item.quantity - 1))}
              data-testid={`fullpage-button-decrease-${item.product.id}`}
            >
              <Minus className="w-5 h-5" />
            </Button>
            <Input
              type="number"
              value={item.quantity}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 0) {
                  onQuantityChange(item.product.id, val);
                }
              }}
              onFocus={(e) => e.target.select()}
              className="w-16 h-12 text-center text-lg font-semibold border-0 border-x rounded-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={0}
              data-testid={`fullpage-input-quantity-${item.product.id}`}
            />
            <Button
              size="lg"
              variant="ghost"
              className="rounded-l-none h-12 w-12"
              onClick={() => onQuantityChange(item.product.id, item.quantity + 1)}
              data-testid={`fullpage-button-increase-${item.product.id}`}
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Free:</span>
          <div className="flex items-center border rounded-md">
            <Button
              size="lg"
              variant="ghost"
              className="rounded-r-none h-12 w-12"
              onClick={() => onFreeQuantityChange(item.product.id, Math.max(0, item.freeQuantity - 1))}
              data-testid={`fullpage-button-decrease-free-${item.product.id}`}
            >
              <Minus className="w-5 h-5" />
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
              className="w-16 h-12 text-center text-lg font-semibold border-0 border-x rounded-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={0}
              data-testid={`fullpage-input-free-${item.product.id}`}
            />
            <Button
              size="lg"
              variant="ghost"
              className="rounded-l-none h-12 w-12"
              onClick={() => onFreeQuantityChange(item.product.id, item.freeQuantity + 1)}
              data-testid={`fullpage-button-increase-free-${item.product.id}`}
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-2 border-t">
        <span className="font-semibold text-lg" data-testid={`fullpage-cart-subtotal-${item.product.id}`}>
          {formatINR(subtotal)}
        </span>
        <Button
          size="lg"
          variant="ghost"
          className="text-destructive h-12"
          onClick={() => onRemove(item.product.id)}
          data-testid={`fullpage-button-remove-${item.product.id}`}
        >
          <Trash2 className="w-5 h-5 mr-2" />
          Remove
        </Button>
      </div>
    </Card>
  );
}

export default function MobileCartPage({
  cartItems,
  orderDetails,
  onOrderDetailsChange,
  onQuantityChange,
  onFreeQuantityChange,
  onRemoveItem,
  onClearCart,
  onSendOrder,
  onClose,
  isSending = false,
  partyVerificationStatus = "idle",
  onVerifyParty,
  isCustomer = false,
  allowedDeliveryCompanies,
}: MobileCartPageProps) {
  const [step, setStep] = useState<PageStep>("cart");

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
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity + (item.freeQuantity || 0), 0);
  const isElmericBrand = cartBrand === "Elmeric";
  // Allow order when: Customer role (no verification), Elmeric brand (no verification needed), verified, or verification service failed (error)
  const canSendOrder = cartItems.length > 0 && orderDetails.partyName.trim() !== "" && (isCustomer || isElmericBrand || partyVerificationStatus === "verified" || partyVerificationStatus === "error");

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="fullpage-cart">
      {step === "cart" ? (
        <>
          <header className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                data-testid="fullpage-button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="font-semibold text-lg">Cart ({itemCount})</h1>
            </div>
            {cartItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearCart}
                className="text-destructive"
                data-testid="fullpage-button-clear-cart"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </header>
          
          {cartItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-8">
              <p className="text-lg">Your cart is empty</p>
            </div>
          ) : (
            <>
              <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
                {cartItems.map((item) => (
                  <FullPageCartItem
                    key={item.product.id}
                    item={item}
                    onQuantityChange={onQuantityChange}
                    onFreeQuantityChange={onFreeQuantityChange}
                    onRemove={onRemoveItem}
                  />
                ))}
              </main>
              
              <footer className="sticky bottom-0 bg-background border-t p-4 space-y-3">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <div>
                    <span>Total</span>
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                      ({allHavePTS ? "PTS" : "MRP"})
                    </span>
                  </div>
                  <span data-testid="fullpage-text-total">{formatINR(subtotal)}</span>
                </div>
                
                <Button
                  className="w-full h-14 text-lg"
                  onClick={() => setStep("details")}
                  disabled={cartItems.length === 0}
                  data-testid="fullpage-button-add-order-details"
                >
                  Add Order Details
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </footer>
            </>
          )}
        </>
      ) : (
        <>
          <header className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setStep("cart")}
              data-testid="fullpage-button-back-to-cart"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-semibold text-lg">Order Details</h1>
          </header>
          
          <main className="flex-1 overflow-y-auto p-4 pb-48">
            <OrderDetailsForm
              orderDetails={orderDetails}
              onOrderDetailsChange={onOrderDetailsChange}
              cartBrand={cartBrand}
              partyVerificationStatus={partyVerificationStatus}
              onVerifyParty={onVerifyParty}
              isCustomer={isCustomer}
              allowedDeliveryCompanies={allowedDeliveryCompanies}
            />
          </main>
          
          <footer className="sticky bottom-0 bg-background border-t p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">{itemCount} items</span>
              <span data-testid="fullpage-text-subtotal">{formatINR(subtotal)}</span>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between items-center text-sm text-green-600 dark:text-green-400">
                <span>Discount ({discountPercent}%)</span>
                <span>-{formatINR(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-lg font-semibold border-t pt-2">
              <span>Total</span>
              <span data-testid="fullpage-text-final-total">{formatINR(finalTotal)}</span>
            </div>
            
            {!orderDetails.partyName.trim() && (
              <p className="text-sm text-destructive">Party name required</p>
            )}
            {orderDetails.partyName.trim() && !isElmericBrand && partyVerificationStatus !== "verified" && (
              <p className="text-sm text-destructive">Party must be verified before submitting</p>
            )}
            
            <Button
              className="w-full h-14 text-lg"
              onClick={onSendOrder}
              disabled={!canSendOrder || isSending}
              data-testid="fullpage-button-send-order"
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
          </footer>
        </>
      )}
    </div>
  );
}
