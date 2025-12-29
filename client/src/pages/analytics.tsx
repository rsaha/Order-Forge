import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
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
  Package,
  FileText,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  TrendingUp,
  DollarSign,
  BarChart3,
  Loader2,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { ORDER_STATUSES } from "@shared/schema";
import type { BrandRecord } from "@shared/schema";

interface OrderAnalytics {
  statusCounts: Record<string, number>;
  totalInvoiceValue: number;
  deliveredOnTimeCount: number;
  deliveredCount: number;
}

const STATUS_ICONS: Record<string, { icon: typeof Package; color: string }> = {
  Created: { icon: FileText, color: "text-blue-500" },
  Approved: { icon: Clock, color: "text-yellow-500" },
  Invoiced: { icon: FileText, color: "text-purple-500" },
  Dispatched: { icon: Truck, color: "text-orange-500" },
  Delivered: { icon: CheckCircle, color: "text-green-500" },
  Cancelled: { icon: XCircle, color: "text-red-500" },
};

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function getDateRange(days: number): { fromDate: string; toDate: string } {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - days);
  return {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: today.toISOString().split('T')[0],
  };
}

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "all">("30days");
  const [brandFilter, setBrandFilter] = useState<string>("all");

  const isAdmin = user?.isAdmin || false;

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    
    if (brandFilter !== "all") {
      params.append("brand", brandFilter);
    }
    
    if (dateRange === "7days") {
      const range = getDateRange(7);
      params.append("fromDate", range.fromDate);
      params.append("toDate", range.toDate);
    } else if (dateRange === "30days") {
      const range = getDateRange(30);
      params.append("fromDate", range.fromDate);
      params.append("toDate", range.toDate);
    }
    
    return params.toString();
  };

  const queryParams = buildQueryParams();
  const queryUrl = `/api/admin/analytics/orders${queryParams ? `?${queryParams}` : ""}`;

  const { data: analytics, isLoading, isError } = useQuery<OrderAnalytics>({
    queryKey: ["/api/admin/analytics/orders", dateRange, brandFilter],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: brands = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Admin access required</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  const totalOrders = Object.values(analytics?.statusCounts || {}).reduce((a, b) => a + b, 0);
  const onTimePercentage = analytics?.deliveredCount && analytics.deliveredCount > 0
    ? Math.round((analytics.deliveredOnTimeCount / analytics.deliveredCount) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center gap-4 p-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            <h1 className="text-xl font-semibold">Analytics</h1>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <Card className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[150px]">
              <Label className="text-sm text-muted-foreground">Date Range</Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as "7days" | "30days" | "all")}>
                <SelectTrigger data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 Days</SelectItem>
                  <SelectItem value="30days">Last 30 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1 min-w-[150px]">
              <Label className="text-sm text-muted-foreground">Brand</Label>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger data-testid="select-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.name}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Card className="p-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="w-12 h-12 text-destructive" />
              <p className="text-muted-foreground">Failed to load analytics data. Please try again.</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Orders</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-total-orders">{totalOrders}</p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Invoice Value</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-invoice-value">
                  {formatINR(analytics?.totalInvoiceValue || 0)}
                </p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-muted-foreground">On-Time Delivery</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-on-time">
                  {analytics?.deliveredOnTimeCount || 0}
                  <span className="text-sm text-muted-foreground ml-2">
                    ({onTimePercentage}%)
                  </span>
                </p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Delivered</span>
                </div>
                <p className="text-2xl font-bold" data-testid="text-delivered">
                  {analytics?.deliveredCount || 0}
                </p>
              </Card>
            </div>

            <Card className="p-4">
              <h2 className="text-lg font-semibold mb-4">Orders by Status</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {ORDER_STATUSES.map((status) => {
                  const config = STATUS_ICONS[status] || { icon: Package, color: "text-muted-foreground" };
                  const Icon = config.icon;
                  const count = analytics?.statusCounts[status] || 0;
                  return (
                    <div key={status} className="flex flex-col items-center p-4 rounded-lg bg-muted/50">
                      <Icon className={`w-8 h-8 mb-2 ${config.color}`} />
                      <span className="text-2xl font-bold" data-testid={`text-status-${status.toLowerCase()}`}>
                        {count}
                      </span>
                      <span className="text-sm text-muted-foreground">{status}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
