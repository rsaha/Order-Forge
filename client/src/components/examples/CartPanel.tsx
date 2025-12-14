import { useState } from "react";
import CartPanel from "../CartPanel";
import { Button } from "@/components/ui/button";
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

export default function CartPanelExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [cart, setCart] = useState(mockCart);
  
  return (
    <div>
      <Button onClick={() => setIsOpen(true)}>Open Cart</Button>
      <CartPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        cartItems={cart}
        onQuantityChange={(id, qty) => {
          setCart(cart.map(item => 
            item.product.id === id ? { ...item, quantity: qty } : item
          ));
        }}
        onRemoveItem={(id) => setCart(cart.filter(item => item.product.id !== id))}
        onSendWhatsApp={(phone) => console.log("WhatsApp:", phone)}
        onSendEmail={(email) => console.log("Email:", email)}
        onCopyMessage={() => console.log("Copied!")}
      />
    </div>
  );
}
