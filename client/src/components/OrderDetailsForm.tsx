import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Search, AlertTriangle } from "lucide-react";

export interface OrderDetails {
  partyName: string;
  deliveryCompany: string;
  deliveryNotes: string;
  specialNotes: string;
  proposedDiscount: number;
}

export type PartyVerificationStatus = "idle" | "verifying" | "verified" | "not_found" | "error";

interface OrderDetailsFormProps {
  orderDetails: OrderDetails;
  onOrderDetailsChange: (details: OrderDetails) => void;
  readOnly?: boolean;
  cartBrand?: string | null;
  partyVerificationStatus?: PartyVerificationStatus;
  onVerifyParty?: (name: string) => void;
  isCustomer?: boolean;
  allowedDeliveryCompanies?: string[];
}

const DELIVERY_COMPANY_OPTIONS = ["Guided", "Xmaple", "Elmeric"];

function getDeliveryOptionsForBrand(brand: string | null | undefined): string[] {
  if (brand === "Biostige") {
    return ["Guided"];
  }
  if (brand === "Elmeric") {
    return ["Elmeric", "Guided"];
  }
  if (brand === "Morison") {
    return ["Xmaple", "Elmeric"];
  }
  return DELIVERY_COMPANY_OPTIONS;
}

export default function OrderDetailsForm({
  orderDetails,
  onOrderDetailsChange,
  readOnly = false,
  cartBrand,
  partyVerificationStatus = "idle",
  onVerifyParty,
  isCustomer = false,
  allowedDeliveryCompanies,
}: OrderDetailsFormProps) {
  // For Customers, use their allowed delivery companies, otherwise use brand-based options
  const brandDeliveryOptions = getDeliveryOptionsForBrand(cartBrand);
  const deliveryOptions = isCustomer && allowedDeliveryCompanies && allowedDeliveryCompanies.length > 0
    ? brandDeliveryOptions.filter(dc => allowedDeliveryCompanies.includes(dc))
    : brandDeliveryOptions;
  
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
          <div className="flex gap-2">
            <Input
              id="partyName"
              placeholder="Customer/Party name"
              value={orderDetails.partyName}
              onChange={(e) => updateOrderDetail("partyName", e.target.value)}
              className="h-10 flex-1"
              data-testid="input-party-name"
              disabled={isCustomer}
            />
            {onVerifyParty && !isCustomer && (
              <Button
                type="button"
                variant="outline"
                onClick={() => onVerifyParty(orderDetails.partyName)}
                disabled={!orderDetails.partyName.trim() || partyVerificationStatus === "verifying"}
                data-testid="button-verify-party"
              >
                {partyVerificationStatus === "verifying" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span className="ml-1">Verify</span>
              </Button>
            )}
          </div>
          {partyVerificationStatus === "verified" && (
            <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400" data-testid="text-party-verified">
              <CheckCircle className="w-4 h-4" />
              <span>Verified</span>
            </div>
          )}
          {partyVerificationStatus === "not_found" && (
            <div className="space-y-1 text-sm text-destructive" data-testid="text-party-not-found">
              <div className="flex items-center gap-1.5">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span>Party name didn't match.</span>
              </div>
              <p className="text-muted-foreground ml-5">
                Contact Surojit to add the party and then submit the order.
              </p>
            </div>
          )}
          {partyVerificationStatus === "error" && (
            <div className="space-y-1 text-sm text-amber-600 dark:text-amber-400" data-testid="text-party-verify-error">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Could not verify party name.</span>
              </div>
              <p className="text-muted-foreground ml-5">
                Verification service unavailable. You can still submit the order.
              </p>
            </div>
          )}
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

        {!isCustomer && (
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
        )}

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

        {!isCustomer && (
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
        )}
      </div>
    </Card>
  );
}
