import { useState, useRef, useCallback, useEffect } from "react";
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
  Boxes,
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
  BarChart2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Save,
  History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BrandRecord } from "@shared/schema";
import * as XLSX from "xlsx";

interface ForecastSettings {
  brand: string;
  leadTimeDays: number;
  nonMovingDays: number;
  slowMovingDays: number;
}

interface SalesRow {
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
  lastSaleDate: string | null;
}

interface SalesResult {
  brand: string;
  bucketDays: number;
  results: SalesRow[];
}

interface ForecastRow extends SalesRow {
  forecastedDemand: number;
  rop: number;
  coverageDays: number | null;
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

interface PreviewRow {
  displayName: string;
  stock: number;
  matchedProductId: string | null;
  matchedProductName: string | null;
  confidence: "exact" | "partial" | "none";
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  size: string | null;
}

interface PreviewData {
  brand: string;
  rows: PreviewRow[];
  products: ProductOption[];
}

interface ConfirmResult {
  updatedCount: number;
  unmatchedCount: number;
  unmatched: Array<{ name: string; stock: number }>;
}

interface SnapshotEntry {
  id: number;
  brand: string;
  snapshotDate: string;
  createdAt: string | null;
}

interface ImportEntry {
  id: number;
  brand: string;
  importedAt: string;
  updatedCount: number | null;
  unmatchedCount: number | null;
}

type SortCol = "name" | "stock" | "totalSold90";
type ForecastSortCol = "name" | "stock" | "totalSold90" | "forecastedDemand" | "rop" | "coverageDays";
type SortDir = "asc" | "desc";

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

function ConfidenceBadge({ confidence }: { confidence: "exact" | "partial" | "none" }) {
  if (confidence === "exact") return <span className="text-xs text-green-600 font-medium">Exact</span>;
  if (confidence === "partial") return <span className="text-xs text-amber-600 font-medium">Partial</span>;
  return <span className="text-xs text-red-500 font-medium">None</span>;
}

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: SortDir }) {
  if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
}

function fmtInt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toString();
}

function fmtDec(n: number | null, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "0";
  return n.toFixed(decimals).replace(/\.0+$/, "");
}

function fmt(dt: string | null): string {
  if (!dt) return "Never";
  return new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function StockPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [settings, setSettings] = useState<ForecastSettings>({ brand: "", leadTimeDays: 2, nonMovingDays: 60, slowMovingDays: 90 });
  const [forecastDays, setForecastDays] = useState<number>(30);
  const [statusFilter, setStatusFilter] = useState<string>("Reorder Needed");
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [salesFilter, setSalesFilter] = useState<"all" | "moving">("moving");
  const [salesSort, setSalesSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "totalSold90", dir: "desc" });
  const [forecastSort, setForecastSort] = useState<{ col: ForecastSortCol; dir: SortDir }>({ col: "rop", dir: "desc" });
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showImports, setShowImports] = useState(false);

  // Preview flow state
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [editedRows, setEditedRows] = useState<Array<{ displayName: string; stock: number; matchedProductId: string | null }>>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [previewSearch, setPreviewSearch] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.isAdmin || false;

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/");
  }, [authLoading, isAdmin, navigate]);

  const { data: brands = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
    staleTime: 10 * 60 * 1000,
  });

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

  useEffect(() => {
    if (brandSettings) setSettings(brandSettings);
  }, [brandSettings]);

  const { data: salesData, isLoading: salesLoading } = useQuery<SalesResult>({
    queryKey: ["/api/stock/sales", selectedBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/sales/${encodeURIComponent(selectedBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sales data");
      return res.json();
    },
    enabled: !!selectedBrand,
    staleTime: 2 * 60 * 1000,
  });

  const { data: snapshotsData } = useQuery<{ snapshots: SnapshotEntry[] }>({
    queryKey: ["/api/stock/snapshots", selectedBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/snapshots/${encodeURIComponent(selectedBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedBrand && showSnapshots,
    staleTime: 30 * 1000,
  });

  const { data: importsData } = useQuery<{ imports: ImportEntry[] }>({
    queryKey: ["/api/stock/imports", selectedBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/imports/${encodeURIComponent(selectedBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedBrand && showImports,
    staleTime: 30 * 1000,
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (data: { leadTimeDays: number; nonMovingDays: number; slowMovingDays: number }) => {
      const res = await apiRequest("PUT", `/api/stock/settings/${encodeURIComponent(selectedBrand)}`, data);
      return res.json();
    },
    onSuccess: () => toast({ title: "Settings saved" }),
    onError: () => toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" }),
  });

  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!salesData) throw new Error("No sales data");
      const res = await apiRequest("POST", `/api/stock/sales/${encodeURIComponent(selectedBrand)}/snapshot`, { results: salesData.results });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Snapshot saved", description: "Sales analysis saved to history." });
      queryClient.invalidateQueries({ queryKey: ["/api/stock/snapshots", selectedBrand] });
    },
    onError: () => toast({ title: "Error", description: "Failed to save snapshot.", variant: "destructive" }),
  });

  // Step 1: parse file → preview
  const previewMutation = useMutation({
    mutationFn: async (file: File): Promise<PreviewData> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/stock/preview/${encodeURIComponent(selectedBrand)}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Preview failed" }));
        throw new Error(err.message || "Preview failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setEditedRows(data.rows.map(r => ({ displayName: r.displayName, stock: r.stock, matchedProductId: r.matchedProductId })));
      setPreviewSearch(data.rows.map(() => ""));
      setConfirmResult(null);
      setShowUnmatched(false);
    },
    onError: (err: Error) => toast({ title: "Preview failed", description: err.message, variant: "destructive" }),
  });

  // Step 2: confirm the edits
  const confirmMutation = useMutation({
    mutationFn: async (): Promise<ConfirmResult> => {
      const updates = editedRows
        .filter(r => r.matchedProductId)
        .map(r => ({ productId: r.matchedProductId!, stock: r.stock }));
      const unmatched = editedRows
        .filter(r => !r.matchedProductId)
        .map(r => ({ name: r.displayName, stock: r.stock }));
      const res = await apiRequest("POST", `/api/stock/confirm/${encodeURIComponent(selectedBrand)}`, { updates, unmatched });
      return res.json();
    },
    onSuccess: (data) => {
      setConfirmResult(data);
      setPreviewData(null);
      setForecastResult(null);
      toast({
        title: "Stock updated",
        description: `${data.updatedCount} products updated.${data.unmatchedCount > 0 ? ` ${data.unmatchedCount} skipped.` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stock/imports", selectedBrand] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock/sales", selectedBrand] });
    },
    onError: (err: Error) => toast({ title: "Confirm failed", description: err.message, variant: "destructive" }),
  });

  const forecastMutation = useMutation({
    mutationFn: async (): Promise<ForecastResult> => {
      const res = await apiRequest("POST", "/api/stock/forecast", { brand: selectedBrand, forecastDays });
      return res.json();
    },
    onSuccess: (data) => {
      setForecastResult(data);
      setStatusFilter("Reorder Needed");
      toast({ title: "Forecast complete", description: `${data.results.length} products analysed.` });
    },
    onError: (err: Error) => toast({ title: "Forecast failed", description: err.message, variant: "destructive" }),
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) previewMutation.mutate(file);
    e.target.value = "";
  }, [previewMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) previewMutation.mutate(file);
  }, [previewMutation]);

  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    setForecastResult(null);
    setPreviewData(null);
    setConfirmResult(null);
    setShowUnmatched(false);
    setShowSnapshots(false);
    setShowImports(false);
    setSettings({ brand, leadTimeDays: 2, nonMovingDays: 60, slowMovingDays: 90 });
  };

  const toggleSalesSort = (col: SortCol) => {
    setSalesSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  };

  const toggleForecastSort = (col: ForecastSortCol) => {
    setForecastSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  };

  const exportForecastToExcel = () => {
    if (!forecastResult) return;
    const rows = forecastResult.results.map(r => ({
      SKU: r.sku,
      Name: r.name,
      Size: r.size,
      "Current Stock": r.currentStock,
      "Sales (M1)": r.bucket1Sales,
      "Sales (M2)": r.bucket2Sales,
      "Sales (M3)": r.bucket3Sales,
      "Total Sold (90d)": r.totalSold90,
      "Avg Daily Demand": r.avgDailyDemand,
      "Smoothed Daily": r.smoothedDailyDemand,
      [`Forecast (${forecastResult.forecastDays}d)`]: r.forecastedDemand,
      "ROP": r.rop,
      "Coverage (days)": r.coverageDays ?? "∞",
      "Last Sale": r.lastSaleDate ? new Date(r.lastSaleDate).toLocaleDateString("en-IN") : "Never",
      Status: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Forecast");
    XLSX.writeFile(wb, `forecast_${forecastResult.brand}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportSalesToExcel = () => {
    if (!salesData) return;
    const rows = salesData.results.map(r => ({
      SKU: r.sku,
      Name: r.name,
      Size: r.size,
      "Current Stock": r.currentStock,
      "Sales (M1)": r.bucket1Sales,
      "Sales (M2)": r.bucket2Sales,
      "Sales (M3)": r.bucket3Sales,
      "Total Sold (90d)": r.totalSold90,
      "Avg Daily Demand": r.avgDailyDemand,
      "Smoothed Daily": r.smoothedDailyDemand,
      "Last Sale": r.lastSaleDate ? new Date(r.lastSaleDate).toLocaleDateString("en-IN") : "Never",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, `sales_${salesData.brand}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const filteredSales = (salesData?.results ?? []).filter(r =>
    salesFilter === "all" ? true : r.totalSold90 > 0
  );

  const sortedSales = [...filteredSales].sort((a, b) => {
    const dir = salesSort.dir === "asc" ? 1 : -1;
    if (salesSort.col === "name") return dir * a.name.localeCompare(b.name);
    if (salesSort.col === "stock") return dir * (a.currentStock - b.currentStock);
    return dir * (a.totalSold90 - b.totalSold90);
  });

  const filteredForecast = forecastResult?.results.filter(r =>
    statusFilter === "All" ? true : r.status === statusFilter
  ) ?? [];

  const sortedForecast = [...filteredForecast].sort((a, b) => {
    const dir = forecastSort.dir === "asc" ? 1 : -1;
    if (forecastSort.col === "name") return dir * a.name.localeCompare(b.name);
    if (forecastSort.col === "stock") return dir * (a.currentStock - b.currentStock);
    if (forecastSort.col === "totalSold90") return dir * (a.totalSold90 - b.totalSold90);
    if (forecastSort.col === "forecastedDemand") return dir * (a.forecastedDemand - b.forecastedDemand);
    if (forecastSort.col === "rop") return dir * (a.rop - b.rop);
    if (forecastSort.col === "coverageDays") return dir * ((a.coverageDays ?? 99999) - (b.coverageDays ?? 99999));
    return 0;
  });

  const statusCounts = forecastResult?.results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};

  const STATUS_TABS = ["All", "Reorder Needed", "Extra Stock", "Non-Moving", "OK"];

  if (authLoading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="w-5 h-5 text-primary" />
          <h1 className="font-semibold text-lg">Stock Forecast</h1>
        </div>
        <nav className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Orders</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/analytics")}>Analytics</Button>
        </nav>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Step 1: Brand & Settings */}
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
                  <Label className="text-sm mb-1.5 block">Extra Stock threshold (days)</Label>
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
            <div className="mt-4 flex items-center gap-3 flex-wrap">
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
                Non-moving: no sales in last {settings.nonMovingDays}d ·
                Extra stock: coverage &gt; {settings.slowMovingDays}d ·
                ROP = demand × {settings.leadTimeDays}d lead time
              </p>
            </div>
          )}
        </Card>

        {/* Step 2: Sales Analysis (auto-loads) */}
        {selectedBrand && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
                  <BarChart2 className="w-4 h-4 text-indigo-600" />
                </div>
                <h2 className="font-semibold">Step 2 — Sales Analysis (last 90 days)</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="flex rounded-md border overflow-hidden text-xs">
                  <button
                    className={`px-3 py-1.5 transition-colors ${salesFilter === "moving" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    onClick={() => setSalesFilter("moving")}
                    data-testid="tab-sales-moving"
                  >
                    With sales
                  </button>
                  <button
                    className={`px-3 py-1.5 transition-colors ${salesFilter === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    onClick={() => setSalesFilter("all")}
                    data-testid="tab-sales-all"
                  >
                    All products
                  </button>
                </div>
                {salesData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => saveSnapshotMutation.mutate()}
                    disabled={saveSnapshotMutation.isPending}
                    data-testid="button-save-snapshot"
                  >
                    {saveSnapshotMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                    Save Snapshot
                  </Button>
                )}
                {salesData && (
                  <Button variant="outline" size="sm" onClick={exportSalesToExcel} data-testid="button-export-sales">
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                )}
              </div>
            </div>

            {salesLoading ? (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading sales data…
              </div>
            ) : salesData ? (
              <>
                <div className="flex gap-4 text-sm text-muted-foreground mb-3">
                  <span>{salesData.results.length} products total</span>
                  <span>{salesData.results.filter(r => r.totalSold90 > 0).length} with sales in 90d</span>
                  <span>{fmtInt(salesData.results.reduce((s, r) => s + r.totalSold90, 0))} units sold</span>
                </div>
                <div className="overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="py-2.5 whitespace-nowrap">SKU</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap">
                          <button
                            className="flex items-center hover:text-foreground"
                            onClick={() => toggleSalesSort("name")}
                            data-testid="sort-sales-name"
                          >
                            Name
                            <SortIcon col="name" sortCol={salesSort.col} sortDir={salesSort.dir} />
                          </button>
                        </TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap">Size</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap text-right" title="Sales in 3 consecutive 30-day buckets (oldest → newest)">M1 / M2 / M3</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap text-right">
                          <button
                            className="flex items-center justify-end w-full hover:text-foreground"
                            onClick={() => toggleSalesSort("totalSold90")}
                            data-testid="sort-sales-total"
                          >
                            Total 90d
                            <SortIcon col="totalSold90" sortCol={salesSort.col} sortDir={salesSort.dir} />
                          </button>
                        </TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap text-right">Avg / Week</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap text-right">Last Sale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedSales.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No products found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedSales.map(row => (
                          <TableRow key={row.productId} data-testid={`row-sales-${row.productId}`}>
                            <TableCell className="font-mono text-xs py-2">{row.sku}</TableCell>
                            <TableCell className="py-2 max-w-[200px] truncate" title={row.name}>{row.name}</TableCell>
                            <TableCell className="py-2">{row.size || "—"}</TableCell>
                            <TableCell className="py-2 text-right text-sm text-muted-foreground">
                              {fmtInt(row.bucket1Sales)} / {fmtInt(row.bucket2Sales)} / {fmtInt(row.bucket3Sales)}
                            </TableCell>
                            <TableCell className="py-2 text-right font-medium">{fmtInt(row.totalSold90)}</TableCell>
                            <TableCell className="py-2 text-right">{fmtInt(row.avgDailyDemand * 7)}</TableCell>
                            <TableCell className="py-2 text-right text-xs text-muted-foreground">
                              {fmt(row.lastSaleDate)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}

            {/* Snapshot history */}
            {salesData && (
              <div className="mt-3">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowSnapshots(v => !v)}
                  data-testid="toggle-snapshots"
                >
                  {showSnapshots ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  <History className="w-3 h-3" />
                  Snapshot history
                </button>
                {showSnapshots && (
                  <div className="mt-2 border rounded text-xs overflow-auto max-h-40">
                    {snapshotsData?.snapshots.length === 0 ? (
                      <p className="text-muted-foreground p-3">No snapshots saved yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="py-2">Date</TableHead>
                            <TableHead className="py-2 text-right">ID</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(snapshotsData?.snapshots ?? []).map(s => (
                            <TableRow key={s.id}>
                              <TableCell className="py-1">{new Date(s.snapshotDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                              <TableCell className="py-1 text-right text-muted-foreground">#{s.id}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Step 3: Stock Upload */}
        {selectedBrand && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                <Upload className="w-4 h-4 text-teal-600" />
              </div>
              <h2 className="font-semibold">Step 3 — Upload Current Stock</h2>
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              Upload a <strong>Stock Detail (Summary)</strong> Excel export with <strong>NameToDisplay</strong> and <strong>Stock</strong> columns.
              Products are matched to <strong>{selectedBrand}</strong> by name. Review and correct matches before confirming.
            </p>

            {!previewData ? (
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
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                  data-testid="input-stock-file"
                />
                {previewMutation.isPending ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Parsing file…</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Drop your Stock Detail Excel here or click to browse</p>
                    <p className="text-xs text-muted-foreground">.xlsx or .xls · NameToDisplay + Stock columns</p>
                  </div>
                )}
              </div>
            ) : (
              /* Preview table */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{previewData.rows.length}</span> rows from file ·
                    <span className="text-green-600 ml-1">{editedRows.filter(r => r.matchedProductId).length} matched</span> ·
                    <span className="text-red-500 ml-1">{editedRows.filter(r => !r.matchedProductId).length} unmatched</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPreviewData(null); setEditedRows([]); }}
                      data-testid="button-cancel-preview"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => confirmMutation.mutate()}
                      disabled={confirmMutation.isPending || editedRows.filter(r => r.matchedProductId).length === 0}
                      data-testid="button-confirm-import"
                    >
                      {confirmMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      Confirm Import ({editedRows.filter(r => r.matchedProductId).length} products)
                    </Button>
                  </div>
                </div>

                <div className="overflow-auto rounded-lg border max-h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow className="bg-muted/50">
                        <TableHead className="py-2.5 whitespace-nowrap">File Name</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap text-right">Stock</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap">Match</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap">Matched Product</TableHead>
                        <TableHead className="py-2.5 whitespace-nowrap">Confidence</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editedRows.map((row, i) => {
                        const search = previewSearch[i] || "";
                        const filteredProducts = previewData.products.filter(p =>
                          !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
                        );
                        const originalRow = previewData.rows[i];
                        const confidence = editedRows[i].matchedProductId === originalRow.matchedProductId
                          ? originalRow.confidence
                          : "exact"; // user-overridden = treat as confirmed
                        return (
                          <TableRow key={i} data-testid={`row-preview-${i}`}
                            className={!row.matchedProductId ? "bg-red-50/50 dark:bg-red-950/10" : ""}
                          >
                            <TableCell className="py-2 max-w-[180px] text-sm" title={row.displayName}>{row.displayName}</TableCell>
                            <TableCell className="py-2 text-right font-medium">{row.stock}</TableCell>
                            <TableCell className="py-2">
                              <div className="flex flex-col gap-1">
                                <Input
                                  placeholder="Search product…"
                                  value={search}
                                  onChange={e => setPreviewSearch(prev => {
                                    const next = [...prev];
                                    next[i] = e.target.value;
                                    return next;
                                  })}
                                  className="h-7 text-xs w-40"
                                  data-testid={`input-preview-search-${i}`}
                                />
                                <select
                                  className="h-7 text-xs rounded border border-input bg-background px-2 w-40"
                                  value={row.matchedProductId || ""}
                                  onChange={e => setEditedRows(prev => {
                                    const next = [...prev];
                                    next[i] = { ...next[i], matchedProductId: e.target.value || null };
                                    return next;
                                  })}
                                  data-testid={`select-preview-product-${i}`}
                                >
                                  <option value="">Skip (unmatched)</option>
                                  {filteredProducts.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}{p.size ? ` — ${p.size}` : ""}</option>
                                  ))}
                                </select>
                              </div>
                            </TableCell>
                            <TableCell className="py-2 text-xs text-muted-foreground max-w-[160px] truncate">
                              {row.matchedProductId
                                ? previewData.products.find(p => p.id === row.matchedProductId)?.name || "—"
                                : <span className="text-red-500">Skipped</span>}
                            </TableCell>
                            <TableCell className="py-2">
                              <ConfidenceBadge confidence={editedRows[i].matchedProductId !== originalRow.matchedProductId ? "exact" : confidence} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {confirmResult && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      {confirmResult.updatedCount} products updated
                    </p>
                    {confirmResult.unmatchedCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {confirmResult.unmatchedCount} rows were skipped (unmatched).
                      </p>
                    )}
                  </div>
                </div>

                {confirmResult.unmatchedCount > 0 && (
                  <div>
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowUnmatched(v => !v)}
                    >
                      {showUnmatched ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {showUnmatched ? "Hide" : "Show"} skipped ({confirmResult.unmatchedCount})
                    </button>
                    {showUnmatched && (
                      <div className="mt-2 border rounded text-xs overflow-auto max-h-48">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="py-2">Name (from file)</TableHead>
                              <TableHead className="py-2 text-right">Stock</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {confirmResult.unmatched.map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="py-1">{row.name}</TableCell>
                                <TableCell className="py-1 text-right">{row.stock}</TableCell>
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

            {/* Upload history */}
            <div className="mt-4">
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowImports(v => !v)}
                data-testid="toggle-import-history"
              >
                {showImports ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <History className="w-3 h-3" />
                Import history
              </button>
              {showImports && (
                <div className="mt-2 border rounded text-xs overflow-auto max-h-40">
                  {importsData?.imports.length === 0 ? (
                    <p className="text-muted-foreground p-3">No imports yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-2">Date</TableHead>
                          <TableHead className="py-2 text-right">Updated</TableHead>
                          <TableHead className="py-2 text-right">Skipped</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(importsData?.imports ?? []).map(imp => (
                          <TableRow key={imp.id}>
                            <TableCell className="py-1">{new Date(imp.importedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                            <TableCell className="py-1 text-right text-green-600">{imp.updatedCount ?? 0}</TableCell>
                            <TableCell className="py-1 text-right text-red-500">{imp.unmatchedCount ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Step 4: Run Forecast */}
        {selectedBrand && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30">
                <TrendingUp className="w-4 h-4 text-orange-600" />
              </div>
              <h2 className="font-semibold">Step 4 — Run Demand Forecast</h2>
            </div>

            <div className="flex items-end gap-4 flex-wrap">
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
              {!confirmResult && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Tip: upload current stock (Step 3) before running for accurate reorder signals.
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Uses last 90 days of Invoiced/Dispatched/Delivered orders · 3-month moving average + exponential smoothing (α = 0.3).
            </p>
          </Card>
        )}

        {/* Forecast Results */}
        {forecastResult && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                  <Boxes className="w-4 h-4 text-purple-600" />
                </div>
                <h2 className="font-semibold">
                  Forecast — {forecastResult.brand} ({forecastResult.forecastDays}-day horizon)
                </h2>
              </div>
              <Button variant="outline" size="sm" onClick={exportForecastToExcel} data-testid="button-export-forecast">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>

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

            <div className="overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="whitespace-nowrap py-2.5">SKU</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5">
                      <button className="flex items-center hover:text-foreground" onClick={() => toggleForecastSort("name")} data-testid="sort-forecast-name">
                        Name<SortIcon col="name" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                      </button>
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5">Size</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">
                      <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleForecastSort("stock")} data-testid="sort-forecast-stock">
                        Stock<SortIcon col="stock" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                      </button>
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right" title="Sales in months 1/2/3 of the 90-day window">
                      <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleForecastSort("totalSold90")} data-testid="sort-forecast-total">
                        M1 / M2 / M3<SortIcon col="totalSold90" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                      </button>
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">Avg / Week</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right" title={`Forecasted demand for next ${forecastResult.forecastDays} days`}>
                      <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleForecastSort("forecastedDemand")} data-testid="sort-forecast-demand">
                        Forecast ({forecastResult.forecastDays}d)<SortIcon col="forecastedDemand" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                      </button>
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right" title={`Reorder Point = demand × ${forecastResult.leadTimeDays}d lead time`}>
                      <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleForecastSort("rop")} data-testid="sort-forecast-rop">
                        ROP<SortIcon col="rop" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                      </button>
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">
                      <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleForecastSort("coverageDays")} data-testid="sort-forecast-coverage">
                        Coverage<SortIcon col="coverageDays" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                      </button>
                    </TableHead>
                    <TableHead className="whitespace-nowrap py-2.5 text-right">Last Sale</TableHead>
                    <TableHead className="whitespace-nowrap py-2.5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedForecast.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No products in this category.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedForecast.map(row => (
                      <TableRow key={row.productId} data-testid={`row-product-${row.productId}`}>
                        <TableCell className="font-mono text-xs py-2">{row.sku}</TableCell>
                        <TableCell className="py-2 max-w-[180px] truncate" title={row.name}>{row.name}</TableCell>
                        <TableCell className="py-2">{row.size || "—"}</TableCell>
                        <TableCell className="py-2 text-right font-medium">{fmtInt(row.currentStock)}</TableCell>
                        <TableCell className="py-2 text-right text-sm text-muted-foreground">
                          {fmtInt(row.bucket1Sales)} / {fmtInt(row.bucket2Sales)} / {fmtInt(row.bucket3Sales)}
                        </TableCell>
                        <TableCell className="py-2 text-right">{fmtInt(row.avgDailyDemand * 7)}</TableCell>
                        <TableCell className="py-2 text-right font-medium">{fmtInt(row.forecastedDemand)}</TableCell>
                        <TableCell className="py-2 text-right">
                          <span className={row.status === "Reorder Needed" ? "text-red-600 font-semibold" : ""}>
                            {fmtInt(row.rop)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          {row.coverageDays === null ? "∞" : `${fmtInt(row.coverageDays)}d`}
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs text-muted-foreground">
                          {fmt(row.lastSaleDate)}
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
              Settings: Lead time {forecastResult.leadTimeDays}d · Non-moving {forecastResult.nonMovingDays}d · Extra stock {forecastResult.slowMovingDays}d coverage
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
