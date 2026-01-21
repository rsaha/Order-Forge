import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Package,
  AlertCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

interface TopProduct {
  name: string;
  sku: string;
  orderCount: number;
}

interface BrandTopProducts {
  brand: string;
  products: TopProduct[];
}

interface UnorderedProduct {
  name: string;
  skuCount: number;
}

interface BrandUnorderedProducts {
  brand: string;
  products: UnorderedProduct[];
}

function getDateRange(days: number) {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  return {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: toDate.toISOString().split('T')[0],
  };
}

function getThisMonthRange() {
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: now.toISOString().split('T')[0],
  };
}

function getLastMonthRange() {
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const toDate = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: toDate.toISOString().split('T')[0],
  };
}

export default function ProductPopularityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "90days" | "thisMonth" | "lastMonth" | "all">("30days");

  const isAdmin = user?.isAdmin || false;

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    
    if (dateRange === "7days") {
      const range = getDateRange(7);
      params.append("fromDate", range.fromDate);
      params.append("toDate", range.toDate);
    } else if (dateRange === "30days") {
      const range = getDateRange(30);
      params.append("fromDate", range.fromDate);
      params.append("toDate", range.toDate);
    } else if (dateRange === "90days") {
      const range = getDateRange(90);
      params.append("fromDate", range.fromDate);
      params.append("toDate", range.toDate);
    } else if (dateRange === "thisMonth") {
      const range = getThisMonthRange();
      params.append("fromDate", range.fromDate);
      params.append("toDate", range.toDate);
    } else if (dateRange === "lastMonth") {
      const range = getLastMonthRange();
      params.append("fromDate", range.fromDate);
      params.append("toDate", range.toDate);
    }
    
    return params.toString();
  };

  const queryParams = buildQueryParams();

  const { data: topByBrand = [], isLoading: loadingTop } = useQuery<BrandTopProducts[]>({
    queryKey: ["/api/analytics/products/top-by-brand", dateRange],
    queryFn: async () => {
      const url = `/api/analytics/products/top-by-brand${queryParams ? `?${queryParams}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch top products");
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: unorderedByBrand = [], isLoading: loadingUnordered } = useQuery<BrandUnorderedProducts[]>({
    queryKey: ["/api/analytics/products/unordered", dateRange],
    queryFn: async () => {
      const url = queryParams 
        ? `/api/analytics/products/unordered?${queryParams}&limit=5`
        : `/api/analytics/products/unordered?limit=5`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch unordered products");
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLoading = loadingTop || loadingUnordered;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header cartItemCount={0} onCartClick={() => {}} />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="p-6 max-w-md text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground">
              Product popularity analytics are only available to administrators.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  const dateRangeLabel = {
    "7days": "Last 7 Days",
    "30days": "Last 30 Days",
    "90days": "Last 90 Days",
    "thisMonth": "This Month",
    "lastMonth": "Last Month",
    "all": "All Time",
  }[dateRange];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header cartItemCount={0} onCartClick={() => {}} />
      
      <main className="flex-1 p-4 space-y-6">
        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/analytics">
            <Button variant="ghost" size="sm" data-testid="button-back-analytics">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Analytics
            </Button>
          </Link>
          
          <div className="flex-1" />
          
          <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
            <SelectTrigger className="w-[160px]" data-testid="select-date-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="90days">Last 90 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Product Popularity</h1>
          <Badge variant="secondary" className="ml-2">{dateRangeLabel}</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Top 10 Products by Brand
              </h2>
              
              {topByBrand.length === 0 ? (
                <Card className="p-6 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No order data found for this time period.</p>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {topByBrand.map((brandData) => (
                    <Card key={brandData.brand} className="p-4" data-testid={`card-brand-${brandData.brand}`}>
                      <h3 className="font-semibold text-sm mb-3 text-primary">{brandData.brand}</h3>
                      <div className="space-y-2">
                        {brandData.products.map((product, idx) => (
                          <div 
                            key={`${product.sku}-${idx}`} 
                            className="flex items-start gap-2 text-sm"
                            data-testid={`row-product-${product.sku}-${idx}`}
                          >
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{product.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{product.sku}</p>
                            </div>
                            <Badge variant="secondary" className="flex-shrink-0">
                              {product.orderCount}
                            </Badge>
                          </div>
                        ))}
                        {brandData.products.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">No orders in this period</p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-amber-600" />
                Products Not Ordered (Top 5 per Brand)
              </h2>
              
              {unorderedByBrand.length === 0 ? (
                <Card className="p-6 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>All products have been ordered in this period!</p>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {unorderedByBrand.map((brandData) => (
                    <Card key={brandData.brand} className="p-4 border-amber-200 dark:border-amber-800" data-testid={`card-unordered-${brandData.brand}`}>
                      <h3 className="font-semibold text-sm mb-3 text-amber-700 dark:text-amber-400">{brandData.brand}</h3>
                      <div className="space-y-2">
                        {brandData.products.map((product, idx) => (
                          <div 
                            key={product.name} 
                            className="flex items-start gap-2 text-sm p-2 rounded-md bg-amber-50 dark:bg-amber-950/20"
                            data-testid={`row-unordered-${brandData.brand}-${idx}`}
                          >
                            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{product.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {product.skuCount} SKU{product.skuCount > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                        ))}
                        {brandData.products.length === 0 && (
                          <p className="text-xs text-muted-foreground italic">All products ordered</p>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
