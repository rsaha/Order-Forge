import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import type { CartItemData } from "./CartItem";
import { formatINR, type Product } from "./ProductCard";
import { type OrderDetails } from "./OrderDetailsForm";

export type { OrderDetails };

function getEffectivePrice(product: Product): number {
  if (product.distributorPrice) {
    const dp = Number(product.distributorPrice);
    if (!isNaN(dp) && dp > 0) return dp;
  }
  return product.price;
}

interface OrderSummaryProps {
  cartItems: CartItemData[];
  orderDetails: OrderDetails;
  onSendOrder: () => void;
  isSending?: boolean;
}

export default function OrderSummary({ 
  cartItems, 
  orderDetails,
  onSendOrder,
  isSending = false 
}: OrderSummaryProps) {
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
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const canSendOrder = cartItems.length > 0 && orderDetails.partyName.trim() !== "";

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">Order Summary</h3>
        <p className="text-sm text-muted-foreground">
          {itemCount} item{itemCount !== 1 ? "s" : ""} in cart
        </p>
      </div>

      {!orderDetails.partyName.trim() && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">Party name is required to send order</p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span data-testid="text-subtotal">{formatINR(subtotal)}</span>
        </div>
        
        {discountPercent > 0 && (
          <div className="flex justify-between items-center text-sm text-green-600 dark:text-green-400">
            <span>Discount ({discountPercent}%)</span>
            <span data-testid="text-discount-amount">-{formatINR(discountAmount)}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center text-lg font-semibold pt-2 border-t">
        <div>
          <span>Total</span>
          <span className="text-xs text-muted-foreground font-normal ml-1">
            ({allHavePTS ? "PTS" : "MRP"})
          </span>
        </div>
        <span data-testid="text-total">{formatINR(finalTotal)}</span>
      </div>

      <div className="pt-4">
        <Button
          className="w-full h-12"
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
    </Card>
  );
}
