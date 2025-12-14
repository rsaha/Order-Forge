import OrderSummary from "../OrderSummary";
import type { CartItemData } from "../CartItem";

// todo: remove mock functionality
const mockCart: CartItemData[] = [
  {
    product: {
      id: "1",
      sku: "ABC-12345",
      name: "Premium Widget Pro",
      brand: "TechBrand",
      price: 29.99,
      stock: 15,
    },
    quantity: 2
  },
  {
    product: {
      id: "2",
      sku: "XYZ-67890",
      name: "Standard Gadget",
      brand: "ProLine",
      price: 15.50,
      stock: 25,
    },
    quantity: 3
  }
];

export default function OrderSummaryExample() {
  return (
    <div className="max-w-sm">
      <OrderSummary
        cartItems={mockCart}
        onSendWhatsApp={(phone) => console.log("WhatsApp:", phone)}
        onSendEmail={(email) => console.log("Email:", email)}
        onCopyMessage={() => console.log("Copied!")}
      />
    </div>
  );
}
