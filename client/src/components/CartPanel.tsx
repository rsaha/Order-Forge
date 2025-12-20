import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import CartItem, { type CartItemData } from "./CartItem";
import OrderSummary, { type OrderDetails } from "./OrderSummary";
import OrderDetailsForm from "./OrderDetailsForm";

interface CartPanelProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItemData[];
  orderDetails: OrderDetails;
  onOrderDetailsChange: (details: OrderDetails) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onSendOrder: () => void;
  isSending?: boolean;
}

export default function CartPanel({
  isOpen,
  onClose,
  cartItems,
  orderDetails,
  onOrderDetailsChange,
  onQuantityChange,
  onRemoveItem,
  onSendOrder,
  isSending = false
}: CartPanelProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>Shopping Cart</SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 flex flex-col overflow-hidden">
          {cartItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-4">
              <p>Your cart is empty</p>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  <div className="space-y-1">
                    {cartItems.map((item) => (
                      <CartItem
                        key={item.product.id}
                        item={item}
                        onQuantityChange={onQuantityChange}
                        onRemove={onRemoveItem}
                      />
                    ))}
                  </div>
                  
                  <OrderDetailsForm
                    orderDetails={orderDetails}
                    onOrderDetailsChange={onOrderDetailsChange}
                  />
                </div>
              </ScrollArea>
              
              <div className="p-4 border-t bg-muted/30">
                <OrderSummary
                  cartItems={cartItems}
                  orderDetails={orderDetails}
                  onSendOrder={onSendOrder}
                  isSending={isSending}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
