import { useState, useMemo, useCallback } from "react";
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
  CheckCircle,
  XCircle,
  Truck,
  Clock,
  Loader2,
  ChevronLeft,
  AlertCircle,
  BarChart3,
  Target,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { BrandRecord } from "@shared/schema";
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
import { format, parseISO } from "date-fns";

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
  approved: StatusMetric;
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

  const isAdmin = user?.isAdmin || false;
  const isBrandAdmin = user?.role === 'BrandAdmin';
  const canViewAnalytics = isAdmin || isBrandAdmin;

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
  const queryUrl = `/api/analytics/orders${queryParams ? `?${queryParams}` : ""}`;

  const { data: analytics, isLoading, isError } = useQuery<OrderAnalytics>({
    queryKey: ["/api/analytics/orders", dateRange, brandFilter],
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
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center gap-4 p-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            <h1 className="text-xl font-semibold">Order Analytics</h1>
          </div>
        </div>
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
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard
                title="Approved"
                count={analytics?.approved.count || 0}
                value={analytics?.approved.value || 0}
                icon={Clock}
                colorClass="text-green-600"
                bgClass="border-l-4 border-l-green-500"
              />
              <KPICard
                title="Dispatched"
                count={analytics?.dispatched.count || 0}
                value={analytics?.dispatched.value || 0}
                icon={Truck}
                colorClass="text-orange-600"
                bgClass="border-l-4 border-l-orange-500"
              />
              <KPICard
                title="Delivered"
                count={analytics?.delivered.count || 0}
                value={analytics?.delivered.value || 0}
                icon={CheckCircle}
                colorClass="text-teal-600"
                bgClass="border-l-4 border-l-teal-500"
              />
              <KPICard
                title="Cancelled"
                count={analytics?.cancelled.count || 0}
                value={analytics?.cancelled.value || 0}
                icon={XCircle}
                colorClass="text-gray-600"
                bgClass="border-l-4 border-l-gray-400"
              />
              <Card className="p-4 border-l-4 border-l-blue-500 col-span-2 lg:col-span-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg text-blue-600 bg-opacity-20">
                    <Target className="w-5 h-5 text-blue-600" />
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

            {chartData.length > 0 && (
              <>
                <Card className="p-4">
                  <h2 className="text-lg font-semibold mb-4">Orders by Status Over Time</h2>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12 }}
                          tickMargin={8}
                        />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend />
                        <Line 
                          type="monotone" 
                          dataKey="Created" 
                          stroke="#3b82f6" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="Invoiced" 
                          stroke="#8b5cf6" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="Dispatched" 
                          stroke="#f97316" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="Delivered" 
                          stroke="#14b8a6" 
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

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
                            return (
                              <Bar 
                                key={name}
                                dataKey={name}
                                name={name}
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
