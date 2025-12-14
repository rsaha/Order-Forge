import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Mail, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { CartItemData } from "./CartItem";

interface OrderSummaryProps {
  cartItems: CartItemData[];
  onSendWhatsApp: (phone: string) => void;
  onSendEmail: (email: string) => void;
  onCopyMessage: () => void;
}

export default function OrderSummary({ 
  cartItems, 
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
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleCopy = () => {
    onCopyMessage();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">Order Summary</h3>
        <p className="text-sm text-muted-foreground">
          {itemCount} item{itemCount !== 1 ? "s" : ""} in cart
        </p>
      </div>

      <div className="space-y-2 py-4 border-y">
        {cartItems.map((item) => (
          <div key={item.product.id} className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {item.product.name} x{item.quantity}
            </span>
            <span>${(item.product.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center text-lg font-semibold">
        <span>Total</span>
        <span data-testid="text-total">${subtotal.toFixed(2)}</span>
      </div>

      <div className="space-y-3 pt-4">
        <div className="space-y-2">
          <Label htmlFor="phone">WhatsApp Number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 234 567 8900"
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
