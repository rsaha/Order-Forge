import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, ListOrdered, Users, BarChart3, ShoppingBag, Warehouse, Home } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link, useLocation } from "wouter";

interface HeaderProps {
  cartItemCount: number;
  onCartClick: () => void;
  isAdmin?: boolean;
  isBrandAdmin?: boolean;
}

export default function Header({
  cartItemCount,
  onCartClick,
  isAdmin = false,
  isBrandAdmin = false,
}: HeaderProps) {
  const [location] = useLocation();

  return (
    <>
      <div className="flex items-center gap-2">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="font-semibold text-lg hidden sm:block">Order Entry</h1>
      </div>

      <nav className="flex gap-1 flex-wrap">
        {/* Home — all logged-in users */}
        <Link href="/">
          <Button
            variant={location === "/" ? "secondary" : "ghost"}
            size="sm"
            data-testid="tab-home"
          >
            <Home className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Home</span>
          </Button>
        </Link>

        {/* My Orders — non-admin users only (BrandAdmin, User, Customer) */}
        {!isAdmin && (
          <Link href="/sales-orders">
            <Button
              variant={location === "/sales-orders" ? "secondary" : "ghost"}
              size="sm"
              data-testid="tab-sales-orders"
            >
              <ShoppingBag className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">My Orders</span>
            </Button>
          </Link>
        )}

        {/* Inventory — non-admin users only */}
        {!isAdmin && (
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
        )}

        {/* Orders Management — admin only (full order management page) */}
        {isAdmin && (
          <Link href="/orders">
            <Button
              variant={location === "/orders" ? "secondary" : "ghost"}
              size="sm"
              data-testid="tab-orders"
            >
              <ListOrdered className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Orders Management</span>
            </Button>
          </Link>
        )}

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
