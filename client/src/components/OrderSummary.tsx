import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Mail, Copy, Check } from "lucide-react";
import { useState } from "react";
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
  onSendWhatsApp: (phone: string) => void;
  onSendEmail: (email: string) => void;
  onCopyMessage: () => void;
}

export default function OrderSummary({ 
  cartItems, 
  discountPercent,
  onDiscountChange,
  orderDetails,
  onOrderDetailsChange,
  onSendWhatsApp, 
  onSendEmail,
  onCopyMessage 
}: OrderSummaryProps) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

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

  const handleCopy = () => {
    onCopyMessage();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasOrderDetails = orderDetails.partyName || orderDetails.brand || orderDetails.deliveryNotes || orderDetails.specialNotes;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">Order Summary</h3>
        <p className="text-sm text-muted-foreground">
          {itemCount} item{itemCount !== 1 ? "s" : ""} in cart
        </p>
      </div>

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

      <div className="space-y-3 pt-4">
        <div className="space-y-2">
          <Label htmlFor="phone">WhatsApp Number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+91 98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12"
            data-testid="input-phone"
          />
        </div>

        <Button
          className="w-full h-12"
          onClick={() => onSendWhatsApp(phone)}
          disabled={cartItems.length === 0}
          data-testid="button-whatsapp"
        >
          <MessageCircle className="w-5 h-5 mr-2" />
          Send via WhatsApp
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleCopy}
          disabled={cartItems.length === 0}
          data-testid="button-copy"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              Copy Order Message
            </>
          )}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="orders@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12"
            data-testid="input-email"
          />
        </div>

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => onSendEmail(email)}
          disabled={cartItems.length === 0}
          data-testid="button-email"
        >
          <Mail className="w-5 h-5 mr-2" />
          Email Spreadsheet
        </Button>
      </div>
    </Card>
  );
}
