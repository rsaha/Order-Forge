import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Package } from "lucide-react";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Landing from "@/pages/landing";
import PhoneLogin from "@/pages/phone-login";
import OrdersPage from "@/pages/orders";
import UsersPage from "@/pages/users";
import AnalyticsPage from "@/pages/analytics";
import ProductPopularityPage from "@/pages/product-popularity";
import BrandsPage from "@/pages/brands";
import AnnouncementsPage from "@/pages/announcements";
import StockPage from "@/pages/stock";
import PortalPage from "@/pages/portal";
import SalesOrdersPage from "@/pages/sales-orders";
import InventoryPage from "@/pages/inventory";
import ProductsPage from "@/pages/products";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <Package className="w-10 h-10 text-primary/30" />
          <Loader2 className="w-5 h-5 animate-spin text-primary absolute -bottom-1 -right-1" />
        </div>
        <p className="text-sm text-muted-foreground">Loading your session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/phone-login" component={PhoneLogin} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/orders" component={OrdersPage} />
      <Route path="/users" component={UsersPage} />
      <Route path="/analytics" component={AnalyticsPage} />
      <Route path="/analytics/products" component={ProductPopularityPage} />
      <Route path="/brands" component={BrandsPage} />
      <Route path="/announcements" component={AnnouncementsPage} />
      <Route path="/stock" component={StockPage} />
      <Route path="/portal" component={PortalPage} />
      <Route path="/sales-orders" component={SalesOrdersPage} />
      <Route path="/inventory" component={InventoryPage} />
      <Route path="/products" component={ProductsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
