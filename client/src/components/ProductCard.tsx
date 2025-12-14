import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
  const isInStock = product.stock > 0;

  return (
    <Card className="p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
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
        <Badge 
          variant={isInStock ? "secondary" : "destructive"} 
          className="shrink-0"
          data-testid={`badge-stock-${product.id}`}
        >
          {isInStock ? `${product.stock} in stock` : "Out of stock"}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <span className="text-lg font-semibold" data-testid={`text-price-${product.id}`}>
          ${product.price.toFixed(2)}
        </span>
        <Button
          size="sm"
          onClick={() => onAddToCart(product)}
          disabled={!isInStock}
          data-testid={`button-add-${product.id}`}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>
    </Card>
  );
}
