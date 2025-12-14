import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: number;
  stock: number;
  category?: string;
}

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export default function ProductCard({ product, onAddToCart }: ProductCardProps) {
  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm text-muted-foreground truncate" data-testid={`text-sku-${product.id}`}>
          {product.sku}
        </p>
        <h3 className="font-medium text-base truncate" data-testid={`text-name-${product.id}`}>
          {product.name}
        </h3>
        <p className="text-sm text-muted-foreground" data-testid={`text-brand-${product.id}`}>
          {product.brand}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <span className="text-lg font-semibold" data-testid={`text-price-${product.id}`}>
          {formatINR(product.price)}
        </span>
        <Button
          size="sm"
          onClick={() => onAddToCart(product)}
          data-testid={`button-add-${product.id}`}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>
    </Card>
  );
}
