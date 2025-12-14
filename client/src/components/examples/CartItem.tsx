import { useState } from "react";
import CartItem, { type CartItemData } from "../CartItem";

// todo: remove mock functionality
const mockItem: CartItemData = {
  product: {
    id: "1",
    sku: "ABC-12345",
    name: "Premium Widget Pro",
    brand: "TechBrand",
    price: 29.99,
    stock: 15,
  },
  quantity: 2
};

export default function CartItemExample() {
  const [item, setItem] = useState(mockItem);
  
  return (
    <div className="max-w-lg">
      <CartItem 
        item={item}
        onQuantityChange={(_, qty) => setItem({ ...item, quantity: qty })}
        onRemove={(id) => console.log("Remove item:", id)}
      />
    </div>
  );
}
