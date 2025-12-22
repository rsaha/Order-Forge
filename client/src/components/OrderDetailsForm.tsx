import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

export interface OrderDetails {
  partyName: string;
  deliveryCompany: string;
  deliveryNotes: string;
  specialNotes: string;
  proposedDiscount: number;
}

interface OrderDetailsFormProps {
  orderDetails: OrderDetails;
  onOrderDetailsChange: (details: OrderDetails) => void;
  readOnly?: boolean;
  cartBrand?: string | null;
}

const DELIVERY_COMPANY_OPTIONS = ["Guided", "Xmaple", "Elemric"];

function getDeliveryOptionsForBrand(brand: string | null | undefined): string[] {
  if (brand === "Biostige") {
    return ["Guided"];
  }
  if (brand === "Elmeric") {
    return ["Elemric"];
  }
  return DELIVERY_COMPANY_OPTIONS;
}

export default function OrderDetailsForm({
  orderDetails,
  onOrderDetailsChange,
  readOnly = false,
  cartBrand,
}: OrderDetailsFormProps) {
  const deliveryOptions = getDeliveryOptionsForBrand(cartBrand);
  
  const updateOrderDetail = (field: keyof OrderDetails, value: string) => {
    onOrderDetailsChange({ ...orderDetails, [field]: value });
  };
  
  // Auto-set delivery company when brand changes and current selection is not valid
  if (cartBrand && deliveryOptions.length === 1 && orderDetails.deliveryCompany !== deliveryOptions[0]) {
    onOrderDetailsChange({ ...orderDetails, deliveryCompany: deliveryOptions[0] });
  } else if (cartBrand && !deliveryOptions.includes(orderDetails.deliveryCompany) && orderDetails.deliveryCompany) {
    onOrderDetailsChange({ ...orderDetails, deliveryCompany: deliveryOptions[0] });
  }

  if (readOnly) {
    const hasDetails = orderDetails.partyName || orderDetails.deliveryCompany || orderDetails.deliveryNotes || orderDetails.specialNotes || orderDetails.proposedDiscount > 0;
    
    if (!hasDetails) {
      return null;
    }

    return (
      <div className="space-y-2 text-sm">
        {orderDetails.partyName && (
          <div className="flex gap-2">
            <span className="text-muted-foreground">Party:</span>
            <span data-testid="text-party-name">{orderDetails.partyName}</span>
          </div>
        )}
        {orderDetails.deliveryCompany && (
          <div className="flex gap-2">
            <span className="text-muted-foreground">Delivery Company:</span>
            <span data-testid="text-delivery-company">{orderDetails.deliveryCompany}</span>
          </div>
        )}
        {orderDetails.proposedDiscount > 0 && (
          <div className="flex gap-2">
            <span className="text-muted-foreground">Proposed Discount:</span>
            <span data-testid="text-proposed-discount">{orderDetails.proposedDiscount}%</span>
          </div>
        )}
        {orderDetails.deliveryNotes && (
          <div className="flex gap-2">
            <span className="text-muted-foreground">Delivery Notes:</span>
            <span data-testid="text-delivery-notes" className="text-muted-foreground">{orderDetails.deliveryNotes}</span>
          </div>
        )}
        {orderDetails.specialNotes && (
          <div className="flex gap-2">
            <span className="text-muted-foreground">Notes:</span>
            <span data-testid="text-special-notes" className="text-muted-foreground">{orderDetails.specialNotes}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold text-lg">Order Details</h3>
      
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="partyName">Party Name</Label>
          <Input
            id="partyName"
            placeholder="Customer/Party name"
            value={orderDetails.partyName}
            onChange={(e) => updateOrderDetail("partyName", e.target.value)}
            className="h-10"
            data-testid="input-party-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deliveryCompany">Delivery Company</Label>
          <Select
            value={orderDetails.deliveryCompany}
            onValueChange={(value) => updateOrderDetail("deliveryCompany", value)}
          >
            <SelectTrigger id="deliveryCompany" className="h-10" data-testid="select-delivery-company">
              <SelectValue placeholder="Select delivery company" />
            </SelectTrigger>
            <SelectContent>
              {deliveryOptions.map((company) => (
                <SelectItem key={company} value={company} data-testid={`option-delivery-${company.toLowerCase()}`}>
                  {company}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proposedDiscount">Proposed Discount % (Optional)</Label>
          <Input
            id="proposedDiscount"
            type="number"
            min="0"
            max="100"
            step="0.5"
            placeholder="0"
            value={orderDetails.proposedDiscount === 0 ? "0" : orderDetails.proposedDiscount || ""}
            onChange={(e) => {
              const value = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
              onOrderDetailsChange({ ...orderDetails, proposedDiscount: value });
            }}
            className="h-10"
            data-testid="input-proposed-discount"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deliveryNotes">Delivery Notes (Optional)</Label>
          <Textarea
            id="deliveryNotes"
            placeholder="Delivery instructions..."
            value={orderDetails.deliveryNotes}
            onChange={(e) => updateOrderDetail("deliveryNotes", e.target.value)}
            className="min-h-[60px] resize-none"
            data-testid="input-delivery-notes"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="specialNotes">Special Notes (Optional)</Label>
          <Textarea
            id="specialNotes"
            placeholder="Any special requirements..."
            value={orderDetails.specialNotes}
            onChange={(e) => updateOrderDetail("specialNotes", e.target.value)}
            className="min-h-[60px] resize-none"
            data-testid="input-special-notes"
          />
        </div>
      </div>
    </Card>
  );
}
