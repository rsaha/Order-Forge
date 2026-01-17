import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
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
  ChevronLeft,
  Loader2,
  TrendingUp,
  Clock,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  XCircle,
  FileText,
  Truck,
  Package,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { BrandRecord, Order } from "@shared/schema";
import { format, differenceInHours, differenceInDays, parseISO } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface FlowMetrics {
  created: number;
  approved: number;
  invoiced: number;
  dispatched: number;
  delivered: number;
  cancelled: number;
  pending: number;
}

interface VelocityMetrics {
  createdToApproved: { avgHours: number; count: number };
  approvedToInvoiced: { avgHours: number; count: number };
  invoicedToDispatched: { avgHours: number; count: number };
  dispatchedToDelivered: { avgHours: number; count: number };
  totalCycleTime: { avgHours: number; count: number };
}

interface BlockerMetrics {
  stuckAtCreated: Order[];
  stuckAtApproved: Order[];
  stuckAtInvoiced: Order[];
  stuckAtDispatched: Order[];
}

function getDateRange(days: number): { fromDate: string; toDate: string } {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - days);
  return {
    fromDate: fromDate.toISOString().split("T")[0],
    toDate: today.toISOString().split("T")[0],
  };
}

function getThisMonthRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    fromDate: firstDay.toISOString().split("T")[0],
    toDate: today.toISOString().split("T")[0],
  };
}

function getLastMonthRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    fromDate: firstDayLastMonth.toISOString().split("T")[0],
    toDate: lastDayLastMonth.toISOString().split("T")[0],
  };
}

function formatDuration(hours: number): string {
  if (hours < 1) return "< 1 hour";
  if (hours < 24) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

const STAGE_COLORS = {
  created: "#3b82f6",
  approved: "#22c55e",
  invoiced: "#a855f7",
  dispatched: "#f97316",
  delivered: "#14b8a6",
  cancelled: "#6b7280",
};

export default function OrderInsightsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "90days" | "thisMonth" | "lastMonth" | "all">("30days");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [expandedBlocker, setExpandedBlocker] = useState<string | null>(null);

  const isAdmin = user?.isAdmin || false;
  const isBrandAdmin = user?.role === "BrandAdmin";
  const canViewInsights = isAdmin || isBrandAdmin;

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
  const ordersQueryUrl = `/api/admin/orders${queryParams ? `?${queryParams}` : ""}`;

  const { data: ordersData = [], isLoading } = useQuery<Order[]>({
    queryKey: [ordersQueryUrl],
    enabled: canViewInsights,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: brands = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const flowMetrics = useMemo((): FlowMetrics => {
    const metrics: FlowMetrics = {
      created: 0,
      approved: 0,
      invoiced: 0,
      dispatched: 0,
      delivered: 0,
      cancelled: 0,
      pending: 0,
    };
    ordersData.forEach((order) => {
      const status = order.status.toLowerCase();
      if (status === "created") metrics.created++;
      else if (status === "approved") metrics.approved++;
      else if (status === "invoiced") metrics.invoiced++;
      else if (status === "dispatched") metrics.dispatched++;
      else if (status === "delivered" || status === "podreceived") metrics.delivered++;
      else if (status === "cancelled") metrics.cancelled++;
      else if (status === "pending") metrics.pending++;
    });
    return metrics;
  }, [ordersData]);

  const velocityMetrics = useMemo((): VelocityMetrics => {
    const metrics: VelocityMetrics = {
      createdToApproved: { avgHours: 0, count: 0 },
      approvedToInvoiced: { avgHours: 0, count: 0 },
      invoicedToDispatched: { avgHours: 0, count: 0 },
      dispatchedToDelivered: { avgHours: 0, count: 0 },
      totalCycleTime: { avgHours: 0, count: 0 },
    };

    const durations = {
      createdToApproved: [] as number[],
      approvedToInvoiced: [] as number[],
      invoicedToDispatched: [] as number[],
      dispatchedToDelivered: [] as number[],
      totalCycle: [] as number[],
    };

    ordersData.forEach((order) => {
      const createdAt = order.createdAt ? new Date(order.createdAt) : null;
      const approvedAt = order.approvedAt ? new Date(order.approvedAt) : null;
      const invoiceDate = order.invoiceDate ? new Date(order.invoiceDate) : null;
      const dispatchDate = order.dispatchDate ? new Date(order.dispatchDate) : null;
      const deliveryDate = order.actualDeliveryDate ? new Date(order.actualDeliveryDate) : null;

      if (createdAt && approvedAt) {
        durations.createdToApproved.push(differenceInHours(approvedAt, createdAt));
      }
      if (approvedAt && invoiceDate) {
        durations.approvedToInvoiced.push(differenceInHours(invoiceDate, approvedAt));
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

    metrics.createdToApproved = { avgHours: avg(durations.createdToApproved), count: durations.createdToApproved.length };
    metrics.approvedToInvoiced = { avgHours: avg(durations.approvedToInvoiced), count: durations.approvedToInvoiced.length };
    metrics.invoicedToDispatched = { avgHours: avg(durations.invoicedToDispatched), count: durations.invoicedToDispatched.length };
    metrics.dispatchedToDelivered = { avgHours: avg(durations.dispatchedToDelivered), count: durations.dispatchedToDelivered.length };
    metrics.totalCycleTime = { avgHours: avg(durations.totalCycle), count: durations.totalCycle.length };

    return metrics;
  }, [ordersData]);

  const blockerMetrics = useMemo((): BlockerMetrics => {
    const now = new Date();
    const STUCK_THRESHOLDS = {
      created: 48,
      approved: 72,
      invoiced: 48,
      dispatched: 0,
    };

    const blockers: BlockerMetrics = {
      stuckAtCreated: [],
      stuckAtApproved: [],
      stuckAtInvoiced: [],
      stuckAtDispatched: [],
    };

    ordersData.forEach((order) => {
      const status = order.status.toLowerCase();
      const createdAt = order.createdAt ? new Date(order.createdAt) : null;
      const approvedAt = order.approvedAt ? new Date(order.approvedAt) : null;
      const invoiceDate = order.invoiceDate ? new Date(order.invoiceDate) : null;
      const dispatchDate = order.dispatchDate ? new Date(order.dispatchDate) : null;
      const estimatedDelivery = order.estimatedDeliveryDate ? new Date(order.estimatedDeliveryDate) : null;

      if (status === "created" && createdAt) {
        const hoursStuck = differenceInHours(now, createdAt);
        if (hoursStuck > STUCK_THRESHOLDS.created) {
          blockers.stuckAtCreated.push(order);
        }
      }
      if (status === "approved" && approvedAt) {
        const hoursStuck = differenceInHours(now, approvedAt);
        if (hoursStuck > STUCK_THRESHOLDS.approved) {
          blockers.stuckAtApproved.push(order);
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

  const funnelData = useMemo(() => {
    const total = ordersData.length;
    if (total === 0) return [];

    const completedOrders = ordersData.filter(
      (o) => ["approved", "invoiced", "dispatched", "delivered", "podreceived"].includes(o.status.toLowerCase())
    ).length;
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
      { stage: "Approved", count: completedOrders, percentage: Math.round((completedOrders / total) * 100), color: STAGE_COLORS.approved },
      { stage: "Invoiced", count: invoicedOrders, percentage: Math.round((invoicedOrders / total) * 100), color: STAGE_COLORS.invoiced },
      { stage: "Dispatched", count: dispatchedOrders, percentage: Math.round((dispatchedOrders / total) * 100), color: STAGE_COLORS.dispatched },
      { stage: "Delivered", count: deliveredOrders, percentage: Math.round((deliveredOrders / total) * 100), color: STAGE_COLORS.delivered },
    ];
  }, [ordersData]);

  const velocityChartData = useMemo(() => [
    { stage: "Created → Approved", hours: velocityMetrics.createdToApproved.avgHours, count: velocityMetrics.createdToApproved.count },
    { stage: "Approved → Invoiced", hours: velocityMetrics.approvedToInvoiced.avgHours, count: velocityMetrics.approvedToInvoiced.count },
    { stage: "Invoiced → Dispatched", hours: velocityMetrics.invoicedToDispatched.avgHours, count: velocityMetrics.invoicedToDispatched.count },
    { stage: "Dispatched → Delivered", hours: velocityMetrics.dispatchedToDelivered.avgHours, count: velocityMetrics.dispatchedToDelivered.count },
  ], [velocityMetrics]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canViewInsights) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Access Restricted</h1>
        <p className="text-muted-foreground text-center mb-4">
          Order Insights is only available to Admin and Brand Admin users.
        </p>
        <Link href="/">
          <Button variant="outline" data-testid="button-back-to-home">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  const totalBlockers =
    blockerMetrics.stuckAtCreated.length +
    blockerMetrics.stuckAtApproved.length +
    blockerMetrics.stuckAtInvoiced.length +
    blockerMetrics.stuckAtDispatched.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              <h1 className="font-semibold text-lg">Order Insights</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
              <SelectTrigger className="w-[130px]" data-testid="select-date-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days" data-testid="option-7days">Last 7 Days</SelectItem>
                <SelectItem value="30days" data-testid="option-30days">Last 30 Days</SelectItem>
                <SelectItem value="90days" data-testid="option-90days">Last 90 Days</SelectItem>
                <SelectItem value="thisMonth" data-testid="option-thisMonth">This Month</SelectItem>
                <SelectItem value="lastMonth" data-testid="option-lastMonth">Last Month</SelectItem>
                <SelectItem value="all" data-testid="option-all">All Time</SelectItem>
              </SelectContent>
            </Select>

            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="w-[120px]" data-testid="select-brand">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-brand-all">All Brands</SelectItem>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.name} data-testid={`option-brand-${brand.id}`}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6 max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Order Flow Funnel
              </h2>
              <Card className="p-4">
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
              </Card>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Velocity Metrics
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-4">Average Time at Each Stage</h3>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={velocityChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" unit="h" />
                        <YAxis dataKey="stage" type="category" width={130} tick={{ fontSize: 12 }} />
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
                    {velocityChartData.map((item) => (
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

                  {blockerMetrics.stuckAtApproved.length > 0 && (
                    <Card className="p-4 bg-green-50/50 dark:bg-green-950/20">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedBlocker(expandedBlocker === "approved" ? null : "approved")}
                        data-testid="button-toggle-approved-blockers"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <span className="font-medium">Stuck at Approved</span>
                        </div>
                        <span className="text-lg font-bold text-green-600" data-testid="text-approved-blockers-count">{blockerMetrics.stuckAtApproved.length}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Waiting for invoice &gt; 72 hours</p>
                      {expandedBlocker === "approved" && (
                        <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
                          {blockerMetrics.stuckAtApproved.slice(0, 10).map((order) => (
                            <div key={order.id} className="text-sm p-2 bg-muted rounded flex justify-between" data-testid={`row-blocker-approved-${order.id}`}>
                              <span>{order.partyName || "Unknown"}</span>
                              <span className="text-muted-foreground">
                                {order.approvedAt ? differenceInDays(new Date(), new Date(order.approvedAt)) : 0}d ago
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
          </>
        )}
      </main>
    </div>
  );
}
