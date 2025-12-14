import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  min?: number;
  max?: number;
}

export default function QuantitySelector({ 
  quantity, 
  onQuantityChange, 
  min = 1, 
  max = 999 
}: QuantitySelectorProps) {
  const handleDecrement = () => {
    if (quantity > min) {
      onQuantityChange(quantity - 1);
    }
  };

  const handleIncrement = () => {
    if (quantity < max) {
      onQuantityChange(quantity + 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= min && value <= max) {
      onQuantityChange(value);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon"
        variant="outline"
        onClick={handleDecrement}
        disabled={quantity <= min}
        data-testid="button-decrement"
      >
        <Minus className="w-4 h-4" />
      </Button>
      <Input
        type="number"
        value={quantity}
        onChange={handleInputChange}
        className="w-16 text-center h-9"
        min={min}
        max={max}
        data-testid="input-quantity"
      />
      <Button
        size="icon"
        variant="outline"
        onClick={handleIncrement}
        disabled={quantity >= max}
        data-testid="button-increment"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}
