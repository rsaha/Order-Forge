import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Loader2 } from "lucide-react";
import type { CartItemData } from "./CartItem";
import { formatINR } from "./ProductCard";
import OrderDetailsForm, { type OrderDetails } from "./OrderDetailsForm";

export type { OrderDetails };

interface OrderSummaryProps {
  cartItems: CartItemData[];
  discountPercent: number;
  onDiscountChange: (discount: number) => void;
  orderDetails: OrderDetails;
  onOrderDetailsChange: (details: OrderDetails) => void;
  onSendOrder: () => void;
  isSending?: boolean;
}

export default function OrderSummary({ 
  cartItems, 
  discountPercent,
  onDiscountChange,
  orderDetails,
  onOrderDetailsChange,
  onSendOrder,
  isSending = false 
}: OrderSummaryProps) {
  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  const safeDiscount = Math.min(100, Math.max(0, discountPercent));
  const discountAmount = subtotal * (safeDiscount / 100);
  const finalTotal = subtotal - discountAmount;
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    onDiscountChange(Math.min(100, Math.max(0, value)));
  };

  const hasOrderDetails = orderDetails.partyName || orderDetails.brand || orderDetails.deliveryCompany || orderDetails.deliveryNotes || orderDetails.specialNotes;
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

      {hasOrderDetails && (
        <div className="pb-3 border-b">
          <OrderDetailsForm
            orderDetails={orderDetails}
            onOrderDetailsChange={onOrderDetailsChange}
            readOnly
          />
        </div>
      )}

      <div className="space-y-2 py-3 border-b">
        {cartItems.map((item) => (
          <div key={item.product.id} className="flex justify-between text-sm gap-2">
            <span className="text-muted-foreground truncate flex-1">
              {item.product.name} x{item.quantity}
            </span>
            <span className="shrink-0">{formatINR(item.product.price * item.quantity)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span data-testid="text-subtotal">{formatINR(subtotal)}</span>
        </div>
        
        <div className="flex justify-between items-center gap-2">
          <Label htmlFor="discount" className="text-sm text-muted-foreground">Discount %</Label>
          <Input
            id="discount"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={discountPercent}
            onChange={handleDiscountChange}
            className="w-20 h-8 text-right"
            data-testid="input-discount"
          />
        </div>
        
        {discountPercent > 0 && (
          <div className="flex justify-between items-center text-sm text-green-600 dark:text-green-400">
            <span>Discount ({discountPercent}%)</span>
            <span data-testid="text-discount-amount">-{formatINR(discountAmount)}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center text-lg font-semibold pt-2 border-t">
        <span>Total</span>
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
