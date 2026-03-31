import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle, ListOrdered, Search, X, Filter, Download,
  Send, MessageCircle, Package, Truck, Loader2,
} from "lucide-react";
import Header from "@/components/Header";
import type { Order, OrderItem } from "@shared/schema";
import * as XLSX from "xlsx";

/* ─── constants ─── */
const ALL_BRANDS = ["Tynor", "Morison", "Karemed", "UM", "Biostige", "ACCUSURE", "Elmeric", "Blefit", "Ayouthveda"];
const DELIVERY_COMPANIES = ["Guided", "Xmaple", "Elmeric", "Guided Kol"];

/* ─── helpers ─── */
function getDateRange(preset: string): { startDate: string; endDate: string } | null {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  if (preset === "today") return { startDate: fmt(today), endDate: fmt(today) };
  if (preset === "7days") {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    return { startDate: fmt(d), endDate: fmt(today) };
  }
  if (preset === "30days") {
    const d = new Date(today); d.setDate(d.getDate() - 29);
    return { startDate: fmt(d), endDate: fmt(today) };
  }
  if (preset === "thisMonth") {
    return { startDate: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: fmt(today) };
  }
  if (preset === "lastMonth") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { startDate: fmt(first), endDate: fmt(last) };
  }
  return null; // "all" — no date filter
}

function getDefaultDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: fmt(firstDay), endDate: fmt(now) };
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(v: number | string | null | undefined) {
  const n = Number(v);
  if (!v || isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function matchesSearch(order: PortalOrder, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    (order.partyName || "").toLowerCase().includes(lower) ||
    (order.invoiceNumber || "").toLowerCase().includes(lower) ||
    (order.brand || "").toLowerCase().includes(lower) ||
    (order.createdByName || "").toLowerCase().includes(lower) ||
    (order.actualCreatorName || "").toLowerCase().includes(lower) ||
    (order.dispatchBy || "").toLowerCase().includes(lower)
  );
}

/* ─── status config ─── */
interface TabConfig {
  label: string;
  status: string;
  badgeClass: string;
  borderClass: string;
}

const ALL_TABS: TabConfig[] = [
  { label: "Needs Approval", status: "Created",     badgeClass: "bg-blue-100 text-blue-800",     borderClass: "border-blue-500 text-blue-700" },
  { label: "Approved",       status: "Approved",    badgeClass: "bg-green-100 text-green-800",   borderClass: "border-green-500 text-green-700" },
  { label: "Backordered",    status: "Backordered", badgeClass: "bg-rose-100 text-rose-800",     borderClass: "border-rose-500 text-rose-700" },
  { label: "Pending",        status: "Pending",     badgeClass: "bg-amber-100 text-amber-800",   borderClass: "border-amber-500 text-amber-700" },
  { label: "Invoiced",       status: "Invoiced",    badgeClass: "bg-purple-100 text-purple-800", borderClass: "border-purple-500 text-purple-700" },
  { label: "Dispatched",     status: "Dispatched",  badgeClass: "bg-orange-100 text-orange-800", borderClass: "border-orange-500 text-orange-700" },
  { label: "Delivered",      status: "Delivered",   badgeClass: "bg-teal-100 text-teal-800",     borderClass: "border-teal-500 text-teal-700" },
  { label: "POD Received",   status: "PODReceived", badgeClass: "bg-indigo-100 text-indigo-800", borderClass: "border-indigo-500 text-indigo-700" },
  { label: "Cancelled",      status: "Cancelled",   badgeClass: "bg-gray-100 text-gray-800",     borderClass: "border-gray-500 text-gray-700" },
  { label: "All",            status: "All",         badgeClass: "bg-muted text-foreground",      borderClass: "border-foreground" },
];

const CUSTOMER_STATUSES = new Set(["Created", "Approved", "Invoiced", "Cancelled", "All"]);

const STATUS_BADGE: Record<string, string> = {
  Created:     "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Approved:    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Backordered: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  Pending:     "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Invoiced:    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Dispatched:  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Delivered:   "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  PODReceived: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Cancelled:   "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7days" },
  { label: "30 Days", value: "30days" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "All", value: "all" },
] as const;

/* ─── bulk summary type ─── */
interface BulkGroup {
  brand: string;
  deliveryCompany: string;
  orderCount: number;
  totalValue: number;
  orders: Array<{
    id: string; partyName: string | null; total: string;
    cases: number | null; deliveryAddress: string | null;
    dispatchBy: string | null; invoiceNumber: string | null;
    invoiceDate: string | null; dispatchDate: string | null;
    estimatedDeliveryDate: string | null; actualDeliveryDate: string | null;
    actualOrderValue: string | null; deliveredOnTime: boolean | null;
  }>;
}

/* ─── types ─── */
type PortalOrder = Order & { createdByName?: string | null; actualCreatorName?: string | null };

/* ─── order detail dialog ─── */
function OrderDetailDialog({ order, open, onClose, hasAdminAccess }: {
  order: PortalOrder | null; open: boolean; onClose: () => void; hasAdminAccess: boolean;
}) {
  const { data: items, isLoading } = useQuery<OrderItem[]>({
    queryKey: [hasAdminAccess ? "/api/admin/orders" : "/api/orders", order?.id, "items"],
    queryFn: async () => {
      if (!order) return [];
      const endpoint = hasAdminAccess ? `/api/admin/orders/${order.id}` : `/api/orders/${order.id}`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch items");
      const data = await res.json();
      return data.items || [];
    },
    enabled: open && !!order,
  });
  if (!order) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>Order — {order.partyName}</span>
            <Badge className={STATUS_BADGE[order.status] || ""}>{order.status === "PODReceived" ? "POD Received" : order.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div><span className="text-muted-foreground">Brand</span><p className="font-medium">{order.brand}</p></div>
          <div><span className="text-muted-foreground">Date</span><p className="font-medium">{formatDate(order.createdAt?.toString())}</p></div>
          <div><span className="text-muted-foreground">Total</span><p className="font-medium">{formatCurrency(order.total)}</p></div>
          {order.invoiceNumber && <div><span className="text-muted-foreground">Invoice #</span><p className="font-medium">{order.invoiceNumber}</p></div>}
          {order.specialNotes && <div className="col-span-2"><span className="text-muted-foreground">Notes</span><p className="font-medium">{order.specialNotes}</p></div>}
        </div>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Free</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm">
                    <div className="font-medium">{(item as any).productName || item.productId}</div>
                    {(item as any).size && <div className="text-xs text-muted-foreground">{(item as any).size}</div>}
                  </TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.freeQuantity || "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(item.unitPrice) * item.quantity)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── main page ─── */
export default function SalesOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.isAdmin === true;
  const isBrandAdmin = user?.role === "BrandAdmin";
  const isCustomer = user?.role?.toLowerCase() === "customer";
  const hasAdminAccess = isAdmin || isBrandAdmin;
  const canApprove = !isCustomer;

  /* date range */
  const defaults = getDefaultDates();
  const [datePreset, setDatePreset] = useState<string>("thisMonth");
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  /* filters */
  const [searchQuery, setSearchQuery] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [dcFilter, setDcFilter] = useState("all");

  /* tabs / dialogs */
  const [activeTab, setActiveTab] = useState("Created");
  const [selectedOrder, setSelectedOrder] = useState<PortalOrder | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exportType, setExportType] = useState<"summary" | "details">("summary");
  const [exportStatus, setExportStatus] = useState("all");
  const [isExporting, setIsExporting] = useState(false);
  const [showBulkWA, setShowBulkWA] = useState(false);
  const [bulkType, setBulkType] = useState<"dispatched" | "delivered">("dispatched");
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split("T")[0]);

  /* brand access for BrandAdmin */
  const { data: brandAccess = [] } = useQuery<string[]>({
    queryKey: ["/api/users", user?.id, "brand-access"],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/brand-access`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.brands || [];
    },
    enabled: !!user?.id && isBrandAdmin,
  });

  /* available brands for filter dropdown */
  const availableBrands = isAdmin ? ALL_BRANDS : isBrandAdmin ? brandAccess : [];

  /* compute API date params */
  const apiDates = useMemo(() => {
    const preset = getDateRange(datePreset);
    if (!preset) return {}; // "all" — no params
    if (datePreset === "custom") return { startDate, endDate };
    return preset;
  }, [datePreset, startDate, endDate]);

  /* fetch orders */
  const queryKey = ["/api/portal/orders", apiDates, brandFilter, dcFilter];
  const { data: orders = [], isLoading } = useQuery<PortalOrder[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if ((apiDates as any).startDate) params.append("startDate", (apiDates as any).startDate);
      if ((apiDates as any).endDate) params.append("endDate", (apiDates as any).endDate);
      if (brandFilter !== "all") params.append("brand", brandFilter);
      if (dcFilter !== "all") params.append("deliveryCompany", dcFilter);
      const qs = params.toString();
      const res = await fetch(`/api/portal/orders${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  /* approve */
  const approveMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("PATCH", `/api/portal/orders/${orderId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Order approved", description: "Status changed to Approved." });
    },
    onError: (err: Error) => toast({ title: "Failed to approve", description: err.message, variant: "destructive" }),
  });

  /* bulk WA data */
  const { data: bulkSummary = [] } = useQuery<BulkGroup[]>({
    queryKey: ["/api/admin/orders/bulk-summary", bulkType, bulkDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: bulkType === "dispatched" ? "Dispatched" : "Delivered",
        fromDate: bulkDate, toDate: bulkDate,
      });
      const res = await fetch(`/api/admin/orders/bulk-summary?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin && showBulkWA,
  });

  /* tab visibility */
  const visibleTabs = useMemo(() => {
    if (isCustomer) return ALL_TABS.filter(t => CUSTOMER_STATUSES.has(t.status));
    if (isBrandAdmin) return ALL_TABS.filter(t => t.status !== "PODReceived");
    return ALL_TABS;
  }, [isCustomer, isBrandAdmin]);

  /* counts and filtered list */
  const countByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      if (matchesSearch(o, searchQuery)) {
        map[o.status] = (map[o.status] || 0) + 1;
      }
    }
    return map;
  }, [orders, searchQuery]);

  const totalSearchMatches = useMemo(() =>
    orders.filter(o => matchesSearch(o, searchQuery)).length, [orders, searchQuery]);

  const filtered = useMemo(() => {
    let list = orders.filter(o => matchesSearch(o, searchQuery));
    if (activeTab !== "All") list = list.filter(o => o.status === activeTab);
    return list;
  }, [orders, searchQuery, activeTab]);

  /* handle date preset change */
  const handlePreset = useCallback((preset: string) => {
    setDatePreset(preset);
    if (preset === "custom") return;
    const range = getDateRange(preset);
    if (range) { setStartDate(range.startDate); setEndDate(range.endDate); }
  }, []);

  /* export */
  const handleExport = async () => {
    setIsExporting(true);
    try {
      let toExport = exportStatus === "all" ? orders : orders.filter(o => o.status === exportStatus);
      if (toExport.length === 0) {
        toast({ title: "No orders match the selected filters", variant: "destructive" });
        setIsExporting(false);
        return;
      }
      const filename = `orders_${exportStatus}_${exportType}_${new Date().toISOString().split("T")[0]}.xlsx`;
      const wb = XLSX.utils.book_new();

      if (exportType === "summary") {
        const wsData: any[][] = [
          ["Order Date", "Order ID", "Party Name", "Brand", "Status", "Created By", "Order Total", "Actual Value", "Cases", "Notes", "Delivery Company", "Invoice #", "Invoice Date", "Dispatch Date", "Dispatch By"]
        ];
        toExport.forEach(o => wsData.push([
          o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "",
          o.id, o.partyName || "", o.brand || "", o.status,
          o.actualCreatorName || o.createdByName || "",
          Number(o.total) || 0,
          o.actualOrderValue ? Number(o.actualOrderValue) : "",
          o.cases || "", o.specialNotes || "", o.deliveryCompany || "",
          o.invoiceNumber || "",
          o.invoiceDate ? new Date(o.invoiceDate).toLocaleDateString() : "",
          o.dispatchDate ? new Date(o.dispatchDate).toLocaleDateString() : "",
          o.dispatchBy || "",
        ]));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "Orders Summary");
        XLSX.writeFile(wb, filename);
        toast({ title: `Exported ${toExport.length} orders (summary)` });
      } else {
        const ordersWithItems = await Promise.all(toExport.map(async (o) => {
          const endpoint = hasAdminAccess ? `/api/admin/orders/${o.id}` : `/api/orders/${o.id}`;
          const res = await fetch(endpoint, { credentials: "include" });
          const data = res.ok ? await res.json() : {};
          return { order: o, items: data.items || [] };
        }));
        const wsData: any[][] = [
          ["Order Date", "Order ID", "Party Name", "Brand", "Status", "Created By", "Product", "Size", "Qty", "Free Qty", "Unit Price", "Line Total", "Order Total", "Cases", "Invoice #", "Dispatch Date"]
        ];
        ordersWithItems.forEach(({ order: o, items }) => {
          if (items.length === 0) {
            wsData.push([o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "", o.id, o.partyName || "", o.brand || "", o.status, o.actualCreatorName || o.createdByName || "", "", "", 0, 0, 0, 0, Number(o.total) || 0, o.cases || "", o.invoiceNumber || "", o.dispatchDate ? new Date(o.dispatchDate).toLocaleDateString() : ""]);
          } else {
            items.forEach((item: any, idx: number) => wsData.push([
              idx === 0 ? (o.createdAt ? new Date(o.createdAt).toLocaleDateString() : "") : "",
              idx === 0 ? o.id : "", idx === 0 ? o.partyName || "" : "",
              idx === 0 ? o.brand || "" : "", idx === 0 ? o.status : "",
              idx === 0 ? o.actualCreatorName || o.createdByName || "" : "",
              item.productName || "", item.size || "", item.quantity, item.freeQuantity || 0,
              Number(item.unitPrice) || 0, item.quantity * (Number(item.unitPrice) || 0),
              idx === 0 ? Number(o.total) || 0 : "",
              idx === 0 ? o.cases || "" : "",
              idx === 0 ? o.invoiceNumber || "" : "",
              idx === 0 ? (o.dispatchDate ? new Date(o.dispatchDate).toLocaleDateString() : "") : "",
            ]));
          }
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "Orders Details");
        XLSX.writeFile(wb, filename);
        toast({ title: `Exported ${ordersWithItems.length} orders (details)` });
      }
      setShowExport(false);
    } catch (err) {
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  /* bulk WA send */
  const sendBulkMessage = (group: BulkGroup) => {
    const fmt = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A";
    const fmtAmt = (v: string | number | null | undefined) => {
      const n = typeof v === "string" ? parseFloat(v) : (v || 0);
      return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const msgs = group.orders.map(o => {
      if (bulkType === "dispatched") {
        return `*Order Dispatched*\n━━━━━━━━━━━━━━━━━━\n*Party:* ${o.partyName || "N/A"}\n*Brand:* ${group.brand}\n${o.dispatchDate ? `*Dispatch Date:* ${fmt(o.dispatchDate)}\n` : ""}*Actual Order Value:* ${fmtAmt(o.actualOrderValue || o.total)}\n${o.deliveryAddress ? `*Delivery Address:*\n${o.deliveryAddress}\n` : ""}${group.deliveryCompany ? `*Transport:* ${group.deliveryCompany}\n` : ""}${o.cases ? `*No. of Cases:* ${o.cases}\n` : ""}${o.estimatedDeliveryDate ? `*Estimated Delivery:* ${fmt(o.estimatedDeliveryDate)}\n` : ""}`;
      } else {
        return `*Order Delivered*\n━━━━━━━━━━━━━━━━━━\n*Party:* ${o.partyName || "N/A"}\n${o.invoiceNumber ? `*Invoice No:* ${o.invoiceNumber}\n` : ""}${o.invoiceDate ? `*Invoice Date:* ${fmt(o.invoiceDate)}\n` : ""}*Actual Order Value:* ${fmtAmt(o.actualOrderValue || o.total)}\n${o.cases ? `*No. of Cases:* ${o.cases}\n` : ""}${o.dispatchDate ? `*Dispatch Date:* ${fmt(o.dispatchDate)}\n` : ""}${o.actualDeliveryDate ? `*Delivery Date:* ${fmt(o.actualDeliveryDate)}\n` : ""}${o.deliveredOnTime != null ? `*On Time:* ${o.deliveredOnTime ? "Yes ✓" : "No ✗"}\n` : ""}${o.deliveryAddress ? `\n*Delivery Address:*\n${o.deliveryAddress}\n` : ""}`;
      }
    }).join("\n\n");
    const message = `*${group.brand} - ${group.deliveryCompany}*\n*${group.orders.length} Orders ${bulkType === "dispatched" ? "Dispatched" : "Delivered"}*\n\n${msgs}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="flex-shrink-0 sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header cartItemCount={0} onCartClick={() => {}} isAdmin={isAdmin} isBrandAdmin={isBrandAdmin} />
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full px-4 py-5">
        {/* title row */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">My Orders</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "All orders across the system" : isBrandAdmin ? "Orders for your brands" : isCustomer ? "Your order history" : "Your orders"}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowExport(true)} data-testid="button-export-orders">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowBulkWA(true)} data-testid="button-bulk-whatsapp">
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Bulk WhatsApp</span>
              </Button>
            </div>
          )}
        </div>

        <Card>
          <CardContent className="pt-4">
            {/* filter row */}
            <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b">
              {/* search */}
              <div className="relative flex-1 min-w-48 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search party, invoice, brand…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                  data-testid="input-search-orders"
                />
                {searchQuery && (
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearchQuery("")}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>

              <Filter className="w-4 h-4 text-muted-foreground hidden sm:block" />

              {/* date presets */}
              <div className="flex gap-1 flex-wrap">
                {DATE_PRESETS.map(p => (
                  <Button
                    key={p.value}
                    variant={datePreset === p.value ? "default" : "outline"}
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => handlePreset(p.value)}
                    data-testid={`button-preset-${p.value}`}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              {/* brand filter (admin + brandadmin) */}
              {hasAdminAccess && availableBrands.length > 0 && (
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="w-36 h-8" data-testid="select-brand-filter">
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {availableBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {/* delivery company filter (admin only) */}
              {isAdmin && (
                <Select value={dcFilter} onValueChange={setDcFilter}>
                  <SelectTrigger className="w-40 h-8 hidden lg:flex" data-testid="select-dc-filter">
                    <SelectValue placeholder="Delivery Co." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Delivery Co.</SelectItem>
                    {DELIVERY_COMPANIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              <span className="text-xs text-muted-foreground ml-auto">
                {searchQuery ? `${totalSearchMatches} match${totalSearchMatches !== 1 ? "es" : ""}` : `${orders.length} orders`}
              </span>
            </div>

            {/* status tabs */}
            <div className="flex gap-0 border-b mb-4 overflow-x-auto -mx-1 px-1">
              {visibleTabs.map((tab) => {
                const count = tab.status === "All"
                  ? totalSearchMatches
                  : (countByStatus[tab.status] || 0);
                const isActive = activeTab === tab.status;
                return (
                  <button
                    key={tab.status}
                    onClick={() => setActiveTab(tab.status)}
                    data-testid={`tab-status-${tab.status.toLowerCase()}`}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      isActive
                        ? `${tab.borderClass} bg-muted/40`
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                    }`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? tab.badgeClass : "bg-muted text-muted-foreground"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* table */}
            {isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ListOrdered className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>{searchQuery ? "No orders match your search" : "No orders in this category"}</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Party</TableHead>
                      <TableHead className="hidden sm:table-cell">Brand</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                      {(activeTab === "Invoiced" || activeTab === "All") && (
                        <TableHead className="hidden lg:table-cell">Invoice #</TableHead>
                      )}
                      {(activeTab === "Dispatched" || activeTab === "Delivered" || activeTab === "All") && (
                        <TableHead className="hidden lg:table-cell">Dispatch</TableHead>
                      )}
                      <TableHead className="text-right">Value</TableHead>
                      {activeTab === "All" && <TableHead>Status</TableHead>}
                      {(isAdmin || isBrandAdmin) && <TableHead className="hidden lg:table-cell">By</TableHead>}
                      {canApprove && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((order) => (
                      <TableRow key={order.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedOrder(order)} data-testid={`row-order-${order.id}`}>
                        <TableCell className="font-medium max-w-[150px] truncate">{order.partyName || "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{order.brand}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(order.createdAt?.toString())}</TableCell>
                        {(activeTab === "Invoiced" || activeTab === "All") && (
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{order.invoiceNumber || "—"}</TableCell>
                        )}
                        {(activeTab === "Dispatched" || activeTab === "Delivered" || activeTab === "All") && (
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{formatDate((order as any).dispatchDate)}</TableCell>
                        )}
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(order.total)}</TableCell>
                        {activeTab === "All" && (
                          <TableCell>
                            <Badge className={`text-xs ${STATUS_BADGE[order.status] || ""}`}>
                              {order.status === "PODReceived" ? "POD Received" : order.status}
                            </Badge>
                          </TableCell>
                        )}
                        {(isAdmin || isBrandAdmin) && (
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[120px] truncate">
                            {order.actualCreatorName || order.createdByName || "—"}
                          </TableCell>
                        )}
                        {canApprove && (
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            {order.status === "Created" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                disabled={approveMutation.isPending}
                                onClick={(e) => { e.stopPropagation(); approveMutation.mutate(order.id); }}
                                data-testid={`button-approve-${order.id}`}>
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* order detail dialog */}
      <OrderDetailDialog order={selectedOrder} open={!!selectedOrder} onClose={() => setSelectedOrder(null)} hasAdminAccess={hasAdminAccess} />

      {/* export dialog */}
      <Dialog open={showExport} onOpenChange={(v) => { setShowExport(v); if (!v) { setExportStatus("all"); setExportType("summary"); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Download className="w-5 h-5" />Export Orders</DialogTitle>
            <DialogDescription>Export the currently loaded orders to Excel.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Export Type</label>
              <div className="flex gap-2">
                {(["summary", "details"] as const).map(t => (
                  <button key={t} type="button" onClick={() => setExportType(t)}
                    className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${exportType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground hover:bg-muted"}`}
                    data-testid={`button-export-type-${t}`}>
                    {t === "summary" ? "Summary" : "Details"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {exportType === "details" ? "One row per product line item." : "One row per order — no product breakdown."}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Status Filter</label>
              <Select value={exportStatus} onValueChange={setExportStatus}>
                <SelectTrigger data-testid="select-export-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses ({orders.length})</SelectItem>
                  {["Created", "Approved", "Backordered", "Pending", "Invoiced", "Dispatched", "Delivered", "Cancelled"].map(s => {
                    const cnt = orders.filter(o => o.status === s).length;
                    return cnt > 0 ? <SelectItem key={s} value={s}>{s} ({cnt})</SelectItem> : null;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setShowExport(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={isExporting} data-testid="button-confirm-export">
              {isExporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Exporting…</> : <><Download className="w-4 h-4 mr-2" />Export</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* bulk whatsapp dialog */}
      <Dialog open={showBulkWA} onOpenChange={setShowBulkWA}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5" />Bulk WhatsApp Messages</DialogTitle>
            <DialogDescription>
              Send messages for orders {bulkType === "dispatched" ? "dispatched" : "delivered"} on the selected date.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pb-4 border-b">
            <Button variant={bulkType === "dispatched" ? "default" : "outline"} size="sm" onClick={() => setBulkType("dispatched")} data-testid="button-bulk-dispatched">
              <Truck className="w-4 h-4 mr-2" />Dispatched
            </Button>
            <Button variant={bulkType === "delivered" ? "default" : "outline"} size="sm" onClick={() => setBulkType("delivered")} data-testid="button-bulk-delivered">
              <CheckCircle className="w-4 h-4 mr-2" />Delivered
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-sm text-muted-foreground">{bulkType === "dispatched" ? "Dispatch" : "Delivery"} Date:</label>
              <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="w-auto h-8" data-testid="input-bulk-date" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 pt-2">
            {bulkSummary.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No orders {bulkType === "dispatched" ? "dispatched" : "delivered"} on selected date</p>
              </div>
            ) : (
              bulkSummary.map((group, idx) => (
                <Card key={idx} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{group.brand} — {group.deliveryCompany}</h3>
                      <p className="text-sm text-muted-foreground">{formatCurrency(group.totalValue)} · {group.orders.length} orders</p>
                    </div>
                    <Button size="sm" className="gap-2" onClick={() => sendBulkMessage(group)} data-testid={`button-send-bulk-${idx}`}>
                      <MessageCircle className="w-4 h-4" />Send
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {group.orders.slice(0, 5).map((o, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="truncate max-w-[200px]">{o.partyName || "Unknown"}</span>
                        <span>{formatCurrency(o.total)}</span>
                      </div>
                    ))}
                    {group.orders.length > 5 && <div className="italic">+{group.orders.length - 5} more…</div>}
                  </div>
                </Card>
              ))
            )}
          </div>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowBulkWA(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
