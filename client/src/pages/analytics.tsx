import { useState, useMemo, useCallback } from "react";
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
  CheckCircle,
  XCircle,
  Truck,
  Clock,
  Loader2,
  ChevronLeft,
  AlertCircle,
  BarChart3,
  Target,
  Table2,
  LineChartIcon,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  FileText,
  Package,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { BrandRecord, Order } from "@shared/schema";
import { DELIVERY_COMPANY_OPTIONS } from "@shared/schema";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import { format, parseISO, differenceInHours, differenceInDays, differenceInMinutes } from "date-fns";

interface StatusMetric {
  count: number;
  value: number;
}

interface TimeBucketMetric {
  date: string;
  created: StatusMetric;
  invoiced: StatusMetric;
  dispatched: StatusMetric;
  delivered: StatusMetric;
  onTimeCount: number;
  deliveredCount: number;
}

interface CreatorTimeBucket {
  date: string;
  [creatorName: string]: string | number;
}

interface OrderAnalytics {
  created: StatusMetric;
  approved: StatusMetric;
  invoiced: StatusMetric;
  dispatched: StatusMetric;
  delivered: StatusMetric;
  cancelled: StatusMetric;
  onTimeDelivery: {
    onTimeCount: number;
    deliveredCount: number;
    percentage: number;
  };
  timeSeries: TimeBucketMetric[];
  creatorSeries: CreatorTimeBucket[];
  creatorNames: string[];
  bucketType: 'daily' | 'weekly' | 'monthly';
}

interface FlowMetrics {
  created: number;
  invoiced: number;
  dispatched: number;
  delivered: number;
  cancelled: number;
  pending: number;
}

interface VelocityMetrics {
  createdToInvoiced: { avgMinutes: number; count: number };
  invoicedToDispatched: { avgHours: number; count: number };
  dispatchedToDelivered: { avgHours: number; count: number };
  totalCycleTime: { avgHours: number; count: number };
}

interface BlockerMetrics {
  stuckAtCreated: Order[];
  stuckAtInvoiced: Order[];
  stuckAtDispatched: Order[];
}

const STAGE_COLORS = {
  created: "#3b82f6",
  invoiced: "#a855f7",
  dispatched: "#f97316",
  delivered: "#14b8a6",
};

function formatDuration(hours: number): string {
  if (hours < 1) return "< 1 hour";
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

function formatDurationMinutes(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
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

function formatINRFull(amount: number): string {
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

function getThisMonthRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    fromDate: firstDay.toISOString().split('T')[0],
    toDate: today.toISOString().split('T')[0],
  };
}

function getLastMonthRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    fromDate: firstDayLastMonth.toISOString().split('T')[0],
    toDate: lastDayLastMonth.toISOString().split('T')[0],
  };
}

interface KPICardProps {
  title: string;
  count: number;
  value: number;
  icon: typeof Clock;
  colorClass: string;
  bgClass: string;
}

function KPICard({ title, count, value, icon: Icon, colorClass, bgClass }: KPICardProps) {
  return (
    <Card className={`p-4 ${bgClass}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-2 rounded-lg ${colorClass} bg-opacity-20`}>
          <Icon className={`w-5 h-5 ${colorClass}`} />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>
      <p className="text-3xl font-bold mb-1" data-testid={`text-${title.toLowerCase()}-count`}>
        {count}
      </p>
      <p className="text-sm text-muted-foreground" data-testid={`text-${title.toLowerCase()}-value`}>
        {formatINRFull(value)}
      </p>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "90days" | "thisMonth" | "lastMonth" | "all">("30days");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [deliveryCompanyFilter, setDeliveryCompanyFilter] = useState<string>("Guided");
  const [statusViewMode, setStatusViewMode] = useState<"chart" | "table">("chart");
  const [expandedBlocker, setExpandedBlocker] = useState<string | null>(null);

  const isAdmin = user?.isAdmin || false;
  const isBrandAdmin = user?.role === 'BrandAdmin';
  const canViewAnalytics = isAdmin;

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    
    if (brandFilter !== "all") {
      params.append("brand", brandFilter);
    }
    if (deliveryCompanyFilter !== "all") {
      params.append("deliveryCompany", deliveryCompanyFilter);
    }
    
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
  const queryUrl = `/api/analytics/orders${queryParams ? `?${queryParams}` : ""}`;

  const { data: analytics, isLoading, isError } = useQuery<OrderAnalytics>({
    queryKey: ["/api/analytics/orders", dateRange, brandFilter, deliveryCompanyFilter],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: canViewAnalytics,
    staleTime: 2 * 60 * 1000, // 2 minutes - analytics data is read-only
    refetchOnWindowFocus: false,
  });

  const { data: brands = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
    staleTime: 10 * 60 * 1000, // 10 minutes - brands rarely change
    refetchOnWindowFocus: false,
  });

  // Fetch orders for delivery cost analysis and status breakdown
  const ordersQueryUrl = `/api/admin/orders${queryParams ? `?${queryParams}` : ""}`;
  const { data: ordersData = [] } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders", dateRange, brandFilter, deliveryCompanyFilter],
    queryFn: async () => {
      const res = await fetch(ordersQueryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: canViewAnalytics,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Format chart date helper - must be before early returns
  const formatChartDate = useCallback((dateStr: string, bucketType?: string) => {
    try {
      const date = parseISO(dateStr);
      if (bucketType === 'monthly') {
        return format(date, 'MMM yyyy');
      } else if (bucketType === 'weekly') {
        return format(date, 'MMM d');
      }
      return format(date, 'MMM d');
    } catch {
      return dateStr;
    }
  }, []);

  // Order flow funnel metrics
  const flowMetrics = useMemo((): FlowMetrics => {
    const metrics: FlowMetrics = {
      created: 0,
      invoiced: 0,
      dispatched: 0,
      delivered: 0,
      cancelled: 0,
      pending: 0,
    };
    ordersData.forEach((order) => {
      const status = order.status.toLowerCase();
      if (status === "created" || status === "approved") metrics.created++;
      else if (status === "invoiced") metrics.invoiced++;
      else if (status === "dispatched") metrics.dispatched++;
      else if (status === "delivered" || status === "podreceived") metrics.delivered++;
      else if (status === "cancelled") metrics.cancelled++;
      else if (status === "pending") metrics.pending++;
    });
    return metrics;
  }, [ordersData]);

  // Velocity metrics for stage transitions
  const velocityMetrics = useMemo((): VelocityMetrics => {
    const metrics: VelocityMetrics = {
      createdToInvoiced: { avgMinutes: 0, count: 0 },
      invoicedToDispatched: { avgHours: 0, count: 0 },
      dispatchedToDelivered: { avgHours: 0, count: 0 },
      totalCycleTime: { avgHours: 0, count: 0 },
    };

    const durations = {
      createdToInvoiced: [] as number[],
      invoicedToDispatched: [] as number[],
      dispatchedToDelivered: [] as number[],
      totalCycle: [] as number[],
    };

    ordersData.forEach((order) => {
      const createdAt = order.createdAt ? new Date(order.createdAt) : null;
      const invoiceDate = order.invoiceDate ? new Date(order.invoiceDate) : null;
      const dispatchDate = order.dispatchDate ? new Date(order.dispatchDate) : null;
      const deliveryDate = order.actualDeliveryDate ? new Date(order.actualDeliveryDate) : null;

      if (createdAt && invoiceDate) {
        durations.createdToInvoiced.push(differenceInMinutes(invoiceDate, createdAt));
      }
      if (invoiceDate && dispatchDate) {
        durations.invoicedToDispatched.push(differenceInHours(dispatchDate, invoiceDate));
      }
      if (dispatchDate && deliveryDate) {
        durations.dispatchedToDelivered.push(differenceInHours(deliveryDate, dispatchDate));
      }
      if (createdAt && deliveryDate) {
        durations.totalCycle.push(differenceInHours(deliveryDate, createdAt));
      }
    });

    const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    metrics.createdToInvoiced = { avgMinutes: avg(durations.createdToInvoiced), count: durations.createdToInvoiced.length };
    metrics.invoicedToDispatched = { avgHours: avg(durations.invoicedToDispatched), count: durations.invoicedToDispatched.length };
    metrics.dispatchedToDelivered = { avgHours: avg(durations.dispatchedToDelivered), count: durations.dispatchedToDelivered.length };
    metrics.totalCycleTime = { avgHours: avg(durations.totalCycle), count: durations.totalCycle.length };

    return metrics;
  }, [ordersData]);

  // Blocker detection - orders stuck at stages
  const blockerMetrics = useMemo((): BlockerMetrics => {
    const now = new Date();
    const STUCK_THRESHOLDS = {
      created: 48,
      invoiced: 48,
    };

    const blockers: BlockerMetrics = {
      stuckAtCreated: [],
      stuckAtInvoiced: [],
      stuckAtDispatched: [],
    };

    ordersData.forEach((order) => {
      const status = order.status.toLowerCase();
      const createdAt = order.createdAt ? new Date(order.createdAt) : null;
      const invoiceDate = order.invoiceDate ? new Date(order.invoiceDate) : null;
      const estimatedDelivery = order.estimatedDeliveryDate ? new Date(order.estimatedDeliveryDate) : null;

      if ((status === "created" || status === "approved") && createdAt) {
        const hoursStuck = differenceInHours(now, createdAt);
        if (hoursStuck > STUCK_THRESHOLDS.created) {
          blockers.stuckAtCreated.push(order);
        }
      }
      if (status === "invoiced" && invoiceDate) {
        const hoursStuck = differenceInHours(now, invoiceDate);
        if (hoursStuck > STUCK_THRESHOLDS.invoiced) {
          blockers.stuckAtInvoiced.push(order);
        }
      }
      if (status === "dispatched" && estimatedDelivery && estimatedDelivery < now) {
        blockers.stuckAtDispatched.push(order);
      }
    });

    return blockers;
  }, [ordersData]);

  // Funnel visualization data
  const funnelData = useMemo(() => {
    const total = ordersData.length;
    if (total === 0) return [];

    const invoicedOrders = ordersData.filter(
      (o) => ["invoiced", "dispatched", "delivered", "podreceived"].includes(o.status.toLowerCase())
    ).length;
    const dispatchedOrders = ordersData.filter(
      (o) => ["dispatched", "delivered", "podreceived"].includes(o.status.toLowerCase())
    ).length;
    const deliveredOrders = ordersData.filter(
      (o) => ["delivered", "podreceived"].includes(o.status.toLowerCase())
    ).length;

    return [
      { stage: "Created", count: total, percentage: 100, color: STAGE_COLORS.created },
      { stage: "Invoiced", count: invoicedOrders, percentage: Math.round((invoicedOrders / total) * 100), color: STAGE_COLORS.invoiced },
      { stage: "Dispatched", count: dispatchedOrders, percentage: Math.round((dispatchedOrders / total) * 100), color: STAGE_COLORS.dispatched },
      { stage: "Delivered", count: deliveredOrders, percentage: Math.round((deliveredOrders / total) * 100), color: STAGE_COLORS.delivered },
    ];
  }, [ordersData]);

  // Velocity chart data - split into minutes (for fast transitions) and hours (for longer transitions)
  const velocityChartDataMinutes = useMemo(() => [
    { stage: "Created → Invoiced", minutes: velocityMetrics.createdToInvoiced.avgMinutes, count: velocityMetrics.createdToInvoiced.count },
  ], [velocityMetrics]);

  const velocityChartDataHours = useMemo(() => [
    { stage: "Invoiced → Dispatched", hours: velocityMetrics.invoicedToDispatched.avgHours, count: velocityMetrics.invoicedToDispatched.count },
    { stage: "Dispatched → Delivered", hours: velocityMetrics.dispatchedToDelivered.avgHours, count: velocityMetrics.dispatchedToDelivered.count },
  ], [velocityMetrics]);

  const totalBlockers =
    blockerMetrics.stuckAtCreated.length +
    blockerMetrics.stuckAtInvoiced.length +
    blockerMetrics.stuckAtDispatched.length;

  // Memoize chart data transformation to avoid recalculating on every render
  const chartData = useMemo(() => {
    if (!analytics?.timeSeries) return [];
    return analytics.timeSeries.map(bucket => ({
      date: formatChartDate(bucket.date, analytics.bucketType),
      Created: bucket.created.count,
      Invoiced: bucket.invoiced.count,
      Dispatched: bucket.dispatched.count,
      Delivered: bucket.delivered.count,
      InvoicedValue: bucket.invoiced.value,
      DispatchedValue: bucket.dispatched.value,
      DeliveredValue: bucket.delivered.value,
      OnTimeRate: bucket.deliveredCount > 0 ? Math.round((bucket.onTimeCount / bucket.deliveredCount) * 100) : null,
    }));
  }, [analytics?.timeSeries, analytics?.bucketType, formatChartDate]);

  // Normalize dispatcher names - combine variations
  const normalizeDispatcher = useCallback((dispatcher: string): string => {
    if (!dispatcher) return 'Unknown';
    const lower = dispatcher.toLowerCase().trim();
    // Combine all DTDC variations into "DTDC"
    if (lower.includes('dtdc')) return 'DTDC';
    // Combine all Universal variations into "Universal"
    if (lower.includes('universal')) return 'Universal';
    return dispatcher;
  }, []);

  // Delivery Cost by Dispatch By - filter and aggregate (summary totals by dispatcher)
  const deliveryCostSummary = useMemo(() => {
    const validStatuses = ["Dispatched", "Delivered", "PODReceived"];
    const excludedDispatchers = ["hand delivery", "by hand"];

    const isHandDelivery = (dispatchBy: string) => {
      const lower = dispatchBy.toLowerCase().trim();
      return excludedDispatchers.some(ex => lower.includes(ex));
    };

    const statusFiltered = ordersData.filter(order => validStatuses.includes(order.status));

    const totals: Record<string, { cost: number; count: number; orderValue: number }> = {};
    let noCostCount = 0;
    let noCostValue = 0;
    const missingCostOrders: { id: number; partyName: string; dispatchBy: string; total: string }[] = [];

    statusFiltered.forEach(order => {
      const hasCost = order.deliveryCost && parseFloat(order.deliveryCost) > 0;
      const hasDispatcher = !!order.dispatchBy && order.dispatchBy.trim() !== '';
      const handDelivery = hasDispatcher && isHandDelivery(order.dispatchBy!);

      if (hasCost && hasDispatcher && !handDelivery) {
        const dispatcher = normalizeDispatcher(order.dispatchBy || 'Unknown');
        if (!totals[dispatcher]) totals[dispatcher] = { cost: 0, count: 0, orderValue: 0 };
        totals[dispatcher].cost += parseFloat(order.deliveryCost || '0');
        totals[dispatcher].count += 1;
        totals[dispatcher].orderValue += parseFloat(order.total || '0');
      } else if (!hasCost) {
        noCostCount++;
        noCostValue += parseFloat(order.total || '0');
        if (hasDispatcher && !handDelivery) {
          missingCostOrders.push({
            id: order.id,
            partyName: order.partyName || '',
            dispatchBy: order.dispatchBy || '',
            total: order.total || '0',
          });
        }
      }
    });

    const summaryData = Object.entries(totals)
      .map(([dispatcher, data]) => ({
        dispatchBy: dispatcher,
        totalCost: data.cost,
        orderCount: data.count,
        orderValue: data.orderValue,
        costPercentage: data.orderValue > 0 ? (data.cost / data.orderValue) * 100 : 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const grandTotal = summaryData.reduce((sum, row) => sum + row.totalCost, 0);
    const totalOrders = summaryData.reduce((sum, row) => sum + row.orderCount, 0);
    const grandOrderValue = summaryData.reduce((sum, row) => sum + row.orderValue, 0);
    const grandCostPercentage = grandOrderValue > 0 ? (grandTotal / grandOrderValue) * 100 : 0;

    return {
      summaryData, grandTotal, totalOrders, grandOrderValue, grandCostPercentage,
      noCostCount, noCostValue,
      missingCostOrders,
      totalStatusOrders: statusFiltered.length,
    };
  }, [ordersData, normalizeDispatcher]);

  // Daily transport cost - sum of all transport costs per day
  const dailyTransportCost = useMemo(() => {
    const validStatuses = ["Dispatched", "Delivered", "PODReceived"];
    const excludedDispatchers = ["hand delivery", "by hand"];
    
    const dailyTotals: Record<string, number> = {};
    
    ordersData.forEach(order => {
      if (!validStatuses.includes(order.status)) return;
      if (!order.deliveryCost || parseFloat(order.deliveryCost) === 0) return;
      if (!order.dispatchBy) return;
      const dispatcherLower = order.dispatchBy.toLowerCase().trim();
      if (excludedDispatchers.some(ex => dispatcherLower.includes(ex))) return;
      
      // Use dispatch date if available, otherwise invoice date
      const dateField = order.dispatchDate || order.invoiceDate || order.createdAt;
      if (!dateField) return;
      
      const dateStr = format(new Date(dateField), 'yyyy-MM-dd');
      if (!dailyTotals[dateStr]) dailyTotals[dateStr] = 0;
      dailyTotals[dateStr] += parseFloat(order.deliveryCost || '0');
    });
    
    // Convert to sorted array
    return Object.entries(dailyTotals)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [ordersData]);

  // Order Status Over Time - aggregate by createdAt date
  const orderStatusByDay = useMemo(() => {
    const statusesToShow = ["Created", "Approved", "Invoiced", "Pending", "Dispatched", "Delivered"] as const;
    
    // Group by createdAt date
    const grouped: Record<string, { Created: number; Approved: number; Invoiced: number; Pending: number; Dispatched: number; Delivered: number }> = {};
    
    ordersData.forEach(order => {
      if (!order.createdAt) return;
      const dateStr = format(new Date(order.createdAt), 'yyyy-MM-dd');
      
      if (!grouped[dateStr]) {
        grouped[dateStr] = { Created: 0, Approved: 0, Invoiced: 0, Pending: 0, Dispatched: 0, Delivered: 0 };
      }
      
      if (statusesToShow.includes(order.status as typeof statusesToShow[number])) {
        grouped[dateStr][order.status as keyof typeof grouped[string]] += 1;
      }
    });

    // Convert to sorted array
    const dates = Object.keys(grouped).sort();
    return dates.map(date => ({
      date: formatChartDate(date),
      rawDate: date,
      Created: grouped[date].Created,
      Approved: grouped[date].Approved,
      Invoiced: grouped[date].Invoiced,
      Pending: grouped[date].Pending,
      Dispatched: grouped[date].Dispatched,
      Delivered: grouped[date].Delivered,
    }));
  }, [ordersData, formatChartDate]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canViewAnalytics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Admin access required</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          <h1 className="text-xl font-semibold">Order Analytics</h1>
        </div>
        <div className="flex-1" />
        <Link href="/analytics/products">
          <Button variant="outline" size="sm" data-testid="button-product-popularity">
            <TrendingUp className="h-4 w-4 mr-2" />
            Product Popularity
          </Button>
        </Link>
      </div>

      <div className="p-4 space-y-6">
        <Card className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[120px]">
              <Label className="text-sm text-muted-foreground">Date Range</Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
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

            <div className="flex-1 min-w-[120px]">
              <Label className="text-sm text-muted-foreground">Delivery Company</Label>
              <Select value={deliveryCompanyFilter} onValueChange={setDeliveryCompanyFilter}>
                <SelectTrigger data-testid="select-delivery-company">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  {DELIVERY_COMPANY_OPTIONS.map((company) => (
                    <SelectItem key={company} value={company}>{company}</SelectItem>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Total Orders</span>
                </div>
                <p className="text-3xl font-bold mb-1" data-testid="text-total-orders">
                  {(analytics?.created.count || 0) + (analytics?.approved?.count || 0) + (analytics?.invoiced?.count || 0) + (analytics?.dispatched.count || 0) + (analytics?.delivered.count || 0) + (analytics?.cancelled.count || 0)}
                </p>
                <p className="text-sm text-muted-foreground">orders in selected period</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                    <CheckCircle className="w-5 h-5 text-teal-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Value Invoiced</span>
                </div>
                <p className="text-3xl font-bold mb-1" data-testid="text-value-invoiced">
                  {formatINR((analytics?.invoiced?.value || 0) + (analytics?.dispatched?.value || 0) + (analytics?.delivered?.value || 0))}
                </p>
                <p className="text-sm text-muted-foreground">{(analytics?.invoiced?.count || 0) + (analytics?.dispatched?.count || 0) + (analytics?.delivered?.count || 0)} invoiced orders</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                    <Truck className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Transport Cost</span>
                </div>
                <p className="text-3xl font-bold mb-1" data-testid="text-transport-cost">
                  {formatINR(deliveryCostSummary.grandTotal)}
                </p>
                <p className="text-sm text-muted-foreground" data-testid="text-transport-percentage">
                  {(((analytics?.invoiced?.value || 0) + (analytics?.dispatched?.value || 0) + (analytics?.delivered?.value || 0)) > 0 
                    ? ((deliveryCostSummary.grandTotal / ((analytics?.invoiced?.value || 0) + (analytics?.dispatched?.value || 0) + (analytics?.delivered?.value || 0))) * 100).toFixed(1)
                    : 0
                  )}% of invoiced value
                </p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
                    <Target className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">On-Time Delivery</span>
                </div>
                <p className="text-3xl font-bold mb-1" data-testid="text-ontime-percentage">
                  {analytics?.onTimeDelivery.percentage || 0}%
                </p>
                <p className="text-sm text-muted-foreground" data-testid="text-ontime-ratio">
                  {analytics?.onTimeDelivery.onTimeCount || 0} / {analytics?.onTimeDelivery.deliveredCount || 0} orders
                </p>
              </Card>
            </div>

            {/* Order Flow Funnel - moved to top */}
            <section className="pt-2">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Order Flow Funnel
              </h2>
              <Card className="p-4">
                {funnelData.length > 0 ? (
                  <>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                      {funnelData.map((stage, index) => (
                        <div key={stage.stage} className="flex items-center gap-2 flex-1">
                          <div
                            className="flex flex-col items-center justify-center p-4 rounded-lg flex-1"
                            style={{ backgroundColor: `${stage.color}20` }}
                          >
                            <span className="text-2xl font-bold" style={{ color: stage.color }}>
                              {stage.count}
                            </span>
                            <span className="text-sm font-medium">{stage.stage}</span>
                            <span className="text-xs text-muted-foreground">{stage.percentage}%</span>
                          </div>
                          {index < funnelData.length - 1 && (
                            <ArrowRight className="w-5 h-5 text-muted-foreground hidden md:block" />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 text-center text-sm text-muted-foreground">
                      <span className="text-amber-600 font-medium">{flowMetrics.cancelled} cancelled</span>
                      {flowMetrics.pending > 0 && (
                        <span className="ml-4 text-purple-600 font-medium">{flowMetrics.pending} pending</span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No order data available</p>
                )}
              </Card>
            </section>

            {/* Blockers - moved to top */}
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Blockers
                {totalBlockers > 0 && (
                  <span className="text-sm font-normal text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                    {totalBlockers} orders stuck
                  </span>
                )}
              </h2>

              {totalBlockers === 0 ? (
                <Card className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="font-medium text-lg mb-2">No Blockers Detected</h3>
                  <p className="text-muted-foreground">All orders are moving through the pipeline smoothly.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {blockerMetrics.stuckAtCreated.length > 0 && (
                    <Card className="p-4 bg-blue-50/50 dark:bg-blue-950/20">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedBlocker(expandedBlocker === "created" ? null : "created")}
                        data-testid="button-toggle-created-blockers"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <FileText className="w-5 h-5 text-blue-500" />
                          <span className="font-medium">Stuck at Created</span>
                        </div>
                        <span className="text-lg font-bold text-blue-600" data-testid="text-created-blockers-count">{blockerMetrics.stuckAtCreated.length}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Waiting for approval &gt; 48 hours</p>
                      {expandedBlocker === "created" && (
                        <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
                          {blockerMetrics.stuckAtCreated.slice(0, 10).map((order) => (
                            <div key={order.id} className="text-sm p-2 bg-muted rounded flex justify-between" data-testid={`row-blocker-created-${order.id}`}>
                              <span>{order.partyName || "Unknown"}</span>
                              <span className="text-muted-foreground">
                                {order.createdAt ? differenceInDays(new Date(), new Date(order.createdAt)) : 0}d ago
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}

                  {blockerMetrics.stuckAtInvoiced.length > 0 && (
                    <Card className="p-4 bg-purple-50/50 dark:bg-purple-950/20">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedBlocker(expandedBlocker === "invoiced" ? null : "invoiced")}
                        data-testid="button-toggle-invoiced-blockers"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-purple-500" />
                          <FileText className="w-5 h-5 text-purple-500" />
                          <span className="font-medium">Stuck at Invoiced</span>
                        </div>
                        <span className="text-lg font-bold text-purple-600" data-testid="text-invoiced-blockers-count">{blockerMetrics.stuckAtInvoiced.length}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Waiting for dispatch &gt; 48 hours</p>
                      {expandedBlocker === "invoiced" && (
                        <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
                          {blockerMetrics.stuckAtInvoiced.slice(0, 10).map((order) => (
                            <div key={order.id} className="text-sm p-2 bg-muted rounded flex justify-between" data-testid={`row-blocker-invoiced-${order.id}`}>
                              <span>{order.partyName || "Unknown"}</span>
                              <span className="text-muted-foreground">
                                {order.invoiceDate ? differenceInDays(new Date(), new Date(order.invoiceDate)) : 0}d ago
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}

                  {blockerMetrics.stuckAtDispatched.length > 0 && (
                    <Card className="p-4 bg-orange-50/50 dark:bg-orange-950/20">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedBlocker(expandedBlocker === "dispatched" ? null : "dispatched")}
                        data-testid="button-toggle-dispatched-blockers"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-orange-500" />
                          <Truck className="w-5 h-5 text-orange-500" />
                          <span className="font-medium">Overdue Delivery</span>
                        </div>
                        <span className="text-lg font-bold text-orange-600" data-testid="text-dispatched-blockers-count">{blockerMetrics.stuckAtDispatched.length}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Past estimated delivery date</p>
                      {expandedBlocker === "dispatched" && (
                        <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
                          {blockerMetrics.stuckAtDispatched.slice(0, 10).map((order) => (
                            <div key={order.id} className="text-sm p-2 bg-muted rounded flex justify-between" data-testid={`row-blocker-dispatched-${order.id}`}>
                              <span>{order.partyName || "Unknown"}</span>
                              <span className="text-muted-foreground">
                                Est: {order.estimatedDeliveryDate ? format(new Date(order.estimatedDeliveryDate), "MMM d") : "N/A"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}
                </div>
              )}
            </section>

            {chartData.length > 0 && (
              <>
                <Card className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Order Value Over Time</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12 }}
                          tickMargin={8}
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }} 
                          tickFormatter={(v) => formatINR(v)}
                        />
                        <Tooltip 
                          formatter={(value: number) => formatINRFull(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="InvoicedValue" 
                          name="Invoiced"
                          stackId="1"
                          stroke="#8b5cf6" 
                          fill="#8b5cf6"
                          fillOpacity={0.6}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="DispatchedValue" 
                          name="Dispatched"
                          stackId="1"
                          stroke="#f97316" 
                          fill="#f97316"
                          fillOpacity={0.6}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="DeliveredValue" 
                          name="Delivered"
                          stackId="1"
                          stroke="#14b8a6" 
                          fill="#14b8a6"
                          fillOpacity={0.6}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-4">
                  <h2 className="text-lg font-semibold mb-4">On-Time Delivery Rate</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData.filter(d => d.OnTimeRate !== null)}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12 }}
                          tickMargin={8}
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }} 
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip 
                          formatter={(value: number) => [`${value}%`, 'On-Time Rate']}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="OnTimeRate" 
                          name="On-Time %"
                          stroke="#3b82f6" 
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#3b82f6' }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {analytics?.creatorSeries && analytics.creatorSeries.length > 0 && (
                  <Card className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Orders Created by User</h2>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.creatorSeries.map(bucket => ({
                          ...bucket,
                          date: formatChartDate(bucket.date),
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }}
                            tickMargin={8}
                          />
                          <YAxis 
                            tick={{ fontSize: 12 }} 
                            allowDecimals={false}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          {analytics.creatorNames.map((name, index) => {
                            const colors = ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#ef4444'];
                            // Show first name only, limited to 8 characters
                            const firstName = name.split(' ')[0];
                            const displayName = firstName.length > 8 ? firstName.substring(0, 8) : firstName;
                            return (
                              <Bar 
                                key={name}
                                dataKey={name}
                                name={displayName}
                                stackId="creators"
                                fill={colors[index % colors.length]}
                              />
                            );
                          })}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {dailyTransportCost.length > 0 && (
                  <Card className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Daily Transport Cost</h2>
                    <p className="text-xs text-muted-foreground mb-2">Sum of all transport costs per day (excludes Hand Delivery and zero cost)</p>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dailyTransportCost}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 12 }}
                            tickMargin={8}
                            tickFormatter={(v) => format(parseISO(v), 'MMM d')}
                          />
                          <YAxis 
                            tick={{ fontSize: 12 }} 
                            tickFormatter={(v) => formatINR(v)}
                          />
                          <Tooltip 
                            formatter={(value: number) => [formatINRFull(value), "Transport Cost"]}
                            labelFormatter={(label) => format(parseISO(label), 'MMM d, yyyy')}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '6px'
                            }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="cost" 
                            stroke="#f97316" 
                            fill="#f97316" 
                            fillOpacity={0.3}
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                )}

                {deliveryCostSummary.totalStatusOrders > 0 && (
                  <Card className="p-4">
                    <h2 className="text-lg font-semibold mb-4">Delivery Cost Summary</h2>
                    <p className="text-xs text-muted-foreground mb-4">
                      {deliveryCostSummary.totalStatusOrders} dispatched/delivered orders total — {deliveryCostSummary.totalOrders} with transport cost, {deliveryCostSummary.noCostCount} without
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="table-delivery-cost-summary">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">Transport Company</th>
                            <th className="text-right py-2 px-3 font-medium">Transport Cost</th>
                            <th className="text-right py-2 px-3 font-medium">Order Value</th>
                            <th className="text-right py-2 px-3 font-medium">% of Value</th>
                            <th className="text-right py-2 px-3 font-medium">Orders</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveryCostSummary.summaryData.map((row, idx) => (
                            <tr key={idx} className="border-b last:border-0">
                              <td className="py-2 px-3 font-medium">{row.dispatchBy}</td>
                              <td className="py-2 px-3 text-right">{formatINRFull(row.totalCost)}</td>
                              <td className="py-2 px-3 text-right">{formatINRFull(row.orderValue)}</td>
                              <td className="py-2 px-3 text-right">{row.costPercentage.toFixed(1)}%</td>
                              <td className="py-2 px-3 text-right">{row.orderCount}</td>
                            </tr>
                          ))}
                          {deliveryCostSummary.noCostCount > 0 && (
                            <tr className="border-b last:border-0 text-muted-foreground">
                              <td className="py-2 px-3 font-medium italic">No Delivery Cost</td>
                              <td className="py-2 px-3 text-right">-</td>
                              <td className="py-2 px-3 text-right">{formatINRFull(deliveryCostSummary.noCostValue)}</td>
                              <td className="py-2 px-3 text-right">-</td>
                              <td className="py-2 px-3 text-right">{deliveryCostSummary.noCostCount}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-bold">
                            <td className="py-2 px-3">Total (with cost)</td>
                            <td className="py-2 px-3 text-right">{formatINRFull(deliveryCostSummary.grandTotal)}</td>
                            <td className="py-2 px-3 text-right">{formatINRFull(deliveryCostSummary.grandOrderValue)}</td>
                            <td className="py-2 px-3 text-right">{deliveryCostSummary.grandCostPercentage.toFixed(1)}%</td>
                            <td className="py-2 px-3 text-right">{deliveryCostSummary.totalOrders}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {deliveryCostSummary.missingCostOrders.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <h3 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-2">
                          Orders with Transport Company but No Cost ({deliveryCostSummary.missingCostOrders.length})
                        </h3>
                        <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                          <table className="w-full text-sm" data-testid="table-missing-cost-orders">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-1 px-3 font-medium">Order ID</th>
                                <th className="text-left py-1 px-3 font-medium">Party</th>
                                <th className="text-left py-1 px-3 font-medium">Transport Company</th>
                                <th className="text-right py-1 px-3 font-medium">Order Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deliveryCostSummary.missingCostOrders.map((order) => (
                                <tr key={order.id} className="border-b last:border-0">
                                  <td className="py-1 px-3">{order.id}</td>
                                  <td className="py-1 px-3">{order.partyName}</td>
                                  <td className="py-1 px-3">{order.dispatchBy}</td>
                                  <td className="py-1 px-3 text-right">{formatINRFull(parseFloat(order.total))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </Card>
                )}

                <section>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Velocity Metrics
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="p-4">
                      <h3 className="text-sm font-medium text-muted-foreground mb-4">Order Processing (Minutes)</h3>
                      <div className="h-[100px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={velocityChartDataMinutes} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              type="number" 
                              domain={[0, 'dataMax']}
                              allowDataOverflow={false}
                              tickFormatter={(value) => {
                                if (value < 0) return '0';
                                if (value >= 60) return `${Math.round(value / 60)}h`;
                                return `${Math.round(value)}m`;
                              }}
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis dataKey="stage" type="category" width={130} tick={{ fontSize: 12 }} />
                            <Tooltip
                              formatter={(value: number) => [formatDurationMinutes(value), "Avg Time"]}
                              labelFormatter={(label) => label}
                            />
                            <Bar dataKey="minutes" fill="#22c55e" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-4 mt-6">Fulfillment (Hours)</h3>
                      <div className="h-[150px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={velocityChartDataHours} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              type="number" 
                              domain={[0, 'dataMax']}
                              allowDataOverflow={false}
                              tickFormatter={(value) => {
                                if (value < 0) return '0';
                                if (value >= 24) return `${Math.round(value / 24)}d`;
                                if (value < 1) return '<1h';
                                return `${Math.round(value)}h`;
                              }}
                              tick={{ fontSize: 12 }}
                            />
                            <YAxis dataKey="stage" type="category" width={140} tick={{ fontSize: 12 }} />
                            <Tooltip
                              formatter={(value: number) => [formatDuration(value), "Avg Time"]}
                              labelFormatter={(label) => label}
                            />
                            <Bar dataKey="hours" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="text-sm font-medium text-muted-foreground mb-4">Stage Details</h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Created → Invoiced</span>
                          <div className="text-right">
                            <span className="font-medium">{formatDurationMinutes(velocityMetrics.createdToInvoiced.avgMinutes)}</span>
                            <span className="text-xs text-muted-foreground ml-2">({velocityMetrics.createdToInvoiced.count} orders)</span>
                          </div>
                        </div>
                        {velocityChartDataHours.map((item) => (
                          <div key={item.stage} className="flex items-center justify-between">
                            <span className="text-sm">{item.stage}</span>
                            <div className="text-right">
                              <span className="font-medium">{formatDuration(item.hours)}</span>
                              <span className="text-xs text-muted-foreground ml-2">({item.count} orders)</span>
                            </div>
                          </div>
                        ))}
                        <div className="pt-4 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Total Cycle Time</span>
                            <div className="text-right">
                              <span className="font-bold">{formatDuration(velocityMetrics.totalCycleTime.avgHours)}</span>
                              <span className="text-xs text-muted-foreground ml-2">({velocityMetrics.totalCycleTime.count} orders)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </section>
              </>
            )}

            {chartData.length === 0 && (
              <Card className="p-8">
                <div className="flex flex-col items-center gap-4 text-center">
                  <BarChart3 className="w-12 h-12 text-muted-foreground" />
                  <p className="text-muted-foreground">No order data available for the selected period.</p>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
