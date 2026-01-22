import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Trophy,
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface TopOrderCreator {
  userId: string;
  userName: string;
  orderCount: number;
  totalValue: number;
}

function formatINR(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`;
  } else if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function ProductPopularityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "90days" | "thisMonth" | "lastMonth" | "all">("30days");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"popular" | "unordered">("popular");

  const isAdmin = user?.isAdmin || false;
  const isBrandAdmin = user?.role === 'BrandAdmin';

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
        ? `/api/analytics/products/unordered?${queryParams}&limit=10`
        : `/api/analytics/products/unordered?limit=10`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch unordered products");
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: topCreator } = useQuery<TopOrderCreator | null>({
    queryKey: ["/api/analytics/top-order-creator", dateRange, selectedBrand],
    queryFn: async () => {
      let url = `/api/analytics/top-order-creator`;
      const params = new URLSearchParams();
      if (queryParams) {
        params.append("fromDate", queryParams.split("fromDate=")[1]?.split("&")[0] || "");
        params.append("toDate", queryParams.split("toDate=")[1]?.split("&")[0] || "");
      }
      if (selectedBrand !== "all") {
        params.append("brand", selectedBrand);
      }
      const paramStr = params.toString();
      if (paramStr) url += `?${paramStr}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch top order creator");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLoading = loadingTop || loadingUnordered;

  const brands = useMemo(() => {
    const brandSet = new Set<string>();
    topByBrand.forEach(b => brandSet.add(b.brand));
    unorderedByBrand.forEach(b => brandSet.add(b.brand));
    return Array.from(brandSet).sort();
  }, [topByBrand, unorderedByBrand]);

  const filteredTopProducts = useMemo(() => {
    if (selectedBrand === "all") {
      return topByBrand.flatMap(b => b.products.map(p => ({ ...p, brand: b.brand })))
        .sort((a, b) => b.orderCount - a.orderCount)
        .slice(0, 20);
    }
    const brandData = topByBrand.find(b => b.brand === selectedBrand);
    return brandData?.products.map(p => ({ ...p, brand: selectedBrand })) || [];
  }, [topByBrand, selectedBrand]);

  const filteredUnorderedProducts = useMemo(() => {
    if (selectedBrand === "all") {
      return unorderedByBrand.flatMap(b => b.products.map(p => ({ ...p, brand: b.brand })));
    }
    const brandData = unorderedByBrand.find(b => b.brand === selectedBrand);
    return brandData?.products.map(p => ({ ...p, brand: selectedBrand })) || [];
  }, [unorderedByBrand, selectedBrand]);

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
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header
            cartItemCount={0}
            onCartClick={() => {}}
            isAdmin={isAdmin}
            isBrandAdmin={isBrandAdmin}
          />
        </div>
      </header>
      <div className="flex items-center gap-4 p-4 border-b flex-wrap">
        <Link href="/analytics">
          <Button variant="ghost" size="sm" data-testid="button-back-analytics">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          <h1 className="text-xl font-semibold">Product Analytics</h1>
        </div>
        <div className="flex-1" />
      </div>

      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[120px]">
              <Label className="text-sm text-muted-foreground">Date Range</Label>
              <Select value={dateRange} onValueChange={(v: any) => setDateRange(v)}>
                <SelectTrigger data-testid="select-date-range">
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
            
            <div className="flex-1 min-w-[120px]">
              <Label className="text-sm text-muted-foreground">Brand</Label>
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger data-testid="select-brand">
                  <SelectValue placeholder="Select Brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map(brand => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {topCreator && (
          <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <Trophy className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">Top Order Creator</p>
                <p className="font-semibold truncate">{topCreator.userName}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-amber-600">{topCreator.orderCount}</p>
                <p className="text-xs text-muted-foreground">invoiced orders</p>
              </div>
              <div className="text-right border-l pl-3">
                <p className="text-lg font-bold">{formatINR(topCreator.totalValue)}</p>
                <p className="text-xs text-muted-foreground">total value</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4">

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="popular" className="flex-1 gap-2" data-testid="tab-popular">
                  <TrendingUp className="h-4 w-4" />
                  Popular
                  <Badge variant="secondary" className="ml-1">{filteredTopProducts.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="unordered" className="flex-1 gap-2" data-testid="tab-unordered">
                  <TrendingDown className="h-4 w-4" />
                  Not Ordered
                  <Badge variant="secondary" className="ml-1">{filteredUnorderedProducts.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="popular" className="mt-0">
                {filteredTopProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No orders found for this selection.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTopProducts.map((product, idx) => (
                      <div 
                        key={`${product.sku}-${idx}`} 
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover-elevate"
                        data-testid={`row-product-${product.sku}-${idx}`}
                      >
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{product.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{product.sku}</span>
                            {selectedBrand === "all" && (
                              <Badge variant="outline" className="text-xs py-0">{product.brand}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-semibold text-primary">{product.orderCount}</p>
                          <p className="text-xs text-muted-foreground">orders</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="unordered" className="mt-0">
                {filteredUnorderedProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50 text-green-600" />
                    <p>All products have been ordered!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUnorderedProducts.map((product, idx) => (
                      <div 
                        key={`${product.name}-${idx}`} 
                        className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800"
                        data-testid={`row-unordered-${idx}`}
                      >
                        <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{product.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{product.skuCount} SKU{product.skuCount > 1 ? 's' : ''}</span>
                            {selectedBrand === "all" && (
                              <Badge variant="outline" className="text-xs py-0">{product.brand}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </Card>
      </div>
    </div>
  );
}
