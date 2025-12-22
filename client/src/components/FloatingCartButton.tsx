import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FloatingCartButtonProps {
  itemCount: number;
  onClick: () => void;
}

export default function FloatingCartButton({ itemCount, onClick }: FloatingCartButtonProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Button
        size="lg"
        className="rounded-full shadow-lg relative"
        onClick={onClick}
        data-testid="button-floating-cart"
      >
        <ShoppingCart className="h-5 w-5" />
        {itemCount > 0 && (
          <Badge 
            className="absolute -top-2 -right-2 rounded-full px-1.5 text-xs"
            variant="destructive"
            data-testid="badge-cart-count"
          >
            {itemCount > 99 ? "99+" : itemCount}
          </Badge>
        )}
      </Button>
    </div>
  );
}
