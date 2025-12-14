import { useState } from "react";
import QuantitySelector from "../QuantitySelector";

export default function QuantitySelectorExample() {
  const [quantity, setQuantity] = useState(1);
  
  return (
    <QuantitySelector 
      quantity={quantity} 
      onQuantityChange={setQuantity} 
    />
  );
}
