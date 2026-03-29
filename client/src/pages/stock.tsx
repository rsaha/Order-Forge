import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  Upload,
  Settings,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { BrandRecord } from "@shared/schema";
import * as XLSX from "xlsx";

interface ForecastSettings {
  brand: string;
  leadTimeDays: number;
  nonMovingDays: number;
  slowMovingDays: number;
}

interface ForecastRow {
  productId: string;
  sku: string;
  name: string;
  size: string;
  currentStock: number;
  bucket1Sales: number;
  bucket2Sales: number;
  bucket3Sales: number;
  totalSold90: number;
  avgDailyDemand: number;
  smoothedDailyDemand: number;
  forecastedDemand: number;
  rop: number;
  coverageDays: number | null;
  lastSaleDate: string | null;
  status: "Non-Moving" | "Extra Stock" | "Reorder Needed" | "OK";
}

interface ForecastResult {
  brand: string;
  forecastDays: number;
  leadTimeDays: number;
  nonMovingDays: number;
  slowMovingDays: number;
  results: ForecastRow[];
}

const STATUS_CONFIG = {
  "Reorder Needed": {
    label: "Reorder Needed",
    color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    icon: AlertTriangle,
  },
  "Extra Stock": {
    label: "Extra Stock",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    icon: TrendingUp,
  },
  "Non-Moving": {
    label: "Non-Moving",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    icon: XCircle,
  },
  OK: {
    label: "OK",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: CheckCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG["OK"];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function fmt(n: number | null, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  return n.toFixed(decimals).replace(/\.0+$/, "");
}

export default function StockPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [settings, setSettings] = useState<ForecastSettings>({ brand: "", leadTimeDays: 2, nonMovingDays: 60, slowMovingDays: 90 });
  const [forecastDays, setForecastDays] = useState<number>(30);
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [uploadResult, setUploadResult] = useState<{ updatedCount: number; unmatchedCount: number; unmatched: Array<{ sku: string; size: string; stock: number }> } | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.isAdmin || false;

  if (!authLoading && !isAdmin) {
    navigate("/");
    return null;
  }

  const { data: brands = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
    staleTime: 10 * 60 * 1000,
  });

  // Load brand settings when brand changes
  const { data: brandSettings, isLoading: settingsLoading } = useQuery<ForecastSettings>({
    queryKey: ["/api/stock/settings", selectedBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/settings/${encodeURIComponent(selectedBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !!selectedBrand,
    staleTime: 0,
  });

  // Sync settings from fetched data
  const prevBrandRef = useRef<string>("");
  if (brandSettings && brandSettings.brand !== prevBrandRef.current) {
    prevBrandRef.current = brandSettings.brand;
    setSettings(brandSettings);
  }

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: { leadTimeDays: number; nonMovingDays: number; slowMovingDays: number }) => {
      const res = await apiRequest("PUT", `/api/stock/settings/${encodeURIComponent(selectedBrand)}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved", description: "Brand forecast settings updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/stock/upload/${encodeURIComponent(selectedBrand)}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setUploadResult(data);
      toast({ title: "Stock uploaded", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const forecastMutation = useMutation({
    mutationFn: async (): Promise<ForecastResult> => {
      const res = await apiRequest("POST", "/api/stock/forecast", { brand: selectedBrand, forecastDays });
      return res.json();
    },
    onSuccess: (data) => {
      setForecastResult(data);
      setStatusFilter("All");
      toast({ title: "Forecast complete", description: `${data.results.length} products analysed.` });
    },
    onError: () => {
      toast({ title: "Forecast failed", description: "Unable to run forecast.", variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadResult(null);
      uploadMutation.mutate(file);
    }
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadResult(null);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    setForecastResult(null);
    setUploadResult(null);
    setShowUnmatched(false);
    prevBrandRef.current = "";
    setSettings({ brand, leadTimeDays: 2, nonMovingDays: 60, slowMovingDays: 90 });
  };

  const exportToExcel = () => {
    if (!forecastResult) return;
    const rows = filteredResults.map(r => ({
      SKU: r.sku,
      Name: r.name,
      Size: r.size,
      "Current Stock": r.currentStock,
      "Sales (Month 1)": r.bucket1Sales,
      "Sales (Month 2)": r.bucket2Sales,
      "Sales (Month 3)": r.bucket3Sales,
      "Total Sold (90d)": r.totalSold90,
      "Avg Daily Demand": r.avgDailyDemand,
      "Smoothed Daily Demand": r.smoothedDailyDemand,
      [`Forecast (${forecastResult.forecastDays}d)`]: r.forecastedDemand,
      "Reorder Point (ROP)": r.rop,
      "Coverage (days)": r.coverageDays ?? "∞",
      "Last Sale Date": r.lastSaleDate ? new Date(r.lastSaleDate).toLocaleDateString() : "Never",
      Status: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Forecast");
    XLSX.writeFile(wb, `stock_forecast_${forecastResult.brand}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const filteredResults = forecastResult?.results.filter(r =>
    statusFilter === "All" ? true : r.status === statusFilter
  ) ?? [];

  const statusCounts = forecastResult?.results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  const STATUS_TABS = ["All", "Reorder Needed", "Extra Stock", "Non-Moving", "OK"];

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-lg">Stock Forecast</h1>
        </div>
        <nav className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Orders</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/analytics")}>Analytics</Button>
        </nav>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Step 1: Brand Selection + Settings */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
              <Settings className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="font-semibold">Step 1 — Brand & Settings</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="lg:col-span-2">
              <Label className="text-sm mb-1.5 block">Brand</Label>
              <Select value={selectedBrand} onValueChange={handleBrandChange}>
                <SelectTrigger data-testid="select-brand">
                  <SelectValue placeholder="Select a brand…" />
                </SelectTrigger>
                <SelectContent>
                  {brands.filter(b => b.isActive).map(b => (
                    <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBrand && (
              <>
                <div>
                  <Label className="text-sm mb-1.5 block">Lead Time (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={settings.leadTimeDays}
                    onChange={e => setSettings(s => ({ ...s, leadTimeDays: parseInt(e.target.value) || 0 }))}
                    data-testid="input-lead-time"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Non-Moving (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={settings.nonMovingDays}
                    onChange={e => setSettings(s => ({ ...s, nonMovingDays: parseInt(e.target.value) || 1 }))}
                    data-testid="input-non-moving-days"
                  />
                </div>
                <div>
                  <Label className="text-sm mb-1.5 block">Extra Stock (days coverage)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3650}
                    value={settings.slowMovingDays}
                    onChange={e => setSettings(s => ({ ...s, slowMovingDays: parseInt(e.target.value) || 1 }))}
                    data-testid="input-slow-moving-days"
                  />
                </div>
              </>
            )}
          </div>

          {selectedBrand && (
            <div className="mt-4 flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => saveSettingsMutation.mutate({ leadTimeDays: settings.leadTimeDays, nonMovingDays: settings.nonMovingDays, slowMovingDays: settings.slowMovingDays })}
                disabled={saveSettingsMutation.isPending}
                data-testid="button-save-settings"
              >
                {saveSettingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Settings
              </Button>
              {settingsLoading && <span className="text-xs text-muted-foreground">Loading settings…</span>}
              <p className="text-xs text-muted-foreground">
                Non-Moving: no sales in last {settings.nonMovingDays} days.
                Extra Stock: coverage &gt; {settings.slowMovingDays} days.
                ROP = Demand × {settings.leadTimeDays} day(s) lead time.
              </p>
            </div>
          )}
        </Card>

        {/* Step 2: Stock Upload */}
        {selectedBrand && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                <Upload className="w-4 h-4 text-teal-600" />
              </div>
              <h2 className="font-semibold">Step 2 — Upload Current Stock</h2>
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              Upload an Excel file with columns: <strong>SKU</strong>, <strong>Size</strong>, <strong>Stock</strong> (or "Current Stock").
              Products are matched to <strong>{selectedBrand}</strong> by SKU + Size (case-insensitive).
            </p>

            <div
              className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              data-testid="dropzone-stock"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-stock-file"
              />
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Processing…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Drop your Excel file here or click to browse</p>
                  <p className="text-xs text-muted-foreground">.xlsx or .xls</p>
                </div>
              )}
            </div>

            {uploadResult && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      {uploadResult.updatedCount} products updated
                    </p>
                    {uploadResult.unmatchedCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {uploadResult.unmatchedCount} rows could not be matched to a product.
                      </p>
                    )}
                  </div>
                </div>

                {uploadResult.unmatchedCount > 0 && (
                  <div>
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowUnmatched(v => !v)}
                    >
                      {showUnmatched ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {showUnmatched ? "Hide" : "Show"} unmatched rows ({uploadResult.unmatchedCount})
                    </button>
                    {showUnmatched && (
                      <div className="mt-2 border rounded text-xs overflow-auto max-h-48">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="py-2">SKU</TableHead>
                              <TableHead className="py-2">Size</TableHead>
                              <TableHead className="py-2">Stock</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {uploadResult.unmatched.map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="py-1">{row.sku}</TableCell>
                                <TableCell className="py-1">{row.size || "—"}</TableCell>
                                <TableCell className="py-1">{row.stock}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Step 3: Forecast */}
        {selectedBrand && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                <TrendingUp className="w-4 h-4 text-orange-600" />
              </div>
              <h2 className="font-semibold">Step 3 — Run Demand Forecast</h2>
            </div>

            <div className="flex items-end gap-4">
              <div>
                <Label className="text-sm mb-1.5 block">Forecast Horizon</Label>
                <Select value={String(forecastDays)} onValueChange={v => setForecastDays(parseInt(v))}>
                  <SelectTrigger className="w-44" data-testid="select-forecast-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[7, 14, 30, 60, 90].map(d => (
                      <SelectItem key={d} value={String(d)}>Next {d} days</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => forecastMutation.mutate()}
                disabled={forecastMutation.isPending}
                data-testid="button-run-forecast"
              >
                {forecastMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running…</>
                ) : (
                  <><RefreshCw className="w-4 h-4 mr-2" />Run Forecast</>
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Uses last 90 days of Invoiced/Dispatched/Delivered/PODReceived orders with 3-month moving average and exponential smoothing (α = 0.3).
            </p>
          </Card>
        )}

        {/* Step 4: Results */}
        {forecastResult && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                  <Package className="w-4 h-4 text-purple-600" />
                </div>
                <h2 className="font-semibold">
                  Forecast Results — {forecastResult.brand} ({forecastResult.forecastDays}-day horizon)
                </h2>
              </div>
              <Button variant="outline" size="sm" onClick={exportToExcel} data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>

            {/* Summary counts */}
            <div className="flex flex-wrap gap-2 mb-4">
              {STATUS_TABS.map(tab => {
                const count = tab === "All" ? forecastResult.results.length : (statusCounts[tab] || 0);
                return (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    data-testid={`tab-status-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${statusFilter === tab
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-muted-foreground/20 hover:border-primary/40"
                      }`}
                  >
                    {tab}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === tab ? "bg-white/20" : "bg-muted"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Results Table */}
            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap py-2.5">SKU</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5">Name</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5">Size</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">Stock</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right" title="Sales in months 1/2/3 of the 90-day window">M1 / M2 / M3</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">Avg Daily</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">Smoothed</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right" title={`Forecasted demand for next ${forecastResult.forecastDays} days`}>
                      Forecast ({forecastResult.forecastDays}d)
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right" title={`Reorder Point = Smoothed × ${forecastResult.leadTimeDays}d lead time`}>
                      ROP
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">Coverage</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">Last Sale</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        No products in this category.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredResults.map(row => (
                      <TableRow key={row.productId} data-testid={`row-product-${row.productId}`}>
                        <TableCell className="font-mono text-xs py-2">{row.sku}</TableCell>
                        <TableCell className="py-2 max-w-[180px] truncate" title={row.name}>{row.name}</TableCell>
                        <TableCell className="py-2">{row.size || "—"}</TableCell>
                        <TableCell className="py-2 text-right font-medium">{row.currentStock}</TableCell>
                        <TableCell className="py-2 text-right text-sm text-muted-foreground">
                          {row.bucket1Sales} / {row.bucket2Sales} / {row.bucket3Sales}
                        </TableCell>
                        <TableCell className="py-2 text-right">{fmt(row.avgDailyDemand, 2)}</TableCell>
                        <TableCell className="py-2 text-right">{fmt(row.smoothedDailyDemand, 2)}</TableCell>
                        <TableCell className="py-2 text-right font-medium">{row.forecastedDemand}</TableCell>
                        <TableCell className="py-2 text-right">
                          <span className={row.currentStock < row.rop && row.status === "Reorder Needed" ? "text-red-600 font-semibold" : ""}>
                            {row.rop}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          {row.coverageDays === null ? "∞" : `${row.coverageDays}d`}
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs text-muted-foreground">
                          {row.lastSaleDate
                            ? new Date(row.lastSaleDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
                            : "Never"}
                        </TableCell>
                        <TableCell className="py-2">
                          <StatusBadge status={row.status} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Settings used: Lead time {forecastResult.leadTimeDays}d · Non-moving threshold {forecastResult.nonMovingDays}d · Extra stock threshold {forecastResult.slowMovingDays}d coverage
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
