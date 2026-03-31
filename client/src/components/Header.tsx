import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, FileText, ClipboardList, ListOrdered, Users, BarChart3, ShoppingBag, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";

interface HeaderProps {
  cartItemCount: number;
  activeTab?: "order" | "import";
  onTabChange?: (tab: "order" | "import") => void;
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
  const [location] = useLocation();

  return (
    <>
      <div className="flex items-center gap-2">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="font-semibold text-lg hidden sm:block">Order Entry</h1>
      </div>

      <nav className="flex gap-1 flex-wrap">
        {/* Order & Import tabs — only shown on the home page */}
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
          </>
        )}

        {/* Sales Orders — all logged-in users */}
        <Link href="/sales-orders">
          <Button
            variant={location === "/sales-orders" ? "secondary" : "ghost"}
            size="sm"
            data-testid="tab-sales-orders"
          >
            <ShoppingBag className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Sales Orders</span>
          </Button>
        </Link>

        {/* Inventory — all logged-in users */}
        <Link href="/inventory">
          <Button
            variant={location === "/inventory" ? "secondary" : "ghost"}
            size="sm"
            data-testid="tab-inventory"
          >
            <Warehouse className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Inventory</span>
          </Button>
        </Link>

        {/* Orders — all logged-in users */}
        <Link href="/orders">
          <Button
            variant={location === "/orders" ? "secondary" : "ghost"}
            size="sm"
            data-testid="tab-orders"
          >
            <ListOrdered className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Orders</span>
          </Button>
        </Link>

        {/* Analytics — admin only */}
        {isAdmin && (
          <Link href="/analytics">
            <Button
              variant={location === "/analytics" ? "secondary" : "ghost"}
              size="sm"
              data-testid="tab-analytics"
            >
              <BarChart3 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Analytics</span>
            </Button>
          </Link>
        )}

        {/* Products — admin only */}
        {isAdmin && (
          <Link href="/products">
            <Button
              variant={location === "/products" ? "secondary" : "ghost"}
              size="sm"
              data-testid="tab-products"
            >
              <Package className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Products</span>
            </Button>
          </Link>
        )}

        {/* Users — admin only */}
        {isAdmin && (
          <Link href="/users">
            <Button
              variant={location === "/users" ? "secondary" : "ghost"}
              size="sm"
              data-testid="tab-users"
            >
              <Users className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Users</span>
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
