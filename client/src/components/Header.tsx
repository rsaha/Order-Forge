import { Button } from "@/components/ui/button";
import { ShoppingCart, Upload, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  cartItemCount: number;
  activeTab: "products" | "upload";
  onTabChange: (tab: "products" | "upload") => void;
  onCartClick: () => void;
}

export default function Header({ 
  cartItemCount, 
  activeTab, 
  onTabChange,
  onCartClick 
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-background border-b">
      <div className="flex items-center justify-between gap-4 px-4 h-16">
        <div className="flex items-center gap-2">
          <Package className="w-6 h-6 text-primary" />
          <h1 className="font-semibold text-lg hidden sm:block">Order Entry</h1>
        </div>

        <nav className="flex gap-1">
          <Button
            variant={activeTab === "products" ? "default" : "ghost"}
            size="sm"
            onClick={() => onTabChange("products")}
            data-testid="tab-products"
          >
            <Package className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Products</span>
          </Button>
          <Button
            variant={activeTab === "upload" ? "default" : "ghost"}
            size="sm"
            onClick={() => onTabChange("upload")}
            data-testid="tab-upload"
          >
            <Upload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
        </nav>

        <Button
          variant="outline"
          size="icon"
          className="relative"
          onClick={onCartClick}
          data-testid="button-cart"
        >
          <ShoppingCart className="w-5 h-5" />
          {cartItemCount > 0 && (
            <Badge 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
              data-testid="badge-cart-count"
            >
              {cartItemCount}
            </Badge>
          )}
        </Button>
      </div>
    </header>
  );
}
