import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Landing from "@/pages/landing";
import PhoneLogin from "@/pages/phone-login";
import OrdersPage from "@/pages/orders";
import UsersPage from "@/pages/users";
import AnalyticsPage from "@/pages/analytics";
import ProductPopularityPage from "@/pages/product-popularity";
import BrandsPage from "@/pages/brands";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
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
