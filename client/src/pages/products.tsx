import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { filterProductsWithFuzzySearch } from "@/lib/fuzzySearch";
import SearchBar from "@/components/SearchBar";
import BrandFilter from "@/components/BrandFilter";
import UploadDropzone from "@/components/UploadDropzone";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Package, Pencil, Trash2, Download, Upload, ArrowLeft, Tag, Megaphone,
  Settings, TrendingUp, AlertTriangle, CheckCircle, XCircle, Loader2,
  RefreshCw, ChevronDown, ChevronRight, BarChart2, ArrowUpDown, ArrowUp,
  ArrowDown, Save, History, Boxes,
} from "lucide-react";
import { Link } from "wouter";
import * as XLSX from "xlsx";
import type { Product, BrandRecord } from "@shared/schema";

interface UploadedFile {
  name: string;
  brand: string;
  productCount: number;
}

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}

// ─── Stock / Forecast types ─────────────────────────────────────────────────
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
  avgWeeklyDemand: number;
  avgMonthlyDemand: number;
  smoothedWeeklyDemand: number;
  smoothedMonthlyDemand: number;
  unitPrice: number;
  hasPTS: boolean;
  lastSaleDate: string | null;
}

interface SalesResult {
  brand: string;
  bucket1Month: string;
  bucket2Month: string;
  bucket3Month: string;
  results: SalesRow[];
}

interface ForecastRow extends SalesRow {
  forecastedDemand: number;
  rop: number;
  coverageDays: number | null;
  status: "Non-Moving" | "Extra Stock" | "Reorder Needed" | "OK";
  stockValue: number;
  reorderValue: number;
}

interface ForecastResult {
  brand: string;
  forecastDays: number;
  leadTimeDays: number;
  nonMovingDays: number;
  slowMovingDays: number;
  bucket1Month: string;
  bucket2Month: string;
  bucket3Month: string;
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
  "Reorder Needed": { label: "Reorder Needed", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertTriangle },
  "Extra Stock": { label: "Extra Stock", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: TrendingUp },
  "Non-Moving": { label: "Non-Moving", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: XCircle },
  OK: { label: "OK", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle },
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

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string; sortDir: SortDir }) {
  if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
}

function fmtInt(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toString();
}

function fmt(dt: string | null): string {
  if (!dt) return "Never";
  return new Date(dt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

const STATUS_TABS = ["All", "Reorder Needed", "Extra Stock", "Non-Moving", "OK"];

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const isAdmin = user?.isAdmin === true;

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate("/");
  }, [authLoading, isAdmin, navigate]);

  // ─── Catalog state ───────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [showUploadSection, setShowUploadSection] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "", brand: "", sku: "", size: "", alias1: "", alias2: "",
    price: "", distributorPrice: "", stock: "",
  });

  // ─── Stock management state ──────────────────────────────────────────────
  const [stockBrand, setStockBrand] = useState<string>("");
  const [settings, setSettings] = useState<ForecastSettings>({ brand: "", leadTimeDays: 2, nonMovingDays: 60, slowMovingDays: 90 });
  const [forecastDays, setForecastDays] = useState<number>(30);
  const [statusFilter, setStatusFilter] = useState<string>("Reorder Needed");
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null);
  const [salesFilter, setSalesFilter] = useState<"all" | "moving">("moving");
  const [salesSort, setSalesSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "totalSold90", dir: "desc" });
  const [forecastSort, setForecastSort] = useState<{ col: ForecastSortCol; dir: SortDir }>({ col: "rop", dir: "desc" });
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showImports, setShowImports] = useState(false);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [editedRows, setEditedRows] = useState<Array<{ displayName: string; stock: number; matchedProductId: string | null }>>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [previewSearch, setPreviewSearch] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: popularityCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/products/popularity"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: allBrands = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
    staleTime: 10 * 60 * 1000,
  });

  const { data: brandSettings, isLoading: settingsLoading } = useQuery<ForecastSettings>({
    queryKey: ["/api/stock/settings", stockBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/settings/${encodeURIComponent(stockBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !!stockBrand,
    staleTime: 0,
  });

  useEffect(() => {
    if (brandSettings) setSettings(brandSettings);
  }, [brandSettings]);

  const { data: salesData, isLoading: salesLoading } = useQuery<SalesResult>({
    queryKey: ["/api/stock/sales", stockBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/sales/${encodeURIComponent(stockBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load sales data");
      return res.json();
    },
    enabled: !!stockBrand,
    staleTime: 2 * 60 * 1000,
  });

  const { data: snapshotsData } = useQuery<{ snapshots: SnapshotEntry[] }>({
    queryKey: ["/api/stock/snapshots", stockBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/snapshots/${encodeURIComponent(stockBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!stockBrand && showSnapshots,
    staleTime: 30 * 1000,
  });

  const { data: importsData } = useQuery<{ imports: ImportEntry[] }>({
    queryKey: ["/api/stock/imports", stockBrand],
    queryFn: async () => {
      const res = await fetch(`/api/stock/imports/${encodeURIComponent(stockBrand)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!stockBrand && showImports,
    staleTime: 30 * 1000,
  });

  // ─── Catalog mutations ───────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/products/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setUploadedFiles(prev => [...prev, {
        name: data.fileName || "uploaded-file.xlsx",
        brand: data.brand,
        productCount: data.count,
      }]);
      toast({ title: "Upload successful", description: `Imported ${data.count} products` });
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Could not parse the file", variant: "destructive" });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/products/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product updated successfully" });
      setSelectedProduct(null);
    },
    onError: () => {
      toast({ title: "Failed to update product", variant: "destructive" });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "Product deleted successfully" });
      setProductToDelete(null);
    },
    onError: () => {
      toast({ title: "Failed to delete product", variant: "destructive" });
    },
  });

  // ─── Stock mutations ─────────────────────────────────────────────────────
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: { leadTimeDays: number; nonMovingDays: number; slowMovingDays: number }) => {
      const res = await apiRequest("PUT", `/api/stock/settings/${encodeURIComponent(stockBrand)}`, data);
      return res.json();
    },
    onSuccess: () => toast({ title: "Settings saved" }),
    onError: () => toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" }),
  });

  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!salesData) throw new Error("No sales data");
      const res = await apiRequest("POST", `/api/stock/sales/${encodeURIComponent(stockBrand)}/snapshot`, { results: salesData.results });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Snapshot saved", description: "Sales analysis saved to history." });
      queryClient.invalidateQueries({ queryKey: ["/api/stock/snapshots", stockBrand] });
    },
    onError: () => toast({ title: "Error", description: "Failed to save snapshot.", variant: "destructive" }),
  });

  const previewMutation = useMutation({
    mutationFn: async (file: File): Promise<PreviewData> => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/stock/preview/${encodeURIComponent(stockBrand)}`, {
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

  const confirmMutation = useMutation({
    mutationFn: async (): Promise<ConfirmResult> => {
      const updates = editedRows.filter(r => r.matchedProductId).map(r => ({ productId: r.matchedProductId!, stock: r.stock }));
      const unmatched = editedRows.filter(r => !r.matchedProductId).map(r => ({ name: r.displayName, stock: r.stock }));
      const res = await apiRequest("POST", `/api/stock/confirm/${encodeURIComponent(stockBrand)}`, { updates, unmatched });
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
      queryClient.invalidateQueries({ queryKey: ["/api/stock/imports", stockBrand] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock/sales", stockBrand] });
    },
    onError: (err: Error) => toast({ title: "Confirm failed", description: err.message, variant: "destructive" }),
  });

  const forecastMutation = useMutation({
    mutationFn: async (): Promise<ForecastResult> => {
      const res = await apiRequest("POST", "/api/stock/forecast", { brand: stockBrand, forecastDays });
      return res.json();
    },
    onSuccess: (data) => {
      setForecastResult(data);
      setStatusFilter("Reorder Needed");
      toast({ title: "Forecast complete", description: `${data.results.length} products analysed.` });
    },
    onError: (err: Error) => toast({ title: "Forecast failed", description: err.message, variant: "destructive" }),
  });

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleStockBrandChange = (brand: string) => {
    setStockBrand(brand);
    setForecastResult(null);
    setPreviewData(null);
    setConfirmResult(null);
    setShowUnmatched(false);
    setShowSnapshots(false);
    setShowImports(false);
    setSettings({ brand, leadTimeDays: 2, nonMovingDays: 60, slowMovingDays: 90 });
  };

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

  const handleProductClick = useCallback((product: Product) => {
    setSelectedProduct(product);
    setEditFormData({
      name: product.name,
      brand: product.brand,
      sku: product.sku,
      size: product.size || "",
      alias1: (product as any).alias1 || "",
      alias2: (product as any).alias2 || "",
      price: String(product.price),
      distributorPrice: (product as any).distributorPrice ? String((product as any).distributorPrice) : "",
      stock: String(product.stock),
    });
  }, []);

  const handleSaveProduct = useCallback(() => {
    if (!selectedProduct) return;
    updateProductMutation.mutate({
      id: selectedProduct.id,
      updates: {
        name: editFormData.name,
        brand: editFormData.brand,
        sku: editFormData.sku,
        size: editFormData.size || null,
        alias1: editFormData.alias1 || null,
        alias2: editFormData.alias2 || null,
        price: editFormData.price,
        distributorPrice: editFormData.distributorPrice || null,
        stock: parseInt(editFormData.stock) || 0,
      },
    });
  }, [selectedProduct, editFormData, updateProductMutation]);

  const handleDeleteProduct = useCallback(() => {
    if (!productToDelete) return;
    deleteProductMutation.mutate(productToDelete.id);
  }, [productToDelete, deleteProductMutation]);

  const handleExportProducts = useCallback(() => {
    if (!selectedBrand) {
      toast({ title: "Please select a brand to export", variant: "destructive" });
      return;
    }
    const brandProducts = products.filter(p => p.brand === selectedBrand);
    if (brandProducts.length === 0) {
      toast({ title: `No ${selectedBrand} products found`, variant: "destructive" });
      return;
    }
    const worksheetData = [
      ["SKU", "Name", "Brand", "Size", "MRP", "PTS", "Alias 1", "Alias 2"],
      ...brandProducts.map(p => [
        p.sku, p.name, p.brand, p.size || "",
        p.price, (p as any).distributorPrice || "",
        (p as any).alias1 || "", (p as any).alias2 || "",
      ]),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${selectedBrand} Products`);
    const date = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `${selectedBrand}_Products_${date}.xlsx`);
    toast({ title: `Exported ${brandProducts.length} ${selectedBrand} products` });
  }, [products, selectedBrand, toast]);

  const handleFileUpload = useCallback((file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("brand", file.name.split(/[-_.]/)[0].toUpperCase());
    uploadMutation.mutate(formData);
  }, [uploadMutation]);

  const toggleSalesSort = (col: SortCol) => {
    setSalesSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  };

  const toggleForecastSort = (col: ForecastSortCol) => {
    setForecastSort(prev => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });
  };

  const exportSalesToExcel = () => {
    if (!salesData) return;
    const { bucket1Month: m1, bucket2Month: m2, bucket3Month: m3 } = salesData;
    const rows = salesData.results.map(r => ({
      SKU: r.sku, Name: r.name, Size: r.size, "Current Stock": r.currentStock,
      [`Sales (${m1})`]: r.bucket1Sales, [`Sales (${m2})`]: r.bucket2Sales,
      [`Sales (${m3})`]: r.bucket3Sales, "Total (3-month)": r.totalSold90,
      "Avg/Week (moving)": r.avgWeeklyDemand, "Avg/Month (moving)": r.avgMonthlyDemand,
      "Avg/Week (smoothed)": r.smoothedWeeklyDemand, "Avg/Month (smoothed)": r.smoothedMonthlyDemand,
      "Last Sale": r.lastSaleDate ? new Date(r.lastSaleDate).toLocaleDateString("en-IN") : "Never",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, `sales_${salesData.brand}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportForecastToExcel = (filterStatus?: string) => {
    if (!forecastResult) return;
    const { bucket1Month: m1, bucket2Month: m2, bucket3Month: m3 } = forecastResult;
    const sourceRows = filterStatus ? forecastResult.results.filter(r => r.status === filterStatus) : forecastResult.results;
    const rows = sourceRows.map(r => ({
      SKU: r.sku, Name: r.name, Size: r.size, "Current Stock": r.currentStock,
      [`Sales (${m1})`]: r.bucket1Sales, [`Sales (${m2})`]: r.bucket2Sales,
      [`Sales (${m3})`]: r.bucket3Sales, "Total (3-month)": r.totalSold90,
      "Avg/Week (smoothed)": r.smoothedWeeklyDemand, "Avg/Month (smoothed)": r.smoothedMonthlyDemand,
      [`Forecast (${forecastResult.forecastDays}d)`]: r.forecastedDemand,
      "ROP": r.rop, "Coverage (days)": r.coverageDays ?? "∞",
      "Last Sale": r.lastSaleDate ? new Date(r.lastSaleDate).toLocaleDateString("en-IN") : "Never",
      Status: r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Forecast");
    const suffix = filterStatus ? `_${filterStatus.replace(/\s+/g, "_")}` : "";
    XLSX.writeFile(wb, `forecast_${forecastResult.brand}${suffix}_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  // ─── Derived values ──────────────────────────────────────────────────────
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand))).sort(), [products]);
  const filteredProducts = useMemo(() =>
    filterProductsWithFuzzySearch(products, searchQuery, selectedBrand, popularityCounts),
    [products, searchQuery, selectedBrand, popularityCounts]
  );

  const filteredSales = (salesData?.results ?? []).filter(r => salesFilter === "all" ? true : r.totalSold90 > 0);
  const sortedSales = [...filteredSales].sort((a, b) => {
    const dir = salesSort.dir === "asc" ? 1 : -1;
    if (salesSort.col === "name") return dir * a.name.localeCompare(b.name);
    if (salesSort.col === "stock") return dir * (a.currentStock - b.currentStock);
    return dir * (a.totalSold90 - b.totalSold90);
  });

  const filteredForecast = forecastResult?.results.filter(r => statusFilter === "All" ? true : r.status === statusFilter) ?? [];
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

  if (authLoading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  const activeBrands = allBrands.filter(b => b.isActive);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="flex-shrink-0 sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header
            cartItemCount={0}
            onCartClick={() => {}}
            isAdmin={isAdmin}
          />
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your product catalog and stock data</p>
        </div>

        <Tabs defaultValue="catalog">
          <TabsList className="mb-6">
            <TabsTrigger value="catalog" data-testid="tab-catalog">
              <Package className="w-4 h-4 mr-2" />
              Catalog
            </TabsTrigger>
            <TabsTrigger value="stock-import" data-testid="tab-stock-import">
              <Upload className="w-4 h-4 mr-2" />
              Stock Import
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="analysis" data-testid="tab-analysis">
              <BarChart2 className="w-4 h-4 mr-2" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="forecast" data-testid="tab-forecast">
              <TrendingUp className="w-4 h-4 mr-2" />
              Forecast
            </TabsTrigger>
          </TabsList>

          {/* ─── Catalog Tab ─────────────────────────────────────────────── */}
          <TabsContent value="catalog">
            {showUploadSection ? (
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowUploadSection(false)}
                    data-testid="button-back-from-upload"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <div>
                    <h2 className="text-xl font-semibold">Upload Product Inventory</h2>
                    <p className="text-muted-foreground text-sm">
                      Import product lists from your brands. Upload Excel files (.xlsx, .xls) with columns: Brand, Name, Product SKU ID, Size, and optionally MRP.
                    </p>
                  </div>
                </div>
                <UploadDropzone
                  onFileUpload={handleFileUpload}
                  uploadedFiles={uploadedFiles}
                  onRemoveFile={(name) => setUploadedFiles(prev => prev.filter(f => f.name !== name))}
                  isUploading={uploadMutation.isPending}
                />
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-1">No products yet</p>
                <p className="text-sm mb-4">Upload an Excel file to import your product catalog.</p>
                <Button onClick={() => setShowUploadSection(true)} data-testid="button-upload-first">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Products
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex flex-col gap-3 mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <SearchBar value={searchQuery} onChange={setSearchQuery} />
                    </div>
                    <Link href="/brands">
                      <Button variant="outline" data-testid="button-manage-brands">
                        <Tag className="w-4 h-4 mr-2" />
                        Brands
                      </Button>
                    </Link>
                    <Link href="/announcements">
                      <Button variant="outline" data-testid="button-manage-announcements">
                        <Megaphone className="w-4 h-4 mr-2" />
                        Announcements
                      </Button>
                    </Link>
                    <Button variant="outline" onClick={() => setShowUploadSection(true)} data-testid="button-upload-products">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleExportProducts}
                      disabled={!selectedBrand}
                      data-testid="button-export-products"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {selectedBrand ? `Export ${selectedBrand}` : "Export"}
                    </Button>
                  </div>
                  <BrandFilter
                    brands={brands}
                    selectedBrand={selectedBrand}
                    onSelectBrand={setSelectedBrand}
                  />
                </div>

                {filteredProducts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No products match your search.</p>
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm" data-testid="product-table">
                        <thead>
                          <tr className="border-b bg-muted">
                            <th className="p-3 text-left font-medium text-muted-foreground">SKU</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Name</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Brand</th>
                            <th className="p-3 text-left font-medium text-muted-foreground">Size</th>
                            <th className="p-3 text-right font-medium text-muted-foreground">PTS</th>
                            <th className="p-3 text-right font-medium text-muted-foreground">MRP</th>
                            <th className="p-3 text-center font-medium text-muted-foreground">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredProducts.map(product => (
                            <tr
                              key={product.id}
                              className="border-b hover-elevate cursor-pointer"
                              onClick={() => handleProductClick(product)}
                              data-testid={`row-product-${product.id}`}
                            >
                              <td className="p-3 font-mono text-muted-foreground" data-testid={`text-sku-${product.id}`}>
                                {product.sku}
                              </td>
                              <td className="p-3 font-medium max-w-[200px] break-words whitespace-normal" data-testid={`text-name-${product.id}`}>
                                {product.name}
                              </td>
                              <td className="p-3" data-testid={`text-brand-${product.id}`}>{product.brand}</td>
                              <td className="p-3" data-testid={`text-size-${product.id}`}>{product.size || "-"}</td>
                              <td className="p-3 text-right" data-testid={`text-pts-${product.id}`}>
                                {(product as any).distributorPrice ? formatINR(Number((product as any).distributorPrice)) : "-"}
                              </td>
                              <td className="p-3 text-right" data-testid={`text-mrp-${product.id}`}>
                                {formatINR(Number(product.price))}
                              </td>
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1">
                                  <Button size="icon" variant="ghost" onClick={() => handleProductClick(product)} data-testid={`button-edit-${product.id}`}>
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => setProductToDelete(product)} data-testid={`button-delete-${product.id}`}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ─── Stock Import Tab ─────────────────────────────────────────── */}
          <TabsContent value="stock-import">
            <div className="max-w-4xl space-y-5">
              <Card className="p-5">
                <h2 className="font-semibold mb-4">Upload Current Stock</h2>
                <div className="mb-4">
                  <Label className="text-sm mb-1.5 block">Brand</Label>
                  <Select value={stockBrand} onValueChange={handleStockBrandChange}>
                    <SelectTrigger className="max-w-xs" data-testid="select-stock-brand">
                      <SelectValue placeholder="Select a brand…" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeBrands.map(b => (
                        <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {stockBrand && (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      Upload a <strong>Stock Detail (Summary)</strong> Excel export with <strong>NameToDisplay</strong> and <strong>Stock</strong> columns.
                      Products are matched to <strong>{stockBrand}</strong> by name.
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
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{previewData.rows.length}</span> rows ·
                            <span className="text-green-600 ml-1">{editedRows.filter(r => r.matchedProductId).length} matched</span> ·
                            <span className="text-red-500 ml-1">{editedRows.filter(r => !r.matchedProductId).length} unmatched</span>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setPreviewData(null); setEditedRows([]); }} data-testid="button-cancel-preview">
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
                                <TableHead className="py-2.5">File Name</TableHead>
                                <TableHead className="py-2.5 text-right">Stock</TableHead>
                                <TableHead className="py-2.5">Match</TableHead>
                                <TableHead className="py-2.5">Matched Product</TableHead>
                                <TableHead className="py-2.5">Confidence</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {editedRows.map((row, i) => {
                                const search = previewSearch[i] || "";
                                const filteredProds = previewData.products.filter(p =>
                                  !search || p.id === row.matchedProductId
                                  || p.name.toLowerCase().includes(search.toLowerCase())
                                  || (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
                                );
                                const originalRow = previewData.rows[i];
                                const confidence = editedRows[i].matchedProductId === originalRow.matchedProductId
                                  ? originalRow.confidence : "exact";
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
                                          onChange={e => setPreviewSearch(prev => { const next = [...prev]; next[i] = e.target.value; return next; })}
                                          className="h-7 text-xs w-40"
                                          data-testid={`input-preview-search-${i}`}
                                        />
                                        <select
                                          className="h-7 text-xs rounded border border-input bg-background px-2 w-40"
                                          value={row.matchedProductId || ""}
                                          onChange={e => setEditedRows(prev => { const next = [...prev]; next[i] = { ...next[i], matchedProductId: e.target.value || null }; return next; })}
                                          data-testid={`select-preview-product-${i}`}
                                        >
                                          <option value="">Skip (unmatched)</option>
                                          {filteredProds.map(p => (
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
                          {!importsData?.imports.length ? (
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
                                {importsData.imports.map(imp => (
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
                  </>
                )}
              </Card>
            </div>
          </TabsContent>

          {/* ─── Settings Tab ─────────────────────────────────────────────── */}
          <TabsContent value="settings">
            <div className="max-w-2xl">
              <Card className="p-5">
                <h2 className="font-semibold mb-4">Brand Forecast Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                  <div className="md:col-span-2">
                    <Label className="text-sm mb-1.5 block">Brand</Label>
                    <Select value={stockBrand} onValueChange={handleStockBrandChange}>
                      <SelectTrigger data-testid="select-brand-settings">
                        <SelectValue placeholder="Select a brand…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBrands.map(b => (
                          <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {stockBrand && (
                    <>
                      <div>
                        <Label className="text-sm mb-1.5 block">Lead Time (days)</Label>
                        <Input
                          type="number" min={0} max={365}
                          value={settings.leadTimeDays}
                          onChange={e => setSettings(s => ({ ...s, leadTimeDays: parseInt(e.target.value) || 0 }))}
                          data-testid="input-lead-time"
                        />
                      </div>
                      <div>
                        <Label className="text-sm mb-1.5 block">Non-Moving (days)</Label>
                        <Input
                          type="number" min={1} max={365}
                          value={settings.nonMovingDays}
                          onChange={e => setSettings(s => ({ ...s, nonMovingDays: parseInt(e.target.value) || 1 }))}
                          data-testid="input-non-moving-days"
                        />
                      </div>
                      <div>
                        <Label className="text-sm mb-1.5 block">Extra Stock Threshold (days)</Label>
                        <Input
                          type="number" min={1} max={3650}
                          value={settings.slowMovingDays}
                          onChange={e => setSettings(s => ({ ...s, slowMovingDays: parseInt(e.target.value) || 1 }))}
                          data-testid="input-slow-moving-days"
                        />
                      </div>
                    </>
                  )}
                </div>

                {stockBrand && (
                  <div className="mt-4 flex items-center gap-3 flex-wrap">
                    <Button
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
            </div>
          </TabsContent>

          {/* ─── Analysis Tab ─────────────────────────────────────────────── */}
          <TabsContent value="analysis">
            <div className="space-y-5">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">90-Day Sales Analysis</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={stockBrand} onValueChange={handleStockBrandChange}>
                      <SelectTrigger className="w-44" data-testid="select-brand-analysis">
                        <SelectValue placeholder="Select brand…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBrands.map(b => (
                          <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {salesData && (
                      <>
                        <Button variant="outline" size="sm" onClick={exportSalesToExcel} data-testid="button-export-sales">
                          <Download className="w-4 h-4 mr-1" />
                          Export
                        </Button>
                        <Button size="sm" onClick={() => saveSnapshotMutation.mutate()} disabled={saveSnapshotMutation.isPending} data-testid="button-save-snapshot">
                          {saveSnapshotMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                          Save Snapshot
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {stockBrand && (
                  <div className="flex rounded-md border overflow-hidden text-xs w-fit mb-4">
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
                )}

                {!stockBrand ? (
                  <p className="text-sm text-muted-foreground">Select a brand to view sales analysis.</p>
                ) : salesLoading ? (
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
                            <TableHead className="py-2.5">SKU</TableHead>
                            <TableHead className="py-2.5">
                              <button className="flex items-center hover:text-foreground" onClick={() => toggleSalesSort("name")} data-testid="sort-sales-name">
                                Name<SortIcon col="name" sortCol={salesSort.col} sortDir={salesSort.dir} />
                              </button>
                            </TableHead>
                            <TableHead className="py-2.5">Size</TableHead>
                            <TableHead className="py-2.5 text-right">
                              {salesData.bucket1Month} / {salesData.bucket2Month} / {salesData.bucket3Month}
                            </TableHead>
                            <TableHead className="py-2.5 text-right">
                              <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleSalesSort("totalSold90")} data-testid="sort-sales-total">
                                Total (3mo)<SortIcon col="totalSold90" sortCol={salesSort.col} sortDir={salesSort.dir} />
                              </button>
                            </TableHead>
                            <TableHead className="py-2.5 text-right" title="Smoothed avg weekly demand">Avg/Wk ⌛</TableHead>
                            <TableHead className="py-2.5 text-right" title="Smoothed avg monthly demand">Avg/Mo ⌛</TableHead>
                            <TableHead className="py-2.5 text-right">Last Sale</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedSales.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No products found.</TableCell>
                            </TableRow>
                          ) : sortedSales.map(row => (
                            <TableRow key={row.productId} data-testid={`row-sales-${row.productId}`}>
                              <TableCell className="font-mono text-xs py-2">{row.sku}</TableCell>
                              <TableCell className="py-2 max-w-[200px] truncate" title={row.name}>{row.name}</TableCell>
                              <TableCell className="py-2">{row.size || "—"}</TableCell>
                              <TableCell className="py-2 text-right text-sm text-muted-foreground">
                                {fmtInt(row.bucket1Sales)} / {fmtInt(row.bucket2Sales)} / {fmtInt(row.bucket3Sales)}
                              </TableCell>
                              <TableCell className="py-2 text-right font-medium">{fmtInt(row.totalSold90)}</TableCell>
                              <TableCell className="py-2 text-right">{fmtInt(row.smoothedWeeklyDemand)}</TableCell>
                              <TableCell className="py-2 text-right">{fmtInt(row.smoothedMonthlyDemand)}</TableCell>
                              <TableCell className="py-2 text-right text-xs text-muted-foreground">{fmt(row.lastSaleDate)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Snapshot history */}
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
                  </>
                ) : null}
              </Card>
            </div>
          </TabsContent>

          {/* ─── Forecast Tab ─────────────────────────────────────────────── */}
          <TabsContent value="forecast">
            <div className="space-y-5">
              <Card className="p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-orange-500" />
                  Run Demand Forecast
                </h2>
                <div className="flex items-end gap-4 flex-wrap">
                  <div>
                    <Label className="text-sm mb-1.5 block">Brand</Label>
                    <Select value={stockBrand} onValueChange={handleStockBrandChange}>
                      <SelectTrigger className="w-44" data-testid="select-brand-forecast">
                        <SelectValue placeholder="Select brand…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBrands.map(b => (
                          <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                    disabled={forecastMutation.isPending || !stockBrand}
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
                  Uses last 90 days of Invoiced / Dispatched / Delivered / POD Received orders · 3-month moving average + exponential smoothing (α = 0.3).
                </p>
              </Card>

              {forecastResult && (
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">
                      Forecast — {forecastResult.brand} ({forecastResult.forecastDays}-day horizon)
                    </h2>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" data-testid="button-export-forecast">
                          <Download className="w-4 h-4 mr-2" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => exportForecastToExcel()}>All products</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportForecastToExcel("Reorder Needed")}>Reorder Needed only</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportForecastToExcel("Non-Moving")}>Non-Moving only</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportForecastToExcel("Extra Stock")}>Extra Stock only</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Summary tiles */}
                  {(() => {
                    const results = forecastResult.results;
                    const reorderItems = results.filter(r => r.status === "Reorder Needed");
                    const nonMovingItems = results.filter(r => r.status === "Non-Moving");
                    const shortfall = reorderItems.reduce((s, r) => s + Math.max(r.rop - r.currentStock, 0), 0);
                    const reorderVal = reorderItems.reduce((s, r) => s + r.reorderValue, 0);
                    const nonMovingVal = nonMovingItems.reduce((s, r) => s + r.stockValue, 0);
                    const totalSold = results.reduce((s, r) => s + r.totalSold90, 0);
                    const movingResults = results.filter(r => r.smoothedWeeklyDemand > 0);
                    const avgWeekly = movingResults.length > 0 ? movingResults.reduce((s, r) => s + r.smoothedWeeklyDemand, 0) / movingResults.length : 0;
                    const fmtVal = (v: number) => v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(1)}K` : `₹${Math.round(v)}`;
                    const tiles = [
                      { label: "Reorder Needed", value: reorderItems.length, sub: shortfall > 0 ? `${Math.round(shortfall)} units short` : "No shortfall", extra: reorderVal > 0 ? fmtVal(reorderVal) + " to buy" : null, color: "border-red-200 bg-red-50 dark:bg-red-950/20", val: "text-red-600" },
                      { label: "OK", value: statusCounts["OK"] || 0, sub: "Adequate coverage", extra: null, color: "border-green-200 bg-green-50 dark:bg-green-950/20", val: "text-green-600" },
                      { label: "Extra Stock", value: statusCounts["Extra Stock"] || 0, sub: "Above safety level", extra: null, color: "border-amber-200 bg-amber-50 dark:bg-amber-950/20", val: "text-amber-600" },
                      { label: "Non-Moving", value: nonMovingItems.length, sub: `No sales in ${forecastResult.nonMovingDays}d`, extra: nonMovingVal > 0 ? fmtVal(nonMovingVal) + " stock value" : null, color: "border-gray-200 bg-gray-50 dark:bg-gray-800/40", val: "text-gray-600" },
                      { label: "3-Month Sales", value: Math.round(totalSold), sub: avgWeekly > 0 ? `~${Math.round(avgWeekly)}/wk smoothed` : "No sales data", extra: null, color: "border-blue-200 bg-blue-50 dark:bg-blue-950/20", val: "text-blue-600" },
                    ];
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
                        {tiles.map(t => (
                          <div key={t.label} className={`rounded-lg border p-3 ${t.color}`}>
                            <div className={`text-2xl font-bold ${t.val}`}>{t.value.toLocaleString()}</div>
                            <div className="text-xs font-medium text-foreground mt-0.5">{t.label}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</div>
                            {t.extra && <div className={`text-[11px] font-semibold mt-0.5 ${t.val}`}>{t.extra}</div>}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex flex-wrap gap-2 mb-4">
                    {STATUS_TABS.map(tab => {
                      const count = tab === "All" ? forecastResult.results.length : (statusCounts[tab] || 0);
                      return (
                        <button
                          key={tab}
                          onClick={() => setStatusFilter(tab)}
                          data-testid={`tab-status-${tab.toLowerCase().replace(/\s+/g, "-")}`}
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
                          <TableHead className="whitespace-nowrap py-2.5 text-right">
                            <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleForecastSort("totalSold90")} data-testid="sort-forecast-total">
                              {forecastResult.bucket1Month}/{forecastResult.bucket2Month}/{forecastResult.bucket3Month}
                              <SortIcon col="totalSold90" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                            </button>
                          </TableHead>
                          <TableHead className="whitespace-nowrap py-2.5 text-right" title="Smoothed weekly demand">Avg/Wk ⌛</TableHead>
                          <TableHead className="whitespace-nowrap py-2.5 text-right" title="Smoothed monthly demand">Avg/Mo ⌛</TableHead>
                          <TableHead className="whitespace-nowrap py-2.5 text-right">
                            <button className="flex items-center justify-end w-full hover:text-foreground" onClick={() => toggleForecastSort("forecastedDemand")} data-testid="sort-forecast-demand">
                              Forecast ({forecastResult.forecastDays}d)<SortIcon col="forecastedDemand" sortCol={forecastSort.col} sortDir={forecastSort.dir} />
                            </button>
                          </TableHead>
                          <TableHead className="whitespace-nowrap py-2.5 text-right">
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
                            <TableCell colSpan={12} className="text-center text-muted-foreground py-8">No products in this category.</TableCell>
                          </TableRow>
                        ) : sortedForecast.map(row => (
                          <TableRow key={row.productId} data-testid={`row-forecast-${row.productId}`}>
                            <TableCell className="font-mono text-xs py-2">{row.sku}</TableCell>
                            <TableCell className="py-2 max-w-[180px] truncate" title={row.name}>{row.name}</TableCell>
                            <TableCell className="py-2">{row.size || "—"}</TableCell>
                            <TableCell className="py-2 text-right font-medium">{fmtInt(row.currentStock)}</TableCell>
                            <TableCell className="py-2 text-right text-sm text-muted-foreground">
                              {fmtInt(row.bucket1Sales)}/{fmtInt(row.bucket2Sales)}/{fmtInt(row.bucket3Sales)}
                            </TableCell>
                            <TableCell className="py-2 text-right">{fmtInt(row.smoothedWeeklyDemand)}</TableCell>
                            <TableCell className="py-2 text-right">{fmtInt(row.smoothedMonthlyDemand)}</TableCell>
                            <TableCell className="py-2 text-right font-medium">{fmtInt(row.forecastedDemand)}</TableCell>
                            <TableCell className="py-2 text-right">
                              <span className={row.status === "Reorder Needed" ? "text-red-600 font-semibold" : ""}>{fmtInt(row.rop)}</span>
                            </TableCell>
                            <TableCell className="py-2 text-right">
                              {row.coverageDays === null ? "∞" : `${fmtInt(row.coverageDays)}d`}
                            </TableCell>
                            <TableCell className="py-2 text-right text-xs text-muted-foreground">{fmt(row.lastSaleDate)}</TableCell>
                            <TableCell className="py-2"><StatusBadge status={row.status} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Settings: Lead time {forecastResult.leadTimeDays}d · Non-moving {forecastResult.nonMovingDays}d · Extra stock {forecastResult.slowMovingDays}d coverage
                  </p>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Product Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={editFormData.name} onChange={(e) => setEditFormData(d => ({ ...d, name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="edit-brand">Brand</Label>
                <Input id="edit-brand" value={editFormData.brand} onChange={(e) => setEditFormData(d => ({ ...d, brand: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-sku">SKU</Label>
                <Input id="edit-sku" value={editFormData.sku} onChange={(e) => setEditFormData(d => ({ ...d, sku: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="edit-size">Size</Label>
                <Input id="edit-size" value={editFormData.size} onChange={(e) => setEditFormData(d => ({ ...d, size: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-alias1">Alias 1</Label>
                <Input id="edit-alias1" value={editFormData.alias1} onChange={(e) => setEditFormData(d => ({ ...d, alias1: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="edit-alias2">Alias 2</Label>
                <Input id="edit-alias2" value={editFormData.alias2} onChange={(e) => setEditFormData(d => ({ ...d, alias2: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="edit-mrp">MRP</Label>
                <Input id="edit-mrp" type="number" value={editFormData.price} onChange={(e) => setEditFormData(d => ({ ...d, price: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="edit-pts">PTS</Label>
                <Input id="edit-pts" type="number" value={editFormData.distributorPrice} onChange={(e) => setEditFormData(d => ({ ...d, distributorPrice: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="edit-stock">Stock</Label>
                <Input id="edit-stock" type="number" value={editFormData.stock} onChange={(e) => setEditFormData(d => ({ ...d, stock: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedProduct(null)}>Cancel</Button>
            <Button onClick={handleSaveProduct} disabled={updateProductMutation.isPending}>
              {updateProductMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Product Dialog */}
      <AlertDialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{productToDelete?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProduct} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteProductMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
