import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, FileText, ClipboardList, ListOrdered, Users, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface HeaderProps {
  cartItemCount: number;
  activeTab?: "products" | "order" | "import";
  onTabChange?: (tab: "products" | "order" | "import") => void;
  onCartClick: () => void;
  isAdmin?: boolean;
  isBrandAdmin?: boolean;
  showTabs?: boolean;
}

export default function Header({ 
  cartItemCount, 
  activeTab, 
  onTabChange,
  onCartClick,
  isAdmin = false,
  isBrandAdmin = false,
  showTabs = true,
}: HeaderProps) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="font-semibold text-lg hidden sm:block">Order Entry</h1>
      </div>

      <nav className="flex gap-1">
        {showTabs && (
          <>
            {onTabChange ? (
              <Button
                variant={activeTab === "order" ? "default" : "ghost"}
                size="sm"
                onClick={() => onTabChange("order")}
                data-testid="tab-order"
              >
                <ClipboardList className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Order</span>
              </Button>
            ) : (
              <Link href="/?tab=order">
                <Button variant="ghost" size="sm" data-testid="tab-order">
                  <ClipboardList className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Order</span>
                </Button>
              </Link>
            )}
            {onTabChange ? (
              <Button
                variant={activeTab === "import" ? "default" : "ghost"}
                size="sm"
                onClick={() => onTabChange("import")}
                data-testid="tab-import"
              >
                <FileText className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Import</span>
              </Button>
            ) : (
              <Link href="/?tab=import">
                <Button variant="ghost" size="sm" data-testid="tab-import">
                  <FileText className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
              </Link>
            )}
            {isAdmin && (
              onTabChange ? (
                <Button
                  variant={activeTab === "products" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => onTabChange("products")}
                  data-testid="tab-products"
                >
                  <Package className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Products</span>
                </Button>
              ) : (
                <Link href="/?tab=products">
                  <Button variant="ghost" size="sm" data-testid="tab-products">
                    <Package className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Products</span>
                  </Button>
                </Link>
              )
            )}
          </>
        )}
        <Link href="/orders">
          <Button
            variant="ghost"
            size="sm"
            data-testid="tab-orders"
          >
            <ListOrdered className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Orders</span>
          </Button>
        </Link>
        {isAdmin && (
          <Link href="/users">
            <Button
              variant="ghost"
              size="sm"
              data-testid="tab-users"
            >
              <Users className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Users</span>
            </Button>
          </Link>
        )}
        {isAdmin && (
          <Link href="/analytics">
            <Button
              variant="ghost"
              size="sm"
              data-testid="tab-analytics"
            >
              <BarChart3 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Analytics</span>
            </Button>
          </Link>
        )}
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
    </>
  );
}
