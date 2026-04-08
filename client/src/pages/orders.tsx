import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { filterProductsWithFuzzySearch } from "@/lib/fuzzySearch";
import Header from "@/components/Header";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import TransportPredictionTab, { AssignedGroup as TransportAssignedGroup } from "@/components/TransportPredictionTab";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Package,
  Calendar,
  Truck,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronDown,
  AlertCircle,
  Download,
  Plus,
  Search,
  Minus,
  Trash2,
  MessageCircle,
  Filter,
  Send,
  Pencil,
  Check,
  X,
  Upload,
  GitBranch,
  ClipboardCheck,
  FileSpreadsheet,
  ArrowRight,
  Calculator,
  Globe,
} from "lucide-react";
import { generateWhatsAppMessage, openWhatsApp, type WhatsAppMessageType } from "@/lib/whatsapp";
import { Link, useLocation } from "wouter";
import type { Order, OrderStatus, Product } from "@shared/schema";
import { DELIVERY_COMPANY_OPTIONS } from "@shared/schema";
import * as XLSX from "xlsx";

const ORDER_STATUSES: OrderStatus[] = ["Online", "Created", "Approved", "Backordered", "Pending", "Invoiced", "Dispatched", "Delivered", "PODReceived", "Cancelled"];

const statusColors: Record<OrderStatus, string> = {
  Online: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  Created: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Backordered: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  Invoiced: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Dispatched: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Delivered: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  PODReceived: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const tabColors: Record<OrderStatus, string> = {
  Online: "border-cyan-500 text-cyan-700 dark:text-cyan-300",
  Created: "border-blue-500 text-blue-700 dark:text-blue-300",
  Approved: "border-green-500 text-green-700 dark:text-green-300",
  Backordered: "border-rose-500 text-rose-700 dark:text-rose-300",
  Invoiced: "border-purple-500 text-purple-700 dark:text-purple-300",
  Pending: "border-amber-500 text-amber-700 dark:text-amber-300",
  Dispatched: "border-orange-500 text-orange-700 dark:text-orange-300",
  Delivered: "border-teal-500 text-teal-700 dark:text-teal-300",
  PODReceived: "border-indigo-500 text-indigo-700 dark:text-indigo-300",
  Cancelled: "border-gray-500 text-gray-700 dark:text-gray-300",
};

const tabBgColors: Record<OrderStatus, string> = {
  Online: "bg-cyan-50 dark:bg-cyan-950",
  Created: "bg-blue-50 dark:bg-blue-950",
  Approved: "bg-green-50 dark:bg-green-950",
  Backordered: "bg-rose-50 dark:bg-rose-950",
  Invoiced: "bg-purple-50 dark:bg-purple-950",
  Pending: "bg-amber-50 dark:bg-amber-950",
  Dispatched: "bg-orange-50 dark:bg-orange-950",
  Delivered: "bg-teal-50 dark:bg-teal-950",
  PODReceived: "bg-indigo-50 dark:bg-indigo-950",
  Cancelled: "bg-gray-50 dark:bg-gray-950",
};

const statusIcons: Record<OrderStatus, typeof Package> = {
  Online: Globe,
  Created: FileText,
  Approved: Clock,
  Backordered: Package,
  Invoiced: FileText,
  Pending: AlertCircle,
  Dispatched: Truck,
  Delivered: CheckCircle,
  PODReceived: CheckCircle,
  Cancelled: XCircle,
};

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatINR(amount: string | number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(Number(amount));
}

function formatCreatedBy(order: any): string {
  const ownerName = order.createdByName || order.createdByEmail || "-";
  const actualCreator = order.actualCreatorName;
  
  if (actualCreator && actualCreator !== order.createdByName) {
    return `${ownerName} (by ${actualCreator})`;
  }
  return ownerName;
}

interface OrderEditFormData {
  status: OrderStatus;
  partyName: string;
  deliveryAddress: string;
  deliveryCompany: string;
  invoiceNumber: string;
  invoiceDate: string;
  dispatchDate: string;
  dispatchBy: string;
  cases: string;
  specialNotes: string;
  estimatedDeliveryDate: string;
  actualDeliveryDate: string;
  deliveryCost: string;
  deliveryNote: string;
  actualOrderValue: string;
  deliveredOnTime: boolean;
}

const BRANDS = ["Tynor", "Morison", "Karemed", "UM", "Biostige", "ACCUSURE", "Elmeric", "Blefit", "Ayouthveda"];
const DELIVERY_COMPANIES = ["Guided", "Xmaple", "Elmeric", "Guided Kol"];

function getDateRange(days: number): { fromDate: string; toDate: string } {
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - days);
  return {
    fromDate: fromDate.toISOString().split('T')[0],
    toDate: today.toISOString().split('T')[0],
  };
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
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

function getThisMonthRange(): { fromDate: string; toDate: string } {
  const today = new Date();
  const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    fromDate: firstDayThisMonth.toISOString().split('T')[0],
    toDate: today.toISOString().split('T')[0],
  };
}

interface CashDeskDebtorData {
  debtorId?: string;
  name?: string;
  Name?: string;
  location?: string;
  salesOwner?: string;
  creditLimit?: number;
  outstandingAmount?: number;
  outstandingOverdue?: number;
  availableCredit?: number;
  creditStatus?: string;
  matchPercent?: number;
  isActive?: boolean;
}

interface BulkOrderSummary {
  brand: string;
  deliveryCompany: string;
  status: string;
  orderCount: number;
  totalValue: number;
  totalCases: number;
  orders: Array<{
    id: string;
    partyName: string | null;
    total: string;
    cases: number | null;
    deliveryAddress: string | null;
    dispatchBy: string | null;
    deliveryCompany: string | null;
    invoiceNumber: string | null;
    invoiceDate: string | null;
    dispatchDate: string | null;
    estimatedDeliveryDate: string | null;
    actualDeliveryDate: string | null;
    actualOrderValue: string | null;
    deliveredOnTime: boolean | null;
  }>;
}

function getNextStatus(status: OrderStatus): OrderStatus | null {
  const transitions: Partial<Record<OrderStatus, OrderStatus>> = {
    Created: "Invoiced",
    Approved: "Invoiced",
    Backordered: "Invoiced",
    Pending: "Invoiced",
    Invoiced: "Dispatched",
    Dispatched: "Delivered",
  };
  return transitions[status] ?? null;
}

export default function OrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showTransportTab, setShowTransportTab] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("Created");
  const [deliveryCompanyFilter, setDeliveryCompanyFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "lastMonth" | "thisMonth" | "today" | "all">("7days");
  const [showBulkWhatsApp, setShowBulkWhatsApp] = useState(false);
  const [bulkType, setBulkType] = useState<"dispatched" | "delivered">("dispatched");
  const [bulkDate, setBulkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editFormData, setEditFormData] = useState<OrderEditFormData>({
    status: "Created",
    partyName: "",
    deliveryAddress: "",
    deliveryCompany: "",
    invoiceNumber: "",
    invoiceDate: "",
    dispatchDate: "",
    dispatchBy: "",
    cases: "",
    specialNotes: "",
    estimatedDeliveryDate: "",
    actualDeliveryDate: "",
    deliveryCost: "",
    deliveryNote: "",
    actualOrderValue: "",
    deliveredOnTime: false,
  });
  const [orderItems, setOrderItems] = useState<Array<{ id: string; productName?: string | null; size?: string | null; quantity: number; freeQuantity?: number; unitPrice: string }>>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemQty, setEditingItemQty] = useState<number>(0);
  const [editingItemFreeQty, setEditingItemFreeQty] = useState<number>(0);
  
  const [showAddItems, setShowAddItems] = useState(false);
  const [addItemsSearch, setAddItemsSearch] = useState("");
  const [itemsToAdd, setItemsToAdd] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToShare, setOrderToShare] = useState<{ order: Order; status: OrderStatus } | null>(null);
  const [shareDate, setShareDate] = useState<string>("");
  const [pendingWhatsAppShare, setPendingWhatsAppShare] = useState<{ order: Order; status: OrderStatus } | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBrand, setImportBrand] = useState<string>("Biostige");
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    count: number;
    skipped: number;
    totalDetected?: number;
    duplicates?: string[];
    skippedReasons?: string[];
  } | null>(null);
  const [importPreview, setImportPreview] = useState<{
    totalDetected: number;
    willImport: number;
    willSkip: number;
    customers: Array<{
      partyName: string;
      invoiceNumber: string | null;
      invoiceDate: string | null;
      netAmount: number;
      totalProducts: number;
      matchedProducts: number;
      unmatchedProducts: number;
      unmatchedNames: string[];
      isDuplicate: boolean;
      willImport: boolean;
      skipReason: string | null;
    }>;
  } | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>("all");
  const [exportBrands, setExportBrands] = useState<string[]>([]);
  const [exportType, setExportType] = useState<"summary" | "details">("details");
  const [isExporting, setIsExporting] = useState(false);
  const [orderForPendingCreation, setOrderForPendingCreation] = useState<Order | null>(null);
  
  // Quick Advance state (admin only)
  const [advanceOrder, setAdvanceOrder] = useState<Order | null>(null);
  const [advancePartyName, setAdvancePartyName] = useState<string>("");
  const [showPartyVerifyDialog, setShowPartyVerifyDialog] = useState(false);
  const [advanceVerifyStatus, setAdvanceVerifyStatus] = useState<"idle" | "verifying" | "verified" | "not_found" | "error">("idle");
  const [advanceVerifyMatches, setAdvanceVerifyMatches] = useState<CashDeskDebtorData[]>([]);
  const advanceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceAbortRef = useRef<AbortController | null>(null);

  // Dispatch transport dialog state (Invoiced → Dispatched)
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [dispatchTransportStatus, setDispatchTransportStatus] = useState<"loading" | "found" | "not_found" | "error">("loading");
  const [dispatchTransportData, setDispatchTransportData] = useState<{
    name?: string;
    matchPercent?: number;
    transportOption?: string;
    costPerCarton?: number | null;
    location?: string;
    salesOwner?: string;
  } | null>(null);

  // Created→Invoiced mandatory fields
  const [advanceInvoiceNumber, setAdvanceInvoiceNumber] = useState("");
  const [advanceInvoiceDate, setAdvanceInvoiceDate] = useState("");
  const [advanceActualValue, setAdvanceActualValue] = useState("");

  // Invoiced→Dispatched mandatory fields
  const [dispatchBy, setDispatchBy] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [dispatchCases, setDispatchCases] = useState("");
  const [dispatchDeliveryCompany, setDispatchDeliveryCompany] = useState("");
  const [dispatchEstimatedDate, setDispatchEstimatedDate] = useState("");

  // Bulk transport dispatch dialog (Transport tab → Dispatch All)
  const [transportBulkGroup, setTransportBulkGroup] = useState<TransportAssignedGroup | null>(null);
  const [bdDispatchBy, setBdDispatchBy] = useState("");
  const [bdDispatchDate, setBdDispatchDate] = useState("");
  const [bdDeliveryCompany, setBdDeliveryCompany] = useState("");
  const [bdEstimatedDate, setBdEstimatedDate] = useState("");

  // Dispatched→Delivered dialog
  const [showDeliveredDialog, setShowDeliveredDialog] = useState(false);
  const [deliveredOrder, setDeliveredOrder] = useState<Order | null>(null);
  const [deliveredActualDate, setDeliveredActualDate] = useState("");

  // Split Delivery Cost dialog state (admin only)
  const [showSplitCostDialog, setShowSplitCostDialog] = useState(false);
  const [splitStep, setSplitStep] = useState<1 | 2 | 3>(1);
  const [splitDateFilter, setSplitDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);
  const [splitCompanyFilter, setSplitCompanyFilter] = useState<string>("all");
  const [splitSelectedIds, setSplitSelectedIds] = useState<Set<string>>(new Set());
  const [splitCosts, setSplitCosts] = useState({ transportCar: "", parking: "", food: "", loadingUnloading: "", truck: "" });

  // Party verification state (admin only for Invoiced orders)
  const [showVerifyParty, setShowVerifyParty] = useState(false);
  const [verifyPartyName, setVerifyPartyName] = useState("");
  const [verifyPartyResult, setVerifyPartyResult] = useState<{
    verified: boolean;
    found: boolean;
    verifiedName?: string;
    outstandingAmount?: number;
    creditLimit?: number;
    availableCredit?: number;
    creditStatus?: string;
    location?: string;
    message?: string;
  } | null>(null);

  const isAdmin = user?.isAdmin || false;
  const isBrandAdmin = user?.role === 'BrandAdmin';
  const hasAdminAccess = isAdmin || isBrandAdmin;

  const { data: allOrders = [], isLoading } = useQuery<Order[]>({
    queryKey: [hasAdminAccess ? "/api/admin/orders" : "/api/orders", deliveryCompanyFilter, brandFilter, dateRange],
    queryFn: async () => {
      if (hasAdminAccess) {
        const params = new URLSearchParams();
        if (deliveryCompanyFilter !== "all") {
          params.append("deliveryCompany", deliveryCompanyFilter);
        }
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
        } else if (dateRange === "lastMonth") {
          const range = getLastMonthRange();
          params.append("fromDate", range.fromDate);
          params.append("toDate", range.toDate);
        } else if (dateRange === "thisMonth") {
          const range = getThisMonthRange();
          params.append("fromDate", range.fromDate);
          params.append("toDate", range.toDate);
        } else if (dateRange === "today") {
          const today = getTodayDate();
          params.append("fromDate", today);
          params.append("toDate", today);
        }
        const queryString = params.toString();
        const url = queryString ? `/api/admin/orders?${queryString}` : "/api/admin/orders";
        
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch orders");
        const data: Order[] = await res.json();
        
        return data.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
      } else {
        const res = await fetch("/api/orders", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch orders");
        const data: Order[] = await res.json();
        
        let sorted = data.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        
        if (deliveryCompanyFilter !== "all") {
          sorted = sorted.filter(o => o.deliveryCompany === deliveryCompanyFilter);
        }
        
        if (brandFilter !== "all") {
          sorted = sorted.filter(o => o.brand === brandFilter);
        }
        
        if (dateRange === "7days") {
          const range = getDateRange(7);
          const fromDate = new Date(range.fromDate);
          sorted = sorted.filter(o => {
            const orderDate = new Date(o.createdAt || 0);
            return orderDate >= fromDate;
          });
        } else if (dateRange === "30days") {
          const range = getDateRange(30);
          const fromDate = new Date(range.fromDate);
          sorted = sorted.filter(o => {
            const orderDate = new Date(o.createdAt || 0);
            return orderDate >= fromDate;
          });
        } else if (dateRange === "lastMonth") {
          const range = getLastMonthRange();
          const fromDate = new Date(range.fromDate);
          const toDate = new Date(range.toDate);
          toDate.setHours(23, 59, 59, 999);
          sorted = sorted.filter(o => {
            const orderDate = new Date(o.createdAt || 0);
            return orderDate >= fromDate && orderDate <= toDate;
          });
        } else if (dateRange === "thisMonth") {
          const range = getThisMonthRange();
          const fromDate = new Date(range.fromDate);
          sorted = sorted.filter(o => {
            const orderDate = new Date(o.createdAt || 0);
            return orderDate >= fromDate;
          });
        } else if (dateRange === "today") {
          const today = getTodayDate();
          sorted = sorted.filter(o => {
            const orderDate = (o.createdAt || '').toString().split('T')[0];
            return orderDate === today;
          });
        }
        
        return sorted;
      }
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes - all users can modify Created orders
    refetchOnWindowFocus: false,
  });

  // Filter orders by search query across all statuses (respecting all active filters),
  // or by current status tab. PODReceived orders are only visible to Admin users.
  const orders = useMemo(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      return allOrders.filter(o => {
        if (o.status === "PODReceived" && !isAdmin) return false;
        const partyMatch = o.partyName?.toLowerCase().includes(query);
        const invoiceMatch = o.invoiceNumber?.toLowerCase().includes(query);
        const createdByName = (o as any).createdByName?.toLowerCase().includes(query);
        const createdByEmail = (o as any).createdByEmail?.toLowerCase().includes(query);
        const dispatchByMatch = o.dispatchBy?.toLowerCase().includes(query);
        return partyMatch || invoiceMatch || createdByName || createdByEmail || dispatchByMatch;
      });
    }
    return allOrders.filter(o => o.status === statusFilter);
  }, [allOrders, searchQuery, statusFilter, isAdmin]);
  
  // Count orders by status for tab badges
  const statusCounts: Record<OrderStatus, number> = {
    Online: allOrders.filter(o => o.status === "Online").length,
    Created: allOrders.filter(o => o.status === "Created").length,
    Approved: allOrders.filter(o => o.status === "Approved").length,
    Backordered: allOrders.filter(o => o.status === "Backordered").length,
    Invoiced: allOrders.filter(o => o.status === "Invoiced").length,
    Pending: allOrders.filter(o => o.status === "Pending").length,
    Dispatched: allOrders.filter(o => o.status === "Dispatched").length,
    Delivered: allOrders.filter(o => o.status === "Delivered").length,
    PODReceived: allOrders.filter(o => o.status === "PODReceived").length,
    Cancelled: allOrders.filter(o => o.status === "Cancelled").length,
  };

  // Create a lookup map: parentOrderId -> pending order (for showing pending indicators)
  const pendingOrderLookup = useMemo(() => {
    const lookup = new Map<string, Order>();
    allOrders
      .filter(o => o.status === "Pending" && o.parentOrderId)
      .forEach(pendingOrder => {
        lookup.set(pendingOrder.parentOrderId!, pendingOrder);
      });
    return lookup;
  }, [allOrders]);

  const { data: userBrandAccess = [] } = useQuery<string[]>({
    queryKey: ["/api/users", user?.id, "brand-access"],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await fetch(`/api/users/${user.id}/brand-access`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.brands || [];
    },
    enabled: !!user?.id && !isAdmin,
    staleTime: 10 * 60 * 1000,
  });

  const userBrands = useMemo(() => {
    if (isAdmin) return ['all'] as string[];
    return userBrandAccess;
  }, [isAdmin, userBrandAccess]);

  const { data: bulkSummary = [] } = useQuery<BulkOrderSummary[]>({
    queryKey: ["/api/admin/orders/bulk-summary", bulkType, bulkDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("status", bulkType === "dispatched" ? "Dispatched" : "Delivered");
      params.append("fromDate", bulkDate);
      params.append("toDate", bulkDate);
      
      const res = await fetch(`/api/admin/orders/bulk-summary?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bulk summary");
      return res.json();
    },
    enabled: !!user && hasAdminAccess && showBulkWhatsApp,
    staleTime: 1 * 60 * 1000, // 1 minute for bulk summary
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<OrderEditFormData> }) => {
      const payload: Record<string, unknown> = {};
      if (updates.status) payload.status = updates.status;
      if (updates.partyName !== undefined) payload.partyName = updates.partyName || null;
      if (updates.deliveryAddress !== undefined) payload.deliveryAddress = updates.deliveryAddress || null;
      if (updates.invoiceNumber !== undefined) payload.invoiceNumber = updates.invoiceNumber || null;
      if (updates.invoiceDate !== undefined) payload.invoiceDate = updates.invoiceDate || null;
      if (updates.dispatchDate !== undefined) payload.dispatchDate = updates.dispatchDate || null;
      if (updates.dispatchBy !== undefined) payload.dispatchBy = updates.dispatchBy || null;
      if (updates.cases !== undefined) payload.cases = updates.cases ? parseInt(updates.cases) : null;
      if (updates.specialNotes !== undefined) payload.specialNotes = updates.specialNotes || null;
      if (updates.estimatedDeliveryDate !== undefined) payload.estimatedDeliveryDate = updates.estimatedDeliveryDate || null;
      if (updates.actualDeliveryDate !== undefined) payload.actualDeliveryDate = updates.actualDeliveryDate || null;
      if (updates.deliveryCost !== undefined) payload.deliveryCost = updates.deliveryCost || null;
      if (updates.deliveryNote !== undefined) payload.deliveryNote = updates.deliveryNote || null;
      if (updates.deliveryCompany !== undefined) payload.deliveryCompany = updates.deliveryCompany || null;
      if (updates.actualOrderValue !== undefined) payload.actualOrderValue = updates.actualOrderValue || null;

      return apiRequest("PATCH", `/api/admin/orders/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order updated successfully" });
      setSelectedOrder(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update order", description: error.message, variant: "destructive" });
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products/by-brand", selectedOrder?.brand],
    enabled: !!user && showAddItems && !!selectedOrder?.brand,
    staleTime: 5 * 60 * 1000, // 5 minutes - products rarely change
    refetchOnWindowFocus: false,
  });

  // Live CashDesk party lookup for advance dialog (debounced + stale-response protected)
  // Initial lookup (dialog just opened with prefilled name) fires immediately; subsequent
  // keystrokes are debounced 500ms to avoid hammering the API.
  const advanceIsFirstLookupRef = useRef(true);
  useEffect(() => {
    if (!showPartyVerifyDialog) {
      advanceIsFirstLookupRef.current = true;
      return;
    }
    if (advanceDebounceRef.current) clearTimeout(advanceDebounceRef.current);
    if (advanceAbortRef.current) advanceAbortRef.current.abort();
    const name = advancePartyName.trim();
    if (!name || name.length < 2) {
      setAdvanceVerifyStatus("idle");
      setAdvanceVerifyMatches([]);
      return;
    }
    setAdvanceVerifyStatus("verifying");

    const doLookup = () => {
      const controller = new AbortController();
      advanceAbortRef.current = controller;
      fetch(`/api/verify/debtor?name=${encodeURIComponent(name)}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (res) => {
          if (controller.signal.aborted) return;
          if (res.ok) {
            const data = await res.json();
            if (controller.signal.aborted) return;
            if ((data.verified || data.found) && Array.isArray(data.matches) && data.matches.length > 0) {
              setAdvanceVerifyStatus("verified");
              setAdvanceVerifyMatches(data.matches as CashDeskDebtorData[]);
            } else {
              setAdvanceVerifyStatus("not_found");
              setAdvanceVerifyMatches([]);
            }
          } else {
            if (!controller.signal.aborted) {
              setAdvanceVerifyStatus("error");
              setAdvanceVerifyMatches([]);
            }
          }
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setAdvanceVerifyStatus("error");
          setAdvanceVerifyMatches([]);
        });
    };

    if (advanceIsFirstLookupRef.current) {
      advanceIsFirstLookupRef.current = false;
      doLookup();
    } else {
      advanceDebounceRef.current = setTimeout(doLookup, 500);
    }

    return () => {
      if (advanceDebounceRef.current) clearTimeout(advanceDebounceRef.current);
      if (advanceAbortRef.current) advanceAbortRef.current.abort();
    };
  }, [advancePartyName, showPartyVerifyDialog]);

  // Fetch product popularity counts for smart sorting in Add Items dialog
  const { data: popularityCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/products/popularity"],
    enabled: !!user && showAddItems,
    staleTime: 10 * 60 * 1000, // 10 minutes - doesn't need frequent updates
    refetchOnWindowFocus: false,
  });

  const addItemsMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: string; items: Array<{ productId: string; quantity: number }> }) => {
      return apiRequest("POST", `/api/orders/${orderId}/items`, { items });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Items added successfully" });
      setShowAddItems(false);
      setItemsToAdd([]);
      setAddItemsSearch("");
      
      if (selectedOrder) {
        // Use appropriate endpoint based on user access level
        const endpoint = hasAdminAccess 
          ? `/api/admin/orders/${selectedOrder.id}` 
          : `/api/orders/${selectedOrder.id}`;
        const res = await fetch(endpoint, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setOrderItems(data.items || []);
          setSelectedOrder({ ...selectedOrder, total: data.total });
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add items", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("DELETE", `/api/orders/${orderId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Order deleted successfully" });
      setOrderToDelete(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete order", description: error.message, variant: "destructive" });
      setOrderToDelete(null);
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async ({ id, status, partyName, invoiceNumber, invoiceDate, actualOrderValue, dispatchByVal, dispatchDateVal, casesVal, deliveryCompanyVal, estimatedDeliveryDateVal, actualDeliveryDateVal }: {
      id: string; status: string; partyName?: string;
      invoiceNumber?: string; invoiceDate?: string; actualOrderValue?: string;
      dispatchByVal?: string; dispatchDateVal?: string; casesVal?: string; deliveryCompanyVal?: string; estimatedDeliveryDateVal?: string;
      actualDeliveryDateVal?: string;
    }) => {
      const payload: Record<string, unknown> = { status };
      if (partyName !== undefined) payload.partyName = partyName;
      if (invoiceNumber) payload.invoiceNumber = invoiceNumber;
      if (invoiceDate) payload.invoiceDate = invoiceDate;
      if (actualOrderValue) payload.actualOrderValue = actualOrderValue;
      if (dispatchByVal) payload.dispatchBy = dispatchByVal;
      if (dispatchDateVal) payload.dispatchDate = dispatchDateVal;
      if (casesVal) payload.cases = parseInt(casesVal);
      if (deliveryCompanyVal) payload.deliveryCompany = deliveryCompanyVal;
      if (estimatedDeliveryDateVal) payload.estimatedDeliveryDate = estimatedDeliveryDateVal;
      if (actualDeliveryDateVal) payload.actualDeliveryDate = actualDeliveryDateVal;
      return apiRequest("PATCH", `/api/admin/orders/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setAdvanceOrder(null);
      setShowPartyVerifyDialog(false);
      setShowDispatchDialog(false);
      setDispatchOrder(null);
      setDispatchTransportData(null);
      setDispatchTransportStatus("loading");
      setShowDeliveredDialog(false);
      setDeliveredOrder(null);
      setDeliveredActualDate("");
      toast({ title: "Order advanced successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to advance order", description: error.message, variant: "destructive" });
    },
  });

  const bulkTransportDispatchMutation = useMutation({
    // Cases are intentionally omitted: each order already has its own case count.
    // Applying a single shared value would overwrite individual order data.
    mutationFn: async ({ orderIds, dispatchByVal, dispatchDateVal, deliveryCompanyVal, estimatedDeliveryDateVal }: {
      orderIds: string[]; dispatchByVal: string; dispatchDateVal: string;
      deliveryCompanyVal: string; estimatedDeliveryDateVal: string;
    }) => {
      const payload: Record<string, unknown> = { status: "Dispatched" };
      if (dispatchByVal) payload.dispatchBy = dispatchByVal;
      if (dispatchDateVal) payload.dispatchDate = dispatchDateVal;
      if (deliveryCompanyVal) payload.deliveryCompany = deliveryCompanyVal;
      if (estimatedDeliveryDateVal) payload.estimatedDeliveryDate = estimatedDeliveryDateVal;
      return Promise.all(orderIds.map(id => apiRequest("PATCH", `/api/admin/orders/${id}`, payload)));
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      setTransportBulkGroup(null);
      toast({ title: `Dispatched ${vars.orderIds.length} order(s) successfully` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to dispatch orders", description: error.message, variant: "destructive" });
    },
  });

  function handleDispatchGroup(group: TransportAssignedGroup) {
    setTransportBulkGroup(group);
    setBdDispatchBy(group.dispatchBy);
    setBdDispatchDate(new Date().toISOString().split("T")[0]);
    setBdDeliveryCompany("");
    setBdEstimatedDate("");
  }

  function handleAdvanceClick(order: Order, e: React.MouseEvent) {
    e.stopPropagation();
    const nextStatus = getNextStatus(order.status as OrderStatus);
    if (!nextStatus) return;
    if (order.status === "Created" || order.status === "Approved" || order.status === "Backordered" || order.status === "Pending") {
      setAdvanceOrder(order);
      setAdvancePartyName(order.partyName || "");
      setAdvanceVerifyStatus("idle");
      setAdvanceVerifyMatches([]);
      setAdvanceInvoiceNumber("");
      setAdvanceInvoiceDate("");
      setAdvanceActualValue("");
      setShowPartyVerifyDialog(true);
    } else if (order.status === "Invoiced") {
      setDispatchOrder(order);
      setDispatchTransportStatus("loading");
      setDispatchTransportData(null);
      setDispatchBy("");
      setDispatchDate("");
      setDispatchCases("");
      setDispatchDeliveryCompany(order.deliveryCompany || "");
      setDispatchEstimatedDate("");
      setShowDispatchDialog(true);
      const partyName = order.partyName || "";
      if (partyName.length >= 2) {
        fetch(`/api/transport/debtor?name=${encodeURIComponent(partyName)}`, { credentials: "include" })
          .then(r => r.ok ? r.json() : Promise.reject(r.status))
          .then(data => {
            if (data.found && data.match) {
              setDispatchTransportData(data.match);
              setDispatchTransportStatus("found");
            } else {
              setDispatchTransportStatus("not_found");
            }
          })
          .catch(() => setDispatchTransportStatus("error"));
      } else {
        setDispatchTransportStatus("not_found");
      }
    } else if (order.status === "Dispatched") {
      setDeliveredOrder(order);
      setDeliveredActualDate("");
      setShowDeliveredDialog(true);
    } else {
      advanceMutation.mutate({ id: order.id, status: nextStatus });
    }
  }

  const updateItemMutation = useMutation({
    mutationFn: async ({ orderId, itemId, quantity, freeQuantity }: { orderId: string; itemId: string; quantity: number; freeQuantity: number }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/items/${itemId}`, { quantity, freeQuantity });
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Item updated" });
      setEditingItemId(null);
      
      if (selectedOrder && data.order) {
        setSelectedOrder({ ...selectedOrder, total: data.order.total });
        // Refresh order items
        const endpoint = hasAdminAccess ? `/api/admin/orders/${selectedOrder.id}` : `/api/orders/${selectedOrder.id}`;
        const res = await fetch(endpoint, { credentials: "include" });
        if (res.ok) {
          const orderData = await res.json();
          setOrderItems(orderData.items || []);
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update item", description: error.message, variant: "destructive" });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async ({ orderId, itemId }: { orderId: string; itemId: string }) => {
      return apiRequest("DELETE", `/api/orders/${orderId}/items/${itemId}`);
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Item removed" });
      
      if (selectedOrder && data.order) {
        setSelectedOrder({ ...selectedOrder, total: data.order.total });
        // Refresh order items
        const endpoint = hasAdminAccess ? `/api/admin/orders/${selectedOrder.id}` : `/api/orders/${selectedOrder.id}`;
        const res = await fetch(endpoint, { credentials: "include" });
        if (res.ok) {
          const orderData = await res.json();
          setOrderItems(orderData.items || []);
        }
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove item", description: error.message, variant: "destructive" });
    },
  });

  const updatePodStatusMutation = useMutation({
    mutationFn: async ({ orderId, podStatus }: { orderId: string; podStatus: string }): Promise<Order> => {
      const isPodReceived = podStatus === "Received" || podStatus === "Digital Received";
      const payload: Record<string, any> = { podStatus };
      // Only send podTimestamp when marking as received (not when clearing)
      if (isPodReceived) {
        payload.podTimestamp = new Date().toISOString();
      }
      const res = await apiRequest("PATCH", `/api/admin/orders/${orderId}`, payload);
      return res.json();
    },
    onSuccess: (data: Order, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "POD status updated successfully" });
      const isPodReceived = variables.podStatus === "Received" || variables.podStatus === "Digital Received";
      if (selectedOrder) {
        setSelectedOrder({ 
          ...selectedOrder, 
          podStatus: variables.podStatus,
          podTimestamp: isPodReceived ? new Date() : selectedOrder.podTimestamp,
          status: data.status || selectedOrder.status
        } as Order);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update POD status", description: error.message, variant: "destructive" });
    },
  });

  const createPendingOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/orders/${orderId}/pending`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Pending order created successfully", description: "A new order with out-of-stock items has been created." });
      setOrderForPendingCreation(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create pending order", description: error.message, variant: "destructive" });
      setOrderForPendingCreation(null);
    },
  });

  // Verify party name mutation (admin only)
  const verifyPartyMutation = useMutation({
    mutationFn: async ({ orderId, partyName, updateOrder }: { orderId: string; partyName?: string; updateOrder?: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/orders/${orderId}/verify-party`, { partyName, updateOrder });
      return res.json();
    },
    onSuccess: (data) => {
      setVerifyPartyResult(data);
      if (data.partyUpdated && selectedOrder) {
        setSelectedOrder({ ...selectedOrder, partyName: data.verifiedName });
        setEditFormData({ ...editFormData, partyName: data.verifiedName });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        toast({ title: "Party name updated", description: `Updated to: ${data.verifiedName}` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to verify party", description: error.message, variant: "destructive" });
      setVerifyPartyResult({ verified: false, found: false, message: error.message });
    },
  });

  const splitCostMutation = useMutation({
    mutationFn: async (payload: { orderIds: string[]; transportCar: number; parking: number; food: number; loadingUnloading: number; truck: number }) => {
      const res = await apiRequest("POST", "/api/admin/orders/split-delivery-cost", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: `Delivery cost split across ${data.results.length} orders`, description: `Total: ${formatINR(data.totalCost)} across ${data.totalCases} cartons` });
      setShowSplitCostDialog(false);
      setSplitStep(1);
      setSplitSelectedIds(new Set());
      setSplitCosts({ transportCar: "", parking: "", food: "", loadingUnloading: "", truck: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to split delivery cost", description: error.message, variant: "destructive" });
    },
  });

  const handleVerifyParty = (updateOrder: boolean = false) => {
    if (!selectedOrder) return;
    verifyPartyMutation.mutate({
      orderId: selectedOrder.id,
      partyName: verifyPartyName || undefined,
      updateOrder,
    });
  };

  const canDeleteOrder = (order: Order): boolean => {
    if (!['Online', 'Created'].includes(order.status)) return false;
    if (isAdmin) return true;
    return order.userId === user?.id;
  };

  const handleDeleteClick = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrderToDelete(order);
  };

  const confirmDelete = () => {
    if (orderToDelete) {
      deleteMutation.mutate(orderToDelete.id);
    }
  };

  const handleOrderClick = async (order: Order) => {
    setSelectedOrder(order);
    const normalizedStatus = ORDER_STATUSES.find(s => s.toLowerCase() === (order.status || "created").toLowerCase()) || "Created";
    setEditFormData({
      status: normalizedStatus,
      partyName: order.partyName || "",
      deliveryAddress: order.deliveryAddress || "",
      deliveryCompany: order.deliveryCompany || "",
      invoiceNumber: order.invoiceNumber || "",
      invoiceDate: order.invoiceDate ? new Date(order.invoiceDate).toISOString().split("T")[0] : "",
      dispatchDate: order.dispatchDate ? new Date(order.dispatchDate).toISOString().split("T")[0] : "",
      dispatchBy: order.dispatchBy || "",
      cases: order.cases?.toString() || "",
      specialNotes: order.specialNotes || "",
      estimatedDeliveryDate: order.estimatedDeliveryDate ? new Date(order.estimatedDeliveryDate).toISOString().split("T")[0] : "",
      actualDeliveryDate: order.actualDeliveryDate ? new Date(order.actualDeliveryDate).toISOString().split("T")[0] : "",
      deliveryCost: order.deliveryCost || "",
      deliveryNote: order.deliveryNote || "",
      actualOrderValue: order.actualOrderValue || "",
      deliveredOnTime: order.deliveredOnTime ?? false,
    });
    
    setLoadingItems(true);
    try {
      // Use admin endpoint for admins/brand admins, regular endpoint for users
      const endpoint = hasAdminAccess 
        ? `/api/admin/orders/${order.id}` 
        : `/api/orders/${order.id}`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOrderItems(data.items || []);
      }
    } catch {
      setOrderItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleInlineStatusUpdate = async (order: Order, newStatus: OrderStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // For Invoiced or Dispatched status, open the flyout to require mandatory fields
    if (newStatus === "Invoiced" || newStatus === "Dispatched") {
      handleOrderClick(order);
      // Set status so validation shows required fields
      setTimeout(() => {
        setEditFormData(prev => ({ ...prev, status: newStatus }));
      }, 100);
      toast({ title: "Please fill in invoice details", description: "Invoice Number, Invoice Date, and Actual Order Value are required." });
      return;
    }
    
    try {
      await apiRequest("PATCH", `/api/admin/orders/${order.id}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: `Order status updated to ${newStatus}` });
      
      if (newStatus === "Delivered") {
        setPendingWhatsAppShare({ order: { ...order, status: newStatus }, status: newStatus });
        handleOrderClick({ ...order, status: newStatus });
      }
    } catch (error: any) {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    }
  };

  const handleSave = () => {
    if (!selectedOrder) return;
    
    // Validate mandatory fields when status is Invoiced or Dispatched
    if (editFormData.status === "Invoiced" || editFormData.status === "Dispatched") {
      const missingFields: string[] = [];
      if (!editFormData.invoiceNumber?.trim()) missingFields.push("Invoice Number");
      if (!editFormData.invoiceDate?.trim()) missingFields.push("Invoice Date");
      if (!editFormData.actualOrderValue?.trim()) missingFields.push("Actual Order Value");
      
      if (missingFields.length > 0) {
        toast({
          title: "Required fields missing",
          description: `Please fill in: ${missingFields.join(", ")}`,
          variant: "destructive",
        });
        return;
      }
    }
    
    updateMutation.mutate({ id: selectedOrder.id, updates: editFormData });
  };

  const handleDownloadXLS = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      
      const data = await res.json();
      const items = data.items || [];
      
      const worksheetData = [
        ["Product", "MRP", "Qty", "Free Qty"],
        ...items.map((item: { productName?: string; unitPrice?: string; quantity: number; freeQuantity?: number }) => [
          item.productName || "Unknown",
          item.unitPrice || "0",
          item.quantity,
          item.freeQuantity || 0,
        ]),
      ];
      
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Order");
      
      const brand = order.brand || "Order";
      const partyName = order.partyName || "Unknown";
      const date = order.createdAt ? new Date(order.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      const filename = `${brand}_${partyName}_${date}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      
      XLSX.writeFile(workbook, filename);
      
      toast({ title: "Excel file downloaded" });
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

  const handleWhatsAppShare = async (order: Order, e: React.MouseEvent, customDate?: string) => {
    e.stopPropagation();
    
    try {
      const endpoint = hasAdminAccess 
        ? `/api/admin/orders/${order.id}`
        : `/api/orders/${order.id}`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      
      const data = await res.json();
      
      const orderWithItems = {
        ...order,
        estimatedDeliveryDate: data.estimatedDeliveryDate,
        actualDeliveryDate: data.actualDeliveryDate,
        specialNotes: data.specialNotes,
        deliveryNote: data.deliveryNote,
        deliveryAddress: data.deliveryAddress,
        deliveryCompany: data.deliveryCompany,
        actualOrderValue: data.actualOrderValue,
        cases: data.cases,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dispatchDate: data.dispatchDate,
        deliveredOnTime: data.deliveredOnTime,
        createdByName: (order as any).createdByName || (order as any).createdByEmail || null,
        items: (data.items || []).map((item: any) => ({
          ...item,
          price: item.unitPrice || "0",
          product: {
            name: item.productName || "Unknown Product",
            price: item.unitPrice || "0",
          },
        })),
        user: data.user || null,
      };
      
      let messageType: WhatsAppMessageType = "created";
      if (order.status === "Pending") {
        messageType = "pending";
      } else if (order.status === "Approved") {
        messageType = "approved";
      } else if (order.status === "Backordered") {
        messageType = "backordered";
      } else if (order.status === "Invoiced") {
        messageType = "invoiced";
      } else if (order.status === "Dispatched") {
        messageType = "dispatched";
      } else if (order.status === "Delivered") {
        messageType = "delivered";
      }
      
      const message = generateWhatsAppMessage(orderWithItems, messageType, customDate);
      openWhatsApp(message, order.whatsappPhone || undefined);
    } catch (error: any) {
      toast({ title: "Failed to share", description: error.message, variant: "destructive" });
    }
  };

  const isOrderEditable = (order: Order) => {
    return order.status === "Online" || order.status === "Created" || order.status === "Approved" || order.status === "Pending";
  };

  const filteredProducts = useMemo(() => {
    if (!selectedOrder?.brand) return [];
    const brandProducts = products.filter(p => p.brand === selectedOrder.brand);
    return filterProductsWithFuzzySearch(brandProducts, addItemsSearch, null, popularityCounts);
  }, [products, selectedOrder?.brand, addItemsSearch, popularityCounts]);

  const handleAddProductToList = (product: Product) => {
    const existing = itemsToAdd.find(i => i.product.id === product.id);
    if (existing) {
      setItemsToAdd(itemsToAdd.map(i => 
        i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setItemsToAdd([...itemsToAdd, { product, quantity: 1 }]);
    }
  };

  const handleUpdateItemQuantity = (productId: string, delta: number) => {
    setItemsToAdd(itemsToAdd.map(i => {
      if (i.product.id === productId) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const handleRemoveItemFromList = (productId: string) => {
    setItemsToAdd(itemsToAdd.filter(i => i.product.id !== productId));
  };

  const handleConfirmAddItems = () => {
    if (!selectedOrder || itemsToAdd.length === 0) return;
    addItemsMutation.mutate({
      orderId: selectedOrder.id,
      items: itemsToAdd.map(i => ({ productId: i.product.id, quantity: i.quantity })),
    });
  };

  const handleExportOrders = async () => {
    setIsExporting(true);
    try {
      // Filter orders based on export options
      let ordersToExport = allOrders;
      
      if (exportStatus !== "all") {
        ordersToExport = ordersToExport.filter(o => o.status === exportStatus);
      }
      if (exportBrands.length > 0) {
        ordersToExport = ordersToExport.filter(o => exportBrands.includes(o.brand || ""));
      }
      
      if (ordersToExport.length === 0) {
        toast({ title: "No orders match the selected filters", variant: "destructive" });
        setIsExporting(false);
        return;
      }

      const brandLabel = exportBrands.length === 0 ? "all" : exportBrands.join("+");
      const filterParts = [exportStatus !== "all" ? exportStatus.toLowerCase() : "all", brandLabel, exportType];
      const filename = `orders_${filterParts.join("_")}_${new Date().toISOString().split("T")[0]}.xlsx`;

      const wb = XLSX.utils.book_new();

      if (exportType === "summary") {
        // Summary: one row per order, no product fetching
        const wsData: any[][] = [
          ["Order Date", "Order ID", "Party Name", "Brand", "Status", "Created By", "Order Total", "Actual Order Value", "No of Cases", "Notes", "Delivery Company", "Invoice #", "Invoice Date", "Dispatch Date", "Dispatch By", "Transport Cost", "POD Received"]
        ];
        ordersToExport.forEach((order) => {
          wsData.push([
            order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "",
            order.id,
            order.partyName || "",
            order.brand || "",
            order.status,
            formatCreatedBy(order),
            Number(order.total) || 0,
            order.actualOrderValue ? Number(order.actualOrderValue) : "",
            order.cases || "",
            order.specialNotes || "",
            order.deliveryCompany || "",
            order.invoiceNumber || "",
            order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : "",
            order.dispatchDate ? new Date(order.dispatchDate).toLocaleDateString() : "",
            order.dispatchBy || "",
            order.deliveryCost ? Number(order.deliveryCost) : "",
            order.podStatus === "Received" ? "Yes" : "No"
          ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Orders Summary");
        XLSX.writeFile(wb, filename);
        toast({ title: `Exported ${ordersToExport.length} orders (summary)` });
      } else {
        // Details: one row per product line item
        const ordersWithItems = await Promise.all(
          ordersToExport.map(async (order) => {
            const endpoint = hasAdminAccess 
              ? `/api/admin/orders/${order.id}` 
              : `/api/orders/${order.id}`;
            const res = await fetch(endpoint, { credentials: "include" });
            if (res.ok) {
              const data = await res.json();
              return { order, items: data.items || [] };
            }
            return { order, items: [] };
          })
        );

        const wsData: any[][] = [
          ["Order Date", "Order ID", "Party Name", "Brand", "Status", "Created By", "Product", "Size", "Qty", "Cases", "Free Qty", "Unit Price", "Line Total", "Order Total", "Actual Order Value", "No of Cases", "Notes", "Delivery Company", "Invoice #", "Invoice Date", "Dispatch Date", "Dispatch By", "Transport Cost", "POD Received"]
        ];

        ordersWithItems.forEach(({ order, items }) => {
          items.forEach((item: any, idx: number) => {
            const cs = item.caseSize && item.caseSize > 1 ? item.caseSize : null;
            wsData.push([
              order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "",
              order.id,
              order.partyName || "",
              order.brand || "",
              order.status,
              formatCreatedBy(order),
              item.productName || "",
              item.size || "",
              item.quantity,
              cs ? item.quantity / cs : "",
              item.freeQuantity || 0,
              Number(item.unitPrice) || 0,
              (item.quantity * Number(item.unitPrice)) || 0,
              idx === 0 ? Number(order.total) || 0 : "",
              idx === 0 ? order.actualOrderValue ? Number(order.actualOrderValue) : "" : "",
              idx === 0 ? order.cases || "" : "",
              idx === 0 ? order.specialNotes || "" : "",
              idx === 0 ? order.deliveryCompany || "" : "",
              idx === 0 ? order.invoiceNumber || "" : "",
              idx === 0 ? order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : "" : "",
              idx === 0 ? order.dispatchDate ? new Date(order.dispatchDate).toLocaleDateString() : "" : "",
              idx === 0 ? order.dispatchBy || "" : "",
              idx === 0 ? order.deliveryCost ? Number(order.deliveryCost) : "" : "",
              idx === 0 ? order.podStatus === "Received" ? "Yes" : "No" : ""
            ]);
          });
          if (items.length === 0) {
            wsData.push([
              order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "",
              order.id,
              order.partyName || "",
              order.brand || "",
              order.status,
              formatCreatedBy(order),
              "", "", 0, "", 0, 0, 0,
              Number(order.total) || 0,
              order.actualOrderValue ? Number(order.actualOrderValue) : "",
              order.cases || "",
              order.specialNotes || "",
              order.deliveryCompany || "",
              order.invoiceNumber || "",
              order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : "",
              order.dispatchDate ? new Date(order.dispatchDate).toLocaleDateString() : "",
              order.dispatchBy || "",
              order.deliveryCost ? Number(order.deliveryCost) : "",
              order.podStatus === "Received" ? "Yes" : "No"
            ]);
          }
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Orders Details");
        XLSX.writeFile(wb, filename);
        toast({ title: `Exported ${ordersWithItems.length} orders (details)` });
      }

      setShowExportDialog(false);
    } catch (error) {
      toast({ title: "Export failed", description: String(error), variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile || !importBrand) return;
    
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("brand", importBrand);
      
      const res = await fetch("/api/admin/orders/import/preview", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Preview failed");
      }
      
      const result = await res.json();
      setImportPreview(result);
      setShowImportDialog(false);
      setShowPreviewDialog(true);
    } catch (error) {
      toast({ title: "Preview failed", description: String(error), variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile || !importBrand) return;
    
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("brand", importBrand);
      
      const res = await fetch("/api/admin/orders/import", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Import failed");
      }
      
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      
      // Show import summary
      setImportSummary({
        count: result.count,
        skipped: result.skipped,
        totalDetected: result.totalDetected,
        duplicates: result.duplicates,
        skippedReasons: result.skippedReasons,
      });
      setShowPreviewDialog(false);
      setImportPreview(null);
      setImportFile(null);
    } catch (error) {
      toast({ title: "Import failed", description: String(error), variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Login Required</h2>
        <p className="text-muted-foreground">Please log in to view orders.</p>
        <Link href="/">
          <Button variant="outline">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen min-h-0">
      <header className="flex-shrink-0 sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header
            cartItemCount={0}
            onCartClick={() => {}}
            isAdmin={isAdmin}
            isBrandAdmin={isBrandAdmin}
            showPortal={true}
          />
        </div>
      </header>
      <div className="flex-shrink-0 flex flex-col gap-3 p-4 border-b bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Orders</h1>
            <Badge variant="secondary" data-testid="badge-order-count">
              {orders.length} orders
            </Badge>
          </div>

          {hasAdminAccess && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowExportDialog(true)}
                className="gap-2"
                data-testid="button-export-orders"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => setShowImportDialog(true)}
                  className="gap-2"
                  data-testid="button-import-orders"
                >
                  <Upload className="w-4 h-4" />
                  Import
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => { setSplitStep(1); setSplitSelectedIds(new Set()); setSplitCosts({ transportCar: "", parking: "", food: "", loadingUnloading: "", truck: "" }); setShowSplitCostDialog(true); }}
                  className="gap-2"
                  data-testid="button-split-delivery-cost"
                >
                  <Calculator className="w-4 h-4" />
                  Split Delivery Cost
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowBulkWhatsApp(true)}
                className="gap-2"
                data-testid="button-bulk-whatsapp"
              >
                <Send className="w-4 h-4" />
                Bulk WhatsApp
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by party, user, invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-orders"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as "7days" | "30days" | "lastMonth" | "thisMonth" | "today" | "all")}>
            <SelectTrigger className="w-32" data-testid="select-date-filter">
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-28 hidden lg:flex" data-testid="select-brand-filter">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {BRANDS.map((brand) => (
                <SelectItem key={brand} value={brand}>
                  {brand}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={deliveryCompanyFilter} onValueChange={setDeliveryCompanyFilter}>
            <SelectTrigger className="w-44 hidden lg:flex" data-testid="select-delivery-filter">
              <SelectValue placeholder="Delivery" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Delivery Company</SelectItem>
              {DELIVERY_COMPANIES.map((company) => (
                <SelectItem key={company} value={company}>
                  {company}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Status Tabs - PODReceived only visible to Admin */}
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
          {ORDER_STATUSES.filter(status => status !== "PODReceived" || isAdmin).map((status) => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setShowTransportTab(false); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                !showTransportTab && statusFilter === status
                  ? `${tabColors[status]} ${tabBgColors[status]} border-b-2`
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`tab-status-${status.toLowerCase()}`}
            >
              {status === "Created" ? "Needs Approval" : status === "PODReceived" ? "POD Received" : status}
              {statusCounts[status] > 0 && (
                <Badge 
                  variant="secondary" 
                  className={`text-xs px-1.5 py-0 min-w-5 h-5 ${!showTransportTab && statusFilter === status ? statusColors[status] : ""}`}
                >
                  {statusCounts[status]}
                </Badge>
              )}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={() => setShowTransportTab(true)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all border-b-2 ml-2 ${
                showTransportTab
                  ? "border-orange-500 text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950 border-b-2"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid="tab-transport"
            >
              <span className="text-base leading-none">🚚</span>
              Transport
              {(statusCounts["Invoiced"] || 0) > 0 && (
                <Badge variant="secondary" className={`text-xs px-1.5 py-0 min-w-5 h-5 ${showTransportTab ? "bg-orange-100 text-orange-800" : ""}`}>
                  {statusCounts["Invoiced"]}
                </Badge>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
          {showTransportTab ? (
            <TransportPredictionTab onDispatchGroup={handleDispatchGroup} />
          ) : (
          <>
          {!searchQuery.trim() && orders.length > 0 && (
            <div className="flex items-center justify-between mb-3 px-1">
              <p className="text-sm text-muted-foreground" data-testid="text-status-total">
                {orders.length} orders — Total Value: <span className="font-semibold text-foreground">{formatINR(orders.reduce((sum, o) => sum + Number(o.total || 0), 0))}</span>
                {orders.some(o => o.actualOrderValue) && (
                  <span> | Actual Value: <span className="font-semibold text-foreground">{formatINR(orders.reduce((sum, o) => sum + Number(o.actualOrderValue || o.total || 0), 0))}</span></span>
                )}
              </p>
            </div>
          )}
          <AnnouncementBanner userBrands={userBrands} />
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No orders found</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    {/* Search Results Headers */}
                    {searchQuery.trim() && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Invoice #</th>
                        <th className="text-right p-2 font-medium">Total</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Online Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Online" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Notes</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Created Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Created" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Notes</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Approved Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Approved" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Approved By</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Approved At</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Notes</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Backordered Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Backordered" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Notes</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Invoiced Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Invoiced" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium">Invoice #</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Invoice Date</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-center p-2 font-medium hidden md:table-cell">Pending</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Pending Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Pending" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Parent Order</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Notes</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Dispatched Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Dispatched" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Invoice #</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Dispatch By</th>
                        <th className="text-center p-2 font-medium hidden md:table-cell">Cases</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Est. Delivery</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Delivered Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Delivered" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Invoice #</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Dispatch On</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Dispatch By</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Delivered On</th>
                        <th className="text-right p-2 font-medium">Order Value</th>
                        <th className="text-center p-2 font-medium hidden lg:table-cell">On Time?</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* PODReceived Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "PODReceived" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Invoice #</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Delivered On</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">POD Received</th>
                        <th className="text-right p-2 font-medium">Total</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Cancelled Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Cancelled" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Created By</th>
                        <th className="text-right p-2 font-medium">Total</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover-elevate cursor-pointer"
                        onClick={() => handleOrderClick(order)}
                        data-testid={`row-order-${order.id}`}
                      >
                        {/* Search Results Cells */}
                        {searchQuery.trim() && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2">
                              <Badge className={statusColors[order.status as OrderStatus]}>
                                {order.status === "PODReceived" ? "POD" : order.status}
                              </Badge>
                            </td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 hidden md:table-cell text-sm">{order.invoiceNumber || "-"}</td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.actualOrderValue || order.total)}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                            </td>
                          </>
                        )}
                        {/* Online Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Online" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 max-w-[200px] hidden lg:table-cell"><div className="truncate text-sm" title={order.deliveryNote || ""}>{order.deliveryNote || "-"}</div></td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.total)}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                {(isAdmin || isBrandAdmin) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50 mr-1"
                                    disabled={updateMutation.isPending}
                                    onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: order.id, updates: { status: "Approved" } }); }}
                                    data-testid={`button-approve-order-${order.id}`}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {canDeleteOrder(order) && <Button size="icon" variant="ghost" onClick={(e) => handleDeleteClick(order, e)} title="Delete Order" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Created Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Created" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2">
                              <div className="font-medium text-sm">{order.partyName || "Unknown"}</div>
                              {(order as any).ownerRole === "Customer" && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-0.5">
                                  Needs Approval
                                </span>
                              )}
                            </td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 max-w-[200px] hidden lg:table-cell"><div className="truncate text-sm" title={order.deliveryNote || ""}>{order.deliveryNote || "-"}</div></td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{order.brand === "Biostige" ? formatINR(order.total) : <span className="text-muted-foreground text-xs">Pending Invoice</span>}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                {isAdmin && (order.status === "Online" || (order as any).ownerRole === "Customer") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50 mr-1"
                                    disabled={updateMutation.isPending}
                                    onClick={(e) => { e.stopPropagation(); updateMutation.mutate({ id: order.id, updates: { status: "Approved" } }); }}
                                    data-testid={`button-approve-order-${order.id}`}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={(e) => { e.stopPropagation(); setOrderForPendingCreation(order); }} 
                                    title="Create Pending Order"
                                    data-testid={`button-create-pending-created-${order.id}`}
                                  >
                                    <GitBranch className="w-4 h-4" />
                                  </Button>
                                )}
                                {canDeleteOrder(order) && <Button size="icon" variant="ghost" onClick={(e) => handleDeleteClick(order, e)} title="Delete Order" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>}
                                {isAdmin && (
                                  <Button size="icon" variant="ghost" onClick={(e) => handleAdvanceClick(order, e)} title="Move to Invoiced" disabled={advanceMutation.isPending} data-testid={`button-advance-${order.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Approved Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Approved" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 hidden md:table-cell text-sm">{order.approvedBy || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-xs whitespace-nowrap">{order.approvedAt ? new Date(order.approvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                            <td className="p-2 max-w-[200px] hidden lg:table-cell"><div className="truncate text-sm" title={order.deliveryNote || ""}>{order.deliveryNote || "-"}</div></td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{order.brand === "Biostige" ? formatINR(order.total) : <span className="text-muted-foreground text-xs">Pending Invoice</span>}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                                {hasAdminAccess && (
                                  <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={(e) => { e.stopPropagation(); setOrderForPendingCreation(order); }} 
                                    title="Create Pending Order"
                                    data-testid={`button-create-pending-${order.id}`}
                                  >
                                    <GitBranch className="w-4 h-4" />
                                  </Button>
                                )}
                                {isAdmin && (
                                  <Button size="icon" variant="ghost" onClick={(e) => handleAdvanceClick(order, e)} title="Move to Invoiced" disabled={advanceMutation.isPending} data-testid={`button-advance-${order.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Backordered Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Backordered" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 max-w-[200px] hidden lg:table-cell"><div className="truncate text-sm" title={order.specialNotes || ""}>{order.specialNotes || "-"}</div></td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.total)}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                                {isAdmin && (
                                  <Button size="icon" variant="ghost" onClick={(e) => handleAdvanceClick(order, e)} title="Move to Invoiced" disabled={advanceMutation.isPending} data-testid={`button-advance-${order.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Invoiced Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Invoiced" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 text-sm font-medium">{order.invoiceNumber || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-xs whitespace-nowrap">{order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.actualOrderValue || order.total)}</td>
                            <td className="p-2 text-center hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                              {pendingOrderLookup.has(order.id) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-900/20"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const pendingOrder = pendingOrderLookup.get(order.id);
                                    if (pendingOrder) {
                                      setStatusFilter("Pending");
                                      handleOrderClick(pendingOrder);
                                    }
                                  }}
                                  data-testid={`button-view-pending-${order.id}`}
                                >
                                  <GitBranch className="w-3 h-3 mr-1" />
                                  View
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                                {isAdmin && (
                                  <Button size="icon" variant="ghost" onClick={(e) => handleAdvanceClick(order, e)} title="Move to Invoiced" disabled={advanceMutation.isPending} data-testid={`button-advance-${order.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Pending Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Pending" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{(order as any).createdByName || (order as any).createdByEmail || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-sm">{order.parentOrderId ? `#${order.parentOrderId.slice(-6)}` : "-"}</td>
                            <td className="p-2 max-w-[200px] hidden lg:table-cell"><div className="truncate text-sm" title={order.specialNotes || ""}>{order.specialNotes || "-"}</div></td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.actualOrderValue || order.total)}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                                {isAdmin && (
                                  <Button size="icon" variant="ghost" onClick={(e) => handleAdvanceClick(order, e)} title="Move to Invoiced" disabled={advanceMutation.isPending} data-testid={`button-advance-${order.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Dispatched Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Dispatched" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 hidden md:table-cell text-sm font-medium">{order.invoiceNumber || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-sm">{order.dispatchBy || "-"}</td>
                            <td className="p-2 text-center hidden md:table-cell text-sm">{order.cases || "-"}</td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.actualOrderValue || order.total)}</td>
                            <td className="p-2 hidden lg:table-cell text-xs whitespace-nowrap">{order.estimatedDeliveryDate ? new Date(order.estimatedDeliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                                {isAdmin && (
                                  <Button size="icon" variant="ghost" onClick={(e) => handleAdvanceClick(order, e)} title="Move to Delivered" disabled={advanceMutation.isPending} data-testid={`button-advance-${order.id}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                                    <ArrowRight className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Delivered Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Delivered" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 hidden md:table-cell text-sm font-medium">{order.invoiceNumber || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-xs whitespace-nowrap">{order.dispatchDate ? new Date(order.dispatchDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden md:table-cell text-sm">{order.dispatchBy || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-xs whitespace-nowrap">{order.actualDeliveryDate ? new Date(order.actualDeliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.actualOrderValue || order.total)}</td>
                            <td className="p-2 text-center hidden lg:table-cell">
                              {(() => {
                                if (!order.estimatedDeliveryDate || !order.actualDeliveryDate) {
                                  return <span className="text-muted-foreground">-</span>;
                                }
                                const estDate = new Date(order.estimatedDeliveryDate);
                                const actDate = new Date(order.actualDeliveryDate);
                                estDate.setHours(0, 0, 0, 0);
                                actDate.setHours(0, 0, 0, 0);
                                if (actDate < estDate) {
                                  return <span className="text-green-600 dark:text-green-400 font-medium">Early</span>;
                                } else if (actDate.getTime() === estDate.getTime()) {
                                  return <span className="text-blue-600 dark:text-blue-400 font-medium">On Time</span>;
                                } else {
                                  return <span className="text-red-600 dark:text-red-400 font-medium">Late</span>;
                                }
                              })()}
                            </td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                              </div>
                            </td>
                          </>
                        )}
                        {/* PODReceived Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "PODReceived" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm font-medium">{order.invoiceNumber || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-xs whitespace-nowrap">{order.actualDeliveryDate ? new Date(order.actualDeliveryDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden md:table-cell text-xs whitespace-nowrap">
                              {order.podStatus === "Digital Received" ? (
                                <span className="text-blue-600 dark:text-blue-400 font-medium">Digital</span>
                              ) : (
                                <span className="text-green-600 dark:text-green-400 font-medium">Yes</span>
                              )}
                              {order.podTimestamp && (
                                <span className="text-muted-foreground ml-1">
                                  ({new Date(order.podTimestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })})
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.actualOrderValue || order.total)}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                              </div>
                            </td>
                          </>
                        )}
                        {/* Cancelled Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Cancelled" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.total)}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </>
          )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={async (open) => {
        if (!open) {
          const pendingShare = pendingWhatsAppShare;
          const orderId = selectedOrder?.id;
          setSelectedOrder(null);
          setPendingWhatsAppShare(null);
          setShowVerifyParty(false);
          setVerifyPartyName("");
          setVerifyPartyResult(null);
          
          if (pendingShare && orderId) {
            try {
              const res = await fetch(`/api/admin/orders/${orderId}`, { credentials: "include" });
              if (res.ok) {
                const freshOrder = await res.json();
                setOrderToShare({ order: freshOrder, status: freshOrder.status });
              } else {
                setOrderToShare(pendingShare);
              }
            } catch {
              setOrderToShare(pendingShare);
            }
          }
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isAdmin ? "Edit Order" : isBrandAdmin && selectedOrder?.status === "Created" ? "Approve Order" : "Order Details"}
            </DialogTitle>
            <DialogDescription>
              {isAdmin ? "Update order details and tracking information." : isBrandAdmin && selectedOrder?.status === "Created" ? "Approve this order to proceed with fulfillment." : "View your order details."}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted space-y-2">
                <div className="font-medium">{selectedOrder.partyName || "Unknown Customer"}</div>
                <div className="text-sm text-muted-foreground">
                  Order Total: {formatINR(selectedOrder.total)}
                </div>
                {selectedOrder.actualOrderValue && (
                  <div className="text-sm">
                    <span className="font-medium">Actual Invoice Value: </span>
                    <span className="text-muted-foreground">{formatINR(Number(selectedOrder.actualOrderValue))}</span>
                  </div>
                )}
                {pendingOrderLookup.has(selectedOrder.id) && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Has Pending Order
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      #{pendingOrderLookup.get(selectedOrder.id)?.id.slice(-6)}
                    </span>
                  </div>
                )}
                {((selectedOrder as any).createdByName || (selectedOrder as any).createdByEmail) && (
                  <div className="text-sm">
                    <span className="font-medium">Created By: </span>
                    <span className="text-muted-foreground">{formatCreatedBy(selectedOrder)}</span>
                  </div>
                )}
                {selectedOrder.approvedBy && (
                  <div className="text-sm">
                    <span className="font-medium">Approved By: </span>
                    <span className="text-muted-foreground">{selectedOrder.approvedBy}</span>
                    {selectedOrder.approvedAt && (
                      <span className="text-muted-foreground ml-1">
                        ({new Date(selectedOrder.approvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})
                      </span>
                    )}
                  </div>
                )}
                {selectedOrder.deliveryAddress && (
                  <div className="text-sm mt-1">
                    <span className="font-medium">Delivery Notes: </span>
                    <span className="text-muted-foreground">{selectedOrder.deliveryAddress}</span>
                  </div>
                )}
                {selectedOrder.deliveryCompany && (
                  <div className="text-sm">
                    <span className="font-medium">Delivery Company: </span>
                    <span className="text-muted-foreground">{selectedOrder.deliveryCompany}</span>
                  </div>
                )}
              </div>

              {/* POD Status Toggle - only visible for Admin when order is Delivered */}
              {isAdmin && selectedOrder.status === "Delivered" && (
                <div className="p-3 rounded-md border bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">POD Status</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        selectedOrder.podStatus === "Received" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : 
                        selectedOrder.podStatus === "Digital Received" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                        "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                      }>
                        {selectedOrder.podStatus || "Pending"}
                      </Badge>
                      {selectedOrder.podStatus === "Pending" || !selectedOrder.podStatus ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updatePodStatusMutation.mutate({ orderId: selectedOrder.id, podStatus: "Received" })}
                            disabled={updatePodStatusMutation.isPending}
                            data-testid="button-mark-pod-received"
                          >
                            {updatePodStatusMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3 h-3 mr-1" />
                            )}
                            Received
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updatePodStatusMutation.mutate({ orderId: selectedOrder.id, podStatus: "Digital Received" })}
                            disabled={updatePodStatusMutation.isPending}
                            data-testid="button-mark-pod-digital"
                          >
                            {updatePodStatusMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <Check className="w-3 h-3 mr-1" />
                            )}
                            Digital
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {selectedOrder.podTimestamp && (
                    <div className="text-xs text-muted-foreground">
                      POD received on: {new Date(selectedOrder.podTimestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  )}
                </div>
              )}

              {/* Verify Party - Admin only, not shown for Dispatched/Delivered/PODReceived */}
              {isAdmin && !["Dispatched", "Delivered", "PODReceived"].includes(selectedOrder.status) && (
                <div className="p-3 rounded-md border bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Verify Party Name</span>
                    </div>
                    {!showVerifyParty && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowVerifyParty(true);
                          setVerifyPartyName(selectedOrder.partyName || "");
                          setVerifyPartyResult(null);
                        }}
                        data-testid="button-verify-party"
                      >
                        <Search className="w-3 h-3 mr-1" />
                        Verify
                      </Button>
                    )}
                  </div>
                  
                  {showVerifyParty && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={verifyPartyName}
                          onChange={(e) => setVerifyPartyName(e.target.value)}
                          placeholder="Enter party name to verify"
                          className="flex-1"
                          data-testid="input-verify-party-name"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleVerifyParty(false)}
                          disabled={verifyPartyMutation.isPending}
                          data-testid="button-search-party"
                        >
                          {verifyPartyMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Search className="w-3 h-3" />
                          )}
                        </Button>
                      </div>
                      
                      {verifyPartyResult && (
                        <div className={`p-3 rounded-md text-sm ${verifyPartyResult.found ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800'}`}>
                          {verifyPartyResult.found ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="font-medium">Party Found</span>
                              </div>
                              <div className="space-y-1 text-xs">
                                <div><span className="font-medium">Verified Name:</span> {verifyPartyResult.verifiedName}</div>
                                {verifyPartyResult.location && (
                                  <div><span className="font-medium">Location:</span> {verifyPartyResult.location}</div>
                                )}
                                <div className="flex gap-4 mt-2">
                                  <div>
                                    <span className="font-medium">Outstanding:</span>{" "}
                                    <span className={verifyPartyResult.outstandingAmount && verifyPartyResult.outstandingAmount > 0 ? "text-red-600 font-semibold" : "text-green-600"}>
                                      {formatINR(verifyPartyResult.outstandingAmount || 0)}
                                    </span>
                                  </div>
                                  <div><span className="font-medium">Credit Limit:</span> {formatINR(verifyPartyResult.creditLimit || 0)}</div>
                                </div>
                              </div>
                              
                              {verifyPartyResult.verifiedName !== selectedOrder.partyName && (
                                <div className="flex gap-2 mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                                  <Button
                                    size="sm"
                                    onClick={() => handleVerifyParty(true)}
                                    disabled={verifyPartyMutation.isPending}
                                    data-testid="button-update-party-name"
                                  >
                                    {verifyPartyMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : (
                                      <Check className="w-3 h-3 mr-1" />
                                    )}
                                    Update to Verified Name
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowVerifyParty(false)}
                                    data-testid="button-keep-party-name"
                                  >
                                    Keep Current Name
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-600" />
                                <span className="font-medium">Party Not Found</span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {verifyPartyResult.message || "The party name could not be verified. Try a different spelling or keep the current name."}
                              </p>
                              <div className="flex gap-2 mt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setVerifyPartyResult(null)}
                                  data-testid="button-try-again"
                                >
                                  Try Different Name
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setShowVerifyParty(false)}
                                  data-testid="button-close-verify"
                                >
                                  Close
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedOrder.importText && (
                <Collapsible className="border rounded-md" data-testid="collapsible-import-text">
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-sm font-medium hover-elevate">
                    <span>Original Import Text</span>
                    <ChevronDown className="w-4 h-4 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-3 pt-0">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-2 rounded max-h-40 overflow-y-auto" data-testid="text-import-original">
                        {selectedOrder.importText}
                      </pre>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="border rounded-md">
                <div className="p-3 border-b bg-muted/50 flex justify-between items-center gap-2">
                  <h4 className="font-medium text-sm">Products Ordered</h4>
                  {isOrderEditable(selectedOrder) && (hasAdminAccess || selectedOrder.userId === user?.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddItems(true)}
                      data-testid="button-add-items"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Items
                    </Button>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {loadingItems ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : orderItems.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      No items found
                    </div>
                  ) : (
                    <div className="divide-y">
                      {orderItems.map((item) => {
                        const canEdit = isOrderEditable(selectedOrder) && (
                          selectedOrder?.userId === user?.id || isAdmin || isBrandAdmin
                        );
                        const isEditing = editingItemId === item.id;
                        
                        return (
                          <div key={item.id} className="px-3 py-2 text-sm">
                            <div className="flex justify-between items-center">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{item.productName || "Unknown Product"}</span>
                                {item.size && item.size !== "Uni" && (
                                  <span className="text-muted-foreground ml-2">({item.size})</span>
                                )}
                              </div>
                              {!isEditing && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">x{item.quantity}</span>
                                  {item.freeQuantity && item.freeQuantity > 0 && (
                                    <span className="text-xs text-green-600 dark:text-green-400">+{item.freeQuantity} free</span>
                                  )}
                                  <span className="min-w-16 text-right">{formatINR(Number(item.unitPrice) * item.quantity)}</span>
                                  {canEdit && (
                                    <div className="flex items-center gap-0">
                                      <Button 
                                        size="icon" 
                                        variant="ghost" 
                                        className="h-7 w-7"
                                        onClick={() => {
                                          setEditingItemId(item.id);
                                          setEditingItemQty(item.quantity);
                                          setEditingItemFreeQty(item.freeQuantity || 0);
                                        }}
                                        data-testid={`button-edit-item-${item.id}`}
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </Button>
                                      <Button 
                                        size="icon" 
                                        variant="ghost"
                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                        onClick={() => {
                                          if (selectedOrder && confirm("Remove this item from the order?")) {
                                            deleteItemMutation.mutate({ orderId: selectedOrder.id, itemId: item.id });
                                          }
                                        }}
                                        disabled={deleteItemMutation.isPending}
                                        data-testid={`button-delete-item-${item.id}`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {isEditing && (
                              <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Label className="text-xs text-muted-foreground">Qty:</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editingItemQty}
                                    onChange={(e) => setEditingItemQty(parseInt(e.target.value) || 0)}
                                    className="w-16 h-8"
                                    data-testid={`input-edit-qty-${item.id}`}
                                  />
                                </div>
                                <div className="flex items-center gap-1">
                                  <Label className="text-xs text-muted-foreground">Free:</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editingItemFreeQty}
                                    onChange={(e) => setEditingItemFreeQty(parseInt(e.target.value) || 0)}
                                    className="w-16 h-8"
                                    data-testid={`input-edit-free-qty-${item.id}`}
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="h-8"
                                  onClick={() => {
                                    if (selectedOrder) {
                                      if (editingItemQty === 0 && editingItemFreeQty === 0) {
                                        toast({ title: "Either quantity or free quantity must be greater than 0", variant: "destructive" });
                                        return;
                                      }
                                      updateItemMutation.mutate({
                                        orderId: selectedOrder.id,
                                        itemId: item.id,
                                        quantity: editingItemQty,
                                        freeQuantity: editingItemFreeQty,
                                      });
                                    }
                                  }}
                                  disabled={updateItemMutation.isPending}
                                  data-testid={`button-save-item-${item.id}`}
                                >
                                  {updateItemMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8"
                                  onClick={() => setEditingItemId(null)}
                                  data-testid={`button-cancel-edit-item-${item.id}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {isAdmin ? (
                <>
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="status">Status</Label>
                      {selectedOrder.status === "Delivered" || selectedOrder.status === "PODReceived" ? (
                        <div className="flex items-center h-9 px-3 rounded-md border bg-muted">
                          <Badge className={statusColors[selectedOrder.status as OrderStatus]}>
                            {selectedOrder.status === "PODReceived" ? "POD Received" : selectedOrder.status}
                          </Badge>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {selectedOrder.status === "Delivered" ? "(Can only mark POD Received)" : "(Final status)"}
                          </span>
                        </div>
                      ) : (
                        <Select
                          value={editFormData.status}
                          onValueChange={(v) => setEditFormData({ ...editFormData, status: v as OrderStatus })}
                        >
                          <SelectTrigger id="status" data-testid="select-edit-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(selectedOrder.status === "Dispatched"
                              ? (["Invoiced", "Dispatched", "Delivered"] as OrderStatus[])
                              : ORDER_STATUSES
                            ).map((status) => (
                              <SelectItem key={status} value={status}>
                                {status === "PODReceived" ? "POD Received" : status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="partyName">Party Name {["Backordered", "Invoiced", "Dispatched", "Delivered", "PODReceived"].includes(selectedOrder.status) && <span className="text-xs text-muted-foreground">(locked)</span>}</Label>
                      <Input
                        id="partyName"
                        value={editFormData.partyName}
                        onChange={(e) => setEditFormData({ ...editFormData, partyName: e.target.value })}
                        placeholder="Customer name"
                        disabled={["Backordered", "Invoiced", "Dispatched", "Delivered", "PODReceived"].includes(selectedOrder.status)}
                        data-testid="input-party-name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="deliveryAddress">Delivery Address</Label>
                      <Textarea
                        id="deliveryAddress"
                        value={editFormData.deliveryAddress}
                        onChange={(e) => setEditFormData({ ...editFormData, deliveryAddress: e.target.value })}
                        placeholder="Full delivery address"
                        rows={2}
                        disabled={selectedOrder.status === "PODReceived"}
                        data-testid="input-delivery-address"
                      />
                    </div>

                    <div>
                      <Label htmlFor="deliveryCompany">Delivery Company</Label>
                      <Select
                        value={editFormData.deliveryCompany}
                        onValueChange={(v) => setEditFormData({ ...editFormData, deliveryCompany: v })}
                        disabled={selectedOrder.status === "PODReceived"}
                      >
                        <SelectTrigger id="deliveryCompany" data-testid="select-edit-delivery-company">
                          <SelectValue placeholder="Select delivery company" />
                        </SelectTrigger>
                        <SelectContent>
                          {DELIVERY_COMPANIES.map((company) => (
                            <SelectItem key={company} value={company}>
                              {company}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor="invoiceNumber">Invoice No {(editFormData.status === "Invoiced" || editFormData.status === "Dispatched") && <span className="text-destructive">*</span>}</Label>
                        <Input
                          id="invoiceNumber"
                          value={editFormData.invoiceNumber}
                          onChange={(e) => setEditFormData({ ...editFormData, invoiceNumber: e.target.value })}
                          placeholder="INV-001"
                          disabled={selectedOrder.status === "PODReceived"}
                          data-testid="input-invoice-number"
                        />
                      </div>
                      <div>
                        <Label htmlFor="invoiceDate">Invoice Date {(editFormData.status === "Invoiced" || editFormData.status === "Dispatched") && <span className="text-destructive">*</span>}</Label>
                        <Input
                          id="invoiceDate"
                          type="date"
                          value={editFormData.invoiceDate}
                          onChange={(e) => setEditFormData({ ...editFormData, invoiceDate: e.target.value })}
                          disabled={selectedOrder.status === "PODReceived"}
                          data-testid="input-invoice-date"
                        />
                      </div>
                      <div>
                        <Label htmlFor="actualOrderValue">Actual Value {(editFormData.status === "Invoiced" || editFormData.status === "Dispatched") && <span className="text-destructive">*</span>}</Label>
                        <Input
                          id="actualOrderValue"
                          type="number"
                          value={editFormData.actualOrderValue}
                          onChange={(e) => setEditFormData({ ...editFormData, actualOrderValue: e.target.value })}
                          placeholder="0.00"
                          disabled={selectedOrder.status === "PODReceived"}
                          data-testid="input-actual-order-value"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="dispatchDate">Dispatch Date</Label>
                        <Input
                          id="dispatchDate"
                          type="date"
                          value={editFormData.dispatchDate}
                          onChange={(e) => setEditFormData({ ...editFormData, dispatchDate: e.target.value })}
                          disabled={selectedOrder.status === "PODReceived"}
                          data-testid="input-dispatch-date"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dispatchBy">Dispatch By</Label>
                        <Input
                          id="dispatchBy"
                          value={editFormData.dispatchBy}
                          onChange={(e) => setEditFormData({ ...editFormData, dispatchBy: e.target.value })}
                          placeholder="Courier name"
                          disabled={selectedOrder.status === "PODReceived"}
                          data-testid="input-dispatch-by"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="cases">Cases</Label>
                        <Input
                          id="cases"
                          type="number"
                          value={editFormData.cases}
                          onChange={(e) => setEditFormData({ ...editFormData, cases: e.target.value })}
                          placeholder="0"
                          disabled={selectedOrder.status === "PODReceived"}
                          data-testid="input-cases"
                        />
                      </div>
                      {isAdmin && (
                        <div>
                          <Label htmlFor="deliveryCost">Delivery Cost</Label>
                          <Input
                            id="deliveryCost"
                            value={editFormData.deliveryCost}
                            onChange={(e) => setEditFormData({ ...editFormData, deliveryCost: e.target.value })}
                            placeholder="0.00"
                            data-testid="input-delivery-cost"
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="estimatedDeliveryDate">Est. Delivery</Label>
                        <Input
                          id="estimatedDeliveryDate"
                          type="date"
                          value={editFormData.estimatedDeliveryDate}
                          onChange={(e) => setEditFormData({ ...editFormData, estimatedDeliveryDate: e.target.value })}
                          disabled={selectedOrder.status === "PODReceived"}
                          data-testid="input-est-delivery"
                        />
                      </div>
                      <div>
                        <Label htmlFor="actualDeliveryDate">Actual Delivery</Label>
                        <Input
                          id="actualDeliveryDate"
                          type="date"
                          value={editFormData.actualDeliveryDate}
                          onChange={(e) => setEditFormData({ ...editFormData, actualDeliveryDate: e.target.value })}
                          data-testid="input-actual-delivery"
                        />
                      </div>
                    </div>

                    {editFormData.status === "Delivered" && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50 border">
                        <Checkbox
                          id="deliveredOnTime"
                          checked={editFormData.deliveredOnTime}
                          onCheckedChange={(checked) => setEditFormData({ ...editFormData, deliveredOnTime: checked === true })}
                          data-testid="checkbox-delivered-on-time"
                        />
                        <Label htmlFor="deliveredOnTime" className="cursor-pointer">
                          Delivered On Time
                        </Label>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="specialNotes">Special Notes</Label>
                      <Textarea
                        id="specialNotes"
                        value={editFormData.specialNotes}
                        onChange={(e) => setEditFormData({ ...editFormData, specialNotes: e.target.value })}
                        placeholder="Additional notes..."
                        rows={3}
                        disabled={selectedOrder.status === "PODReceived"}
                        data-testid="input-special-notes"
                      />
                    </div>

                    <div>
                      <Label htmlFor="deliveryNote">Delivery Note</Label>
                      <Textarea
                        id="deliveryNote"
                        value={editFormData.deliveryNote}
                        onChange={(e) => setEditFormData({ ...editFormData, deliveryNote: e.target.value })}
                        placeholder="Delivery instructions or notes..."
                        rows={3}
                        disabled={selectedOrder.status === "PODReceived"}
                        data-testid="input-delivery-note"
                      />
                    </div>
                  </div>

                  {selectedOrder.status === "PODReceived" ? (
                    <div className="space-y-3 pt-4">
                      <div className="p-3 rounded-md bg-muted/50 border">
                        <p className="text-sm text-muted-foreground">
                          Only Delivery Cost and Actual Delivery Date can be updated for POD Received orders.
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setSelectedOrder(null)}
                          data-testid="button-cancel-edit"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSave}
                          disabled={updateMutation.isPending}
                          data-testid="button-save-order"
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save Changes"
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => setSelectedOrder(null)}
                        data-testid="button-cancel-edit"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                        data-testid="button-save-order"
                      >
                        {updateMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "Save Changes"
                        )}
                      </Button>
                    </div>
                  )}
                </>
              ) : isBrandAdmin && selectedOrder.status === "Created" ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-md bg-muted/50 border">
                    <p className="text-sm text-muted-foreground">
                      Review this order and approve it to proceed with fulfillment.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedOrder(null)}
                      data-testid="button-cancel-approve"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        updateMutation.mutate(
                          { id: selectedOrder.id, updates: { status: "Approved" } },
                          { onSuccess: () => setSelectedOrder(null) }
                        );
                      }}
                      disabled={updateMutation.isPending}
                      data-testid="button-approve-order"
                    >
                      {updateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Approving...
                        </>
                      ) : (
                        "Approve Order"
                      )}
                    </Button>
                  </div>
                </div>
              ) : isBrandAdmin && selectedOrder.status === "Approved" ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-md bg-muted/50 border">
                    <p className="text-sm text-muted-foreground">
                      Fill in the required invoice details to mark this order as Invoiced.
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="brandAdminDeliveryCompany">Delivery Company</Label>
                    <Select
                      value={editFormData.deliveryCompany}
                      onValueChange={(v) => setEditFormData({ ...editFormData, deliveryCompany: v })}
                    >
                      <SelectTrigger id="brandAdminDeliveryCompany" data-testid="select-brand-admin-delivery-company">
                        <SelectValue placeholder="Select delivery company" />
                      </SelectTrigger>
                      <SelectContent>
                        {DELIVERY_COMPANIES.map((company) => (
                          <SelectItem key={company} value={company}>
                            {company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="brandAdminInvoiceNumber">Invoice No <span className="text-destructive">*</span></Label>
                      <Input
                        id="brandAdminInvoiceNumber"
                        value={editFormData.invoiceNumber}
                        onChange={(e) => setEditFormData({ ...editFormData, invoiceNumber: e.target.value })}
                        placeholder="INV-001"
                        data-testid="input-brand-admin-invoice-number"
                      />
                    </div>
                    <div>
                      <Label htmlFor="brandAdminInvoiceDate">Invoice Date <span className="text-destructive">*</span></Label>
                      <Input
                        id="brandAdminInvoiceDate"
                        type="date"
                        value={editFormData.invoiceDate}
                        onChange={(e) => setEditFormData({ ...editFormData, invoiceDate: e.target.value })}
                        data-testid="input-brand-admin-invoice-date"
                      />
                    </div>
                    <div>
                      <Label htmlFor="brandAdminActualValue">Actual Value <span className="text-destructive">*</span></Label>
                      <Input
                        id="brandAdminActualValue"
                        type="number"
                        value={editFormData.actualOrderValue}
                        onChange={(e) => setEditFormData({ ...editFormData, actualOrderValue: e.target.value })}
                        placeholder="0.00"
                        data-testid="input-brand-admin-actual-value"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedOrder(null)}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const missingFields: string[] = [];
                        if (!editFormData.invoiceNumber?.trim()) missingFields.push("Invoice Number");
                        if (!editFormData.invoiceDate?.trim()) missingFields.push("Invoice Date");
                        if (!editFormData.actualOrderValue?.trim()) missingFields.push("Actual Order Value");
                        
                        if (missingFields.length > 0) {
                          toast({
                            title: "Required fields missing",
                            description: `Please fill in: ${missingFields.join(", ")}`,
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        updateMutation.mutate(
                          { id: selectedOrder.id, updates: { 
                            status: "Invoiced",
                            deliveryCompany: editFormData.deliveryCompany || undefined,
                            invoiceNumber: editFormData.invoiceNumber,
                            invoiceDate: editFormData.invoiceDate,
                            actualOrderValue: editFormData.actualOrderValue
                          } },
                          { onSuccess: () => setSelectedOrder(null) }
                        );
                      }}
                      disabled={updateMutation.isPending}
                      data-testid="button-mark-invoiced"
                    >
                      {updateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Mark as Invoiced"
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge className={statusColors[selectedOrder.status as OrderStatus]}>
                      {selectedOrder.status}
                    </Badge>
                  </div>
                  {pendingOrderLookup.has(selectedOrder.id) && (
                    <div className="flex justify-between items-center p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                      <span className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-1">
                        <GitBranch className="w-4 h-4" />
                        Has pending order
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-100 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-900/40"
                        onClick={() => {
                          const pendingOrder = pendingOrderLookup.get(selectedOrder.id);
                          if (pendingOrder) {
                            setSelectedOrder(null);
                            setStatusFilter("Pending");
                            setTimeout(() => handleOrderClick(pendingOrder), 100);
                          }
                        }}
                        data-testid="button-dialog-view-pending"
                      >
                        View
                      </Button>
                    </div>
                  )}
                  {selectedOrder.invoiceNumber && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Invoice:</span>
                      <span>{selectedOrder.invoiceNumber} {selectedOrder.invoiceDate && `(${formatDate(selectedOrder.invoiceDate)})`}</span>
                    </div>
                  )}
                  {selectedOrder.status === "Dispatched" && selectedOrder.estimatedDeliveryDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Est. Delivery:</span>
                      <span>{formatDate(selectedOrder.estimatedDeliveryDate)}</span>
                    </div>
                  )}
                  {selectedOrder.status === "Delivered" && selectedOrder.actualDeliveryDate && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivered:</span>
                      <span>{formatDate(selectedOrder.actualDeliveryDate)}</span>
                    </div>
                  )}
                  {selectedOrder.specialNotes && (
                    <div>
                      <span className="text-muted-foreground">Special Notes:</span>
                      <p className="mt-1 text-sm">{selectedOrder.specialNotes}</p>
                    </div>
                  )}
                  <div className="flex justify-end pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedOrder(null)}
                      data-testid="button-close-details"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showAddItems} onOpenChange={(open) => {
        if (!open) {
          setShowAddItems(false);
          setItemsToAdd([]);
          setAddItemsSearch("");
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Items to Order</DialogTitle>
            <DialogDescription>
              Search and add products from {selectedOrder?.brand || "this brand"} to the order.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={addItemsSearch}
              onChange={(e) => setAddItemsSearch(e.target.value)}
              className="pl-10"
              data-testid="input-add-items-search"
            />
          </div>

          <div className="flex-1 min-h-0 space-y-3 overflow-hidden">
            <div className="border rounded-md h-48 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  {addItemsSearch ? "No products found" : "Type to search products"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredProducts.slice(0, 50).map((product) => (
                    <div
                      key={product.id}
                      className="px-3 py-2 flex justify-between items-center text-sm hover-elevate cursor-pointer"
                      onClick={() => handleAddProductToList(product)}
                      data-testid={`product-add-${product.id}`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-medium break-words whitespace-normal leading-tight">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.sku}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{formatINR(product.price || 0)}</span>
                        <Button size="icon" variant="ghost">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {itemsToAdd.length > 0 && (
              <div className="border rounded-md">
                <div className="p-2 bg-muted/50 border-b text-sm font-medium">
                  Items to Add ({itemsToAdd.length})
                </div>
                <div className="max-h-32 overflow-y-auto divide-y">
                  {itemsToAdd.map((item) => (
                    <div key={item.product.id} className="px-3 py-2 flex justify-between items-center text-sm">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-medium break-words whitespace-normal leading-tight">{item.product.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleUpdateItemQuantity(item.product.id, -1)}
                          data-testid={`button-decrease-${item.product.id}`}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleUpdateItemQuantity(item.product.id, 1)}
                          data-testid={`button-increase-${item.product.id}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemoveItemFromList(item.product.id)}
                          data-testid={`button-remove-${item.product.id}`}
                        >
                          <XCircle className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddItems(false);
                setItemsToAdd([]);
                setAddItemsSearch("");
              }}
              data-testid="button-cancel-add-items"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAddItems}
              disabled={itemsToAdd.length === 0 || addItemsMutation.isPending}
              data-testid="button-confirm-add-items"
            >
              {addItemsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                `Add ${itemsToAdd.length} Item${itemsToAdd.length !== 1 ? "s" : ""}`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order for "{orderToDelete?.partyName || 'Unknown'}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!orderForPendingCreation} onOpenChange={(open) => !open && setOrderForPendingCreation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Pending Order</AlertDialogTitle>
            <AlertDialogDescription>
              Create a pending order with out-of-stock items from this order for "{orderForPendingCreation?.partyName || 'Unknown'}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-pending-order">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (orderForPendingCreation) {
                  createPendingOrderMutation.mutate(orderForPendingCreation.id);
                }
              }}
              disabled={createPendingOrderMutation.isPending}
              data-testid="button-confirm-pending-order"
            >
              {createPendingOrderMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Pending Order"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!orderToShare} onOpenChange={(open) => {
          if (!open) {
            setOrderToShare(null);
            setShareDate("");
          }
        }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Order {orderToShare?.status}
            </DialogTitle>
            <DialogDescription>
              Would you like to share this update via WhatsApp?
            </DialogDescription>
          </DialogHeader>
          {orderToShare && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
                <p><span className="font-medium">Party:</span> {orderToShare.order.partyName}</p>
                <p><span className="font-medium">Total:</span> {formatINR(orderToShare.order.total)}</p>
                <p><span className="font-medium">Status:</span> {orderToShare.status}</p>
              </div>
              
              {(orderToShare.status === "Dispatched" || orderToShare.status === "Delivered") && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {orderToShare.status === "Dispatched" ? "Dispatch Date" : "Delivery Date"}
                  </label>
                  <Input
                    type="date"
                    value={shareDate || new Date().toISOString().split('T')[0]}
                    onChange={(e) => setShareDate(e.target.value)}
                    data-testid="input-share-date"
                  />
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setOrderToShare(null);
                setShareDate("");
              }}
              data-testid="button-skip-whatsapp"
            >
              Skip
            </Button>
            <Button
              onClick={async () => {
                if (orderToShare) {
                  const e = { stopPropagation: () => {} } as React.MouseEvent;
                  const dateToUse = shareDate || new Date().toISOString().split('T')[0];
                  await handleWhatsAppShare(orderToShare.order, e, dateToUse);
                  setOrderToShare(null);
                  setShareDate("");
                }
              }}
              className="gap-2"
              data-testid="button-share-status-whatsapp"
            >
              <MessageCircle className="w-4 h-4" />
              Share on WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkWhatsApp} onOpenChange={setShowBulkWhatsApp}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              Bulk WhatsApp Messages
            </DialogTitle>
            <DialogDescription>
              Send WhatsApp messages for orders {bulkType === "dispatched" ? "dispatched" : "delivered"} on the selected date, grouped by brand and delivery company.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-wrap items-center gap-2 pb-4">
            <Button
              variant={bulkType === "dispatched" ? "default" : "outline"}
              onClick={() => setBulkType("dispatched")}
              size="sm"
              data-testid="button-bulk-dispatched"
            >
              <Truck className="w-4 h-4 mr-2" />
              Dispatched
            </Button>
            <Button
              variant={bulkType === "delivered" ? "default" : "outline"}
              onClick={() => setBulkType("delivered")}
              size="sm"
              data-testid="button-bulk-delivered"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Delivered
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-sm text-muted-foreground">
                {bulkType === "dispatched" ? "Dispatch" : "Delivery"} Date:
              </label>
              <Input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                className="w-auto"
                data-testid="input-bulk-date"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
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
                      <h3 className="font-semibold">{group.brand} - {group.deliveryCompany}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatINR(group.totalValue)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        const formatDateFn = (dateVal: string | Date | null | undefined): string => {
                          if (!dateVal) return "N/A";
                          const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
                          return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                        };
                        const formatCurrencyFn = (value: string | number | null | undefined): string => {
                          const num = typeof value === "string" ? parseFloat(value) : (value || 0);
                          return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        };
                        
                        const orderMessages = group.orders.map(o => {
                          if (bulkType === "dispatched") {
                            let msg = `*Order Dispatched*\n`;
                            msg += `━━━━━━━━━━━━━━━━━━\n\n`;
                            msg += `*Party:* ${o.partyName || "N/A"}\n`;
                            msg += `*Brand:* ${group.brand}\n`;
                            if (o.dispatchDate) {
                              msg += `*Dispatch Date:* ${formatDateFn(o.dispatchDate)}\n`;
                            }
                            msg += `*Actual Order Value:* ${formatCurrencyFn(o.actualOrderValue || o.total)}\n\n`;
                            if (o.deliveryAddress) {
                              msg += `*Delivery Address:*\n${o.deliveryAddress}\n\n`;
                            }
                            if (group.deliveryCompany) {
                              msg += `*Transport:* ${group.deliveryCompany}\n`;
                            }
                            if (o.cases) {
                              msg += `*No. of Cases:* ${o.cases}\n`;
                            }
                            if (o.estimatedDeliveryDate) {
                              msg += `*Estimated Delivery:* ${formatDateFn(o.estimatedDeliveryDate)}\n`;
                            }
                            return msg;
                          } else {
                            let msg = `*Order Delivered*\n`;
                            msg += `━━━━━━━━━━━━━━━━━━\n\n`;
                            msg += `*Party:* ${o.partyName || "N/A"}\n`;
                            if (o.invoiceNumber) {
                              msg += `*Invoice No:* ${o.invoiceNumber}\n`;
                            }
                            if (o.invoiceDate) {
                              msg += `*Invoice Date:* ${formatDateFn(o.invoiceDate)}\n`;
                            }
                            msg += `*Actual Order Value:* ${formatCurrencyFn(o.actualOrderValue || o.total)}\n`;
                            if (o.cases) {
                              msg += `*No. of Cases:* ${o.cases}\n`;
                            }
                            if (o.dispatchDate) {
                              msg += `*Dispatch Date:* ${formatDateFn(o.dispatchDate)}\n`;
                            }
                            if (o.actualDeliveryDate) {
                              msg += `*Delivery Date:* ${formatDateFn(o.actualDeliveryDate)}\n`;
                            }
                            if (o.deliveredOnTime !== null && o.deliveredOnTime !== undefined) {
                              msg += `*On Time:* ${o.deliveredOnTime ? "Yes ✓" : "No ✗"}\n`;
                            }
                            if (o.deliveryAddress) {
                              msg += `\n*Delivery Address:*\n${o.deliveryAddress}\n`;
                            }
                            return msg;
                          }
                        }).join("\n\n");
                        
                        const message = `*${group.brand} - ${group.deliveryCompany}*\n*${group.orders.length} Orders ${bulkType === "dispatched" ? "Dispatched" : "Delivered"}*\n\n${orderMessages}`;
                        
                        const encoded = encodeURIComponent(message);
                        window.open(`https://wa.me/?text=${encoded}`, "_blank");
                      }}
                      data-testid={`button-send-bulk-${group.brand}-${group.deliveryCompany}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      Send
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {group.orders.slice(0, 5).map((o, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="truncate max-w-[200px]">{o.partyName || "Unknown"}</span>
                        <span>{formatINR(o.total)}</span>
                      </div>
                    ))}
                    {group.orders.length > 5 && (
                      <div className="text-muted-foreground italic">
                        +{group.orders.length - 5} more orders...
                      </div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowBulkWhatsApp(false)} data-testid="button-close-bulk">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showExportDialog} onOpenChange={(open) => {
        setShowExportDialog(open);
        if (!open) {
          setExportStatus("all");
          setExportBrands([]);
          setExportType("details");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Export Orders
            </DialogTitle>
            <DialogDescription>
              Choose which orders to export to Excel.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Export type toggle */}
            <div>
              <label className="text-sm font-medium mb-2 block">Export Type</label>
              <div className="flex gap-2">
                {(["details", "summary"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setExportType(type)}
                    className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${
                      exportType === type
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-foreground hover:bg-muted"
                    }`}
                    data-testid={`button-export-type-${type}`}
                  >
                    {type === "details" ? "Details" : "Summary"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {exportType === "details"
                  ? "One row per product line item with full order info."
                  : "One row per order — no product breakdown."}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={exportStatus} onValueChange={setExportStatus}>
                <SelectTrigger data-testid="select-export-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Created">Created</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Backordered">Backordered</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Invoiced">Invoiced</SelectItem>
                  <SelectItem value="Dispatched">Dispatched</SelectItem>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                  <SelectItem value="PODReceived">POD Received</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Brands</label>
              <p className="text-xs text-muted-foreground mb-2">Leave all unchecked to include all brands.</p>
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                {BRANDS.map((brand) => {
                  const checked = exportBrands.includes(brand);
                  return (
                    <label
                      key={brand}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border cursor-pointer text-sm transition-colors ${
                        checked
                          ? "bg-primary/10 border-primary/40 text-primary font-medium"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                      data-testid={`label-export-brand-${brand}`}
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={checked}
                        onChange={() =>
                          setExportBrands(prev =>
                            checked ? prev.filter(b => b !== brand) : [...prev, brand]
                          )
                        }
                      />
                      {brand}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              {(() => {
                const count = allOrders.filter(o =>
                  (exportStatus === "all" || o.status === exportStatus) &&
                  (exportBrands.length === 0 || exportBrands.includes(o.brand || ""))
                ).length;
                return <p>Will export <strong>{count}</strong> order{count !== 1 ? "s" : ""}</p>;
              })()}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowExportDialog(false)} data-testid="button-cancel-export">
              Cancel
            </Button>
            <Button 
              onClick={handleExportOrders}
              disabled={isExporting}
              data-testid="button-confirm-export"
            >
              {isExporting ? "Exporting..." : "Export"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={(open) => {
        setShowImportDialog(open);
        if (!open) {
          setImportFile(null);
          setImportBrand("Biostige");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Import Orders
            </DialogTitle>
            <DialogDescription>
              Upload a customer-wise sales summary Excel file. Orders will be created for each customer.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Brand</label>
              <Select value={importBrand} onValueChange={setImportBrand}>
                <SelectTrigger data-testid="select-import-brand">
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {BRANDS.map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="hidden"
                id="import-file-input"
                data-testid="input-import-file"
              />
              <label htmlFor="import-file-input" className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {importFile ? importFile.name : "Click to select Excel file"}
                </p>
              </label>
            </div>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Supported format:</p>
              <p>Customer-wise sales summary with columns:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Name To Display (Customer/Product)</li>
                <li>Entry No. (Invoice Number)</li>
                <li>Entry Date (Invoice Date)</li>
                <li>Qty (Unit1)</li>
                <li>Free Qty (Unit1)</li>
                <li>Rate, Amount</li>
                <li>Net Amount (Actual Invoice Value)</li>
              </ul>
              <p className="mt-2 text-amber-600">Invoice details are extracted automatically from the file.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowImportDialog(false)} data-testid="button-cancel-import">
              Cancel
            </Button>
            <Button 
              onClick={handlePreviewImport} 
              disabled={!importFile || !importBrand || isImporting}
              data-testid="button-preview-import"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Preview Import"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={(open) => {
        if (!open) {
          setShowPreviewDialog(false);
          setImportPreview(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Import Preview
            </DialogTitle>
            <DialogDescription>
              Review detected customers before importing
            </DialogDescription>
          </DialogHeader>
          
          {importPreview && (
            <div className="space-y-4">
              <div className="flex items-center justify-around p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold">{importPreview.totalDetected}</div>
                  <div className="text-sm text-muted-foreground">Customers Found</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{importPreview.willImport}</div>
                  <div className="text-sm text-muted-foreground">Will Import</div>
                </div>
                {importPreview.willSkip > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">{importPreview.willSkip}</div>
                    <div className="text-sm text-muted-foreground">Will Skip</div>
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Invoice</th>
                      <th className="text-center p-2">Products</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.customers.map((customer, i) => (
                      <tr key={i} className={customer.willImport ? '' : 'bg-destructive/10'}>
                        <td className="p-2">{customer.partyName}</td>
                        <td className="p-2">{customer.invoiceNumber || '-'}</td>
                        <td className="text-center p-2">
                          <span className="text-primary">{customer.matchedProducts}</span>
                          {customer.unmatchedProducts > 0 && (
                            <span className="text-destructive"> / {customer.unmatchedProducts} unmatched</span>
                          )}
                        </td>
                        <td className="p-2">
                          {customer.willImport ? (
                            <Badge variant="secondary" className="bg-primary/20">Ready</Badge>
                          ) : (
                            <Badge variant="destructive">{customer.skipReason}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importPreview.customers.some(c => c.unmatchedProducts > 0) && (
                <div className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Unmatched products will be listed in order notes but won't be added as line items.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowPreviewDialog(false);
                    setImportPreview(null);
                    setImportFile(null);
                  }}
                  data-testid="button-cancel-preview"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmImport}
                  disabled={isImporting || importPreview.willImport === 0}
                  data-testid="button-proceed-import"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${importPreview.willImport} Orders`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Import Summary Dialog */}
      <Dialog open={importSummary !== null} onOpenChange={() => setImportSummary(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Import Summary
            </DialogTitle>
          </DialogHeader>
          
          {importSummary && (
            <div className="space-y-4">
              <div className="flex items-center justify-around p-4 bg-muted rounded-lg">
                {importSummary.totalDetected !== undefined && (
                  <div className="text-center">
                    <div className="text-2xl font-bold">{importSummary.totalDetected}</div>
                    <div className="text-sm text-muted-foreground">Customers Found</div>
                  </div>
                )}
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{importSummary.count}</div>
                  <div className="text-sm text-muted-foreground">Orders Created</div>
                </div>
                {importSummary.skipped > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">{importSummary.skipped}</div>
                    <div className="text-sm text-muted-foreground">Skipped</div>
                  </div>
                )}
              </div>

              {importSummary.duplicates && importSummary.duplicates.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-destructive">Duplicate Invoices (Skipped):</h4>
                  <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                    {importSummary.duplicates.map((msg, i) => (
                      <li key={i} className="text-muted-foreground">{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              {importSummary.skippedReasons && importSummary.skippedReasons.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Unmatched Products:</h4>
                  <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                    {importSummary.skippedReasons.map((msg, i) => (
                      <li key={i} className="text-muted-foreground">{msg}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => setImportSummary(null)} data-testid="button-close-summary">
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick Advance: Transport Details Dialog (Invoiced → Dispatched) */}
      <Dialog open={showDispatchDialog} onOpenChange={(open) => {
        if (!open) {
          setShowDispatchDialog(false);
          setDispatchOrder(null);
          setDispatchTransportData(null);
          setDispatchTransportStatus("loading");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Confirm Dispatch
            </DialogTitle>
            <DialogDescription>
              Transport details for this party before moving to Dispatched.
            </DialogDescription>
          </DialogHeader>
          {dispatchOrder && (
            <div className="flex flex-col gap-4">
              {/* Order summary */}
              <div className="p-3 rounded-md bg-muted space-y-1 text-sm">
                <div className="font-medium">{dispatchOrder.brand} — Order #{dispatchOrder.id.slice(-6)}</div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Party: <span className="font-medium text-foreground">{dispatchOrder.partyName || "—"}</span></span>
                  <span>·</span>
                  <span>Total: {formatINR(dispatchOrder.total)}</span>
                </div>
              </div>

              {/* Transport info */}
              {dispatchTransportStatus === "loading" && (
                <div className="flex items-center gap-3 p-4 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>Looking up transport details in CashDesk…</span>
                </div>
              )}

              {dispatchTransportStatus === "found" && dispatchTransportData && (
                <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-100">
                    <Truck className="w-4 h-4 shrink-0" />
                    Transport Details
                    {(dispatchTransportData.matchPercent ?? 100) < 100 && (
                      <span className="ml-auto text-xs font-normal px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                        ~{dispatchTransportData.matchPercent}% match
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {dispatchTransportData.name && (
                      <>
                        <span className="text-muted-foreground">Party (CashDesk)</span>
                        <span className="font-medium">{dispatchTransportData.name}</span>
                      </>
                    )}
                    {dispatchTransportData.transportOption && (
                      <>
                        <span className="text-muted-foreground">Transport</span>
                        <span className="font-medium">{dispatchTransportData.transportOption}</span>
                      </>
                    )}
                    {dispatchTransportData.costPerCarton != null && (
                      <>
                        <span className="text-muted-foreground">Cost / Carton</span>
                        <span className="font-medium">₹{dispatchTransportData.costPerCarton}</span>
                      </>
                    )}
                    {dispatchTransportData.location && (
                      <>
                        <span className="text-muted-foreground">Location</span>
                        <span className="font-medium">{dispatchTransportData.location}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {dispatchTransportStatus === "not_found" && (
                <div className="flex items-center gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>No transport record found in CashDesk for this party.</span>
                </div>
              )}

              {dispatchTransportStatus === "error" && (
                <div className="flex items-center gap-2 p-3 rounded-md border bg-muted text-sm text-muted-foreground">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>CashDesk transport lookup unavailable — you can still proceed.</span>
                </div>
              )}

              {/* Dispatch mandatory fields */}
              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dispatch Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Dispatch By <span className="text-red-500">*</span></label>
                    <Input
                      value={dispatchBy}
                      onChange={e => setDispatchBy(e.target.value)}
                      placeholder="Carrier / person"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Dispatch Date <span className="text-red-500">*</span></label>
                    <Input
                      type="date"
                      value={dispatchDate}
                      onChange={e => setDispatchDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Cases <span className="text-red-500">*</span></label>
                    <Input
                      type="number"
                      min="1"
                      value={dispatchCases}
                      onChange={e => setDispatchCases(e.target.value)}
                      placeholder="No. of cases"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Delivery Company <span className="text-red-500">*</span></label>
                    <select
                      value={dispatchDeliveryCompany}
                      onChange={e => setDispatchDeliveryCompany(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Select…</option>
                      {DELIVERY_COMPANY_OPTIONS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Est. Delivery Date</label>
                  <Input
                    type="date"
                    value={dispatchEstimatedDate}
                    onChange={e => setDispatchEstimatedDate(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDispatchDialog(false);
                    setDispatchOrder(null);
                    setDispatchTransportData(null);
                    setDispatchTransportStatus("loading");
                  }}
                  data-testid="button-dispatch-cancel"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={advanceMutation.isPending || dispatchTransportStatus === "loading" || !dispatchBy.trim() || !dispatchDate || !dispatchCases || !dispatchDeliveryCompany}
                  onClick={() => {
                    if (!dispatchOrder) return;
                    advanceMutation.mutate({
                      id: dispatchOrder.id,
                      status: "Dispatched",
                      dispatchByVal: dispatchBy.trim(),
                      dispatchDateVal: dispatchDate,
                      casesVal: dispatchCases,
                      deliveryCompanyVal: dispatchDeliveryCompany,
                      estimatedDeliveryDateVal: dispatchEstimatedDate || undefined,
                    });
                  }}
                  data-testid="button-dispatch-confirm"
                >
                  {advanceMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Dispatching…
                    </>
                  ) : (
                    "Confirm & Dispatch"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Transport Dispatch Dialog (Transport tab → Dispatch All) */}
      <Dialog open={!!transportBulkGroup} onOpenChange={(open) => {
        if (!open) setTransportBulkGroup(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Confirm Bulk Dispatch
            </DialogTitle>
            <DialogDescription>
              Move <strong>{transportBulkGroup?.orderCount} order{transportBulkGroup?.orderCount !== 1 ? "s" : ""}</strong> via <strong>{transportBulkGroup?.dispatchBy}</strong> to "Dispatched" status.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {/* Summary */}
            <div className="p-3 rounded-md bg-muted space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Orders</span>
                <span className="font-medium">{transportBulkGroup?.orderCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Cases</span>
                <span className="font-medium">{transportBulkGroup?.totalCases || "-"}</span>
              </div>
              {transportBulkGroup?.estimatedCost != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Cost</span>
                  <span className="font-semibold text-green-700 dark:text-green-400">
                    {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(transportBulkGroup.estimatedCost)}
                  </span>
                </div>
              )}
            </div>
            {/* Same required fields as single-order dispatch */}
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dispatch Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Dispatch By <span className="text-red-500">*</span></label>
                  <Input
                    value={bdDispatchBy}
                    onChange={e => setBdDispatchBy(e.target.value)}
                    placeholder="Carrier / person"
                    className="h-8 text-sm"
                    data-testid="input-bd-dispatch-by"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Dispatch Date <span className="text-red-500">*</span></label>
                  <Input
                    type="date"
                    value={bdDispatchDate}
                    onChange={e => setBdDispatchDate(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-bd-dispatch-date"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Delivery Company <span className="text-red-500">*</span></label>
                  <select
                    value={bdDeliveryCompany}
                    onChange={e => setBdDeliveryCompany(e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                    data-testid="select-bd-delivery-company"
                  >
                    <option value="">Select…</option>
                    {DELIVERY_COMPANY_OPTIONS.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Est. Delivery Date</label>
                <Input
                  type="date"
                  value={bdEstimatedDate}
                  onChange={e => setBdEstimatedDate(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-bd-estimated-date"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setTransportBulkGroup(null)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                disabled={!bdDispatchBy.trim() || !bdDispatchDate || !bdDeliveryCompany || bulkTransportDispatchMutation.isPending}
                onClick={() => {
                  if (!transportBulkGroup) return;
                  bulkTransportDispatchMutation.mutate({
                    orderIds: transportBulkGroup.orderIds,
                    dispatchByVal: bdDispatchBy.trim(),
                    dispatchDateVal: bdDispatchDate,
                    deliveryCompanyVal: bdDeliveryCompany,
                    estimatedDeliveryDateVal: bdEstimatedDate || "",
                  });
                }}
                data-testid="button-bd-confirm"
              >
                {bulkTransportDispatchMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Dispatching…</>
                ) : (
                  <>Dispatch {transportBulkGroup?.orderCount} Order{transportBulkGroup?.orderCount !== 1 ? "s" : ""}</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Advance: Delivered Dialog (Dispatched → Delivered) */}
      <Dialog open={showDeliveredDialog} onOpenChange={(open) => {
        if (!open) { setShowDeliveredDialog(false); setDeliveredOrder(null); setDeliveredActualDate(""); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Confirm Delivered
            </DialogTitle>
            <DialogDescription>Enter the actual delivery date to mark this order as Delivered.</DialogDescription>
          </DialogHeader>
          {deliveredOrder && (
            <div className="flex flex-col gap-4">
              <div className="p-3 rounded-md bg-muted space-y-1 text-sm">
                <div className="font-medium">{deliveredOrder.brand} — Order #{deliveredOrder.id.slice(-6)}</div>
                <div className="text-muted-foreground">Party: <span className="font-medium text-foreground">{deliveredOrder.partyName || "—"}</span></div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Actual Delivery Date <span className="text-red-500">*</span></label>
                <Input
                  type="date"
                  value={deliveredActualDate}
                  onChange={e => setDeliveredActualDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1 border-t">
                <Button variant="outline" size="sm" onClick={() => { setShowDeliveredDialog(false); setDeliveredOrder(null); setDeliveredActualDate(""); }}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={advanceMutation.isPending || !deliveredActualDate}
                  onClick={() => {
                    if (!deliveredOrder) return;
                    advanceMutation.mutate({ id: deliveredOrder.id, status: "Delivered", actualDeliveryDateVal: deliveredActualDate });
                  }}
                >
                  {advanceMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</> : "Confirm & Deliver"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quick Advance: Party Name Verification Dialog (Created → Invoiced) */}
      <Dialog open={showPartyVerifyDialog} onOpenChange={(open) => {
        if (!open) {
          setShowPartyVerifyDialog(false);
          setAdvanceOrder(null);
          setAdvancePartyName("");
          setAdvanceVerifyStatus("idle");
          setAdvanceVerifyMatches([]);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify Party Name</DialogTitle>
            <DialogDescription>
              Confirm the party before moving this order to Invoiced.
            </DialogDescription>
          </DialogHeader>
          {advanceOrder && (
            <div className="flex flex-col gap-4">
              {/* Order summary */}
              <div className="p-3 rounded-md bg-muted space-y-1 text-sm">
                <div className="font-medium">{advanceOrder.brand} — Order #{advanceOrder.id.slice(-6)}</div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Current party: <span className="font-medium text-foreground">{advanceOrder.partyName || "—"}</span></span>
                  <span>·</span>
                  <span>Total: {formatINR(advanceOrder.total)}</span>
                </div>
              </div>

              {/* Search input */}
              <div className="space-y-2">
                <Label htmlFor="advance-party-name">Search / Enter Party Name</Label>
                <div className="relative">
                  {advanceVerifyStatus === "verifying" ? (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
                  ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                  <Input
                    id="advance-party-name"
                    value={advancePartyName}
                    onChange={(e) => setAdvancePartyName(e.target.value)}
                    placeholder="Type to look up in CashDesk…"
                    className="pl-9"
                    autoComplete="off"
                    data-testid="input-advance-party-name"
                  />
                </div>
              </div>

              {/* Verification results — pick-list of up to 5 candidates */}
              {advanceVerifyStatus === "verified" && advanceVerifyMatches.length > 0 && (() => {
                const selectedMatch = advanceVerifyMatches.find(
                  m => (m.name || m.Name) === advancePartyName.trim()
                );
                return (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {advanceVerifyMatches.length === 1 ? "CashDesk Match" : `${advanceVerifyMatches.length} CashDesk Matches — tap to select`}
                    </div>
                    <div className="space-y-1.5">
                      {advanceVerifyMatches.map((m, i) => {
                        const mName = m.name || m.Name || "";
                        const isSelected = mName === advancePartyName.trim();
                        const pct = m.matchPercent ?? 100;
                        const isExact = pct >= 100;
                        return (
                          <button
                            key={m.debtorId || i}
                            type="button"
                            onClick={() => setAdvancePartyName(mName)}
                            className={`w-full flex items-center justify-between p-3 rounded-md border text-left transition-colors ${
                              isSelected
                                ? "border-green-300 bg-green-50 dark:bg-green-950/40 dark:border-green-700"
                                : "border-border bg-background hover:bg-muted/60"
                            }`}
                            data-testid={`button-match-party-${i}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isSelected
                                ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                                : <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                              }
                              <div className="min-w-0">
                                <div className={`text-sm font-medium truncate ${isSelected ? "text-green-900 dark:text-green-100" : "text-foreground"}`}>
                                  {mName}
                                </div>
                                {m.location && (
                                  <div className="text-xs text-muted-foreground">{m.location}{m.salesOwner ? ` · ${m.salesOwner}` : ""}</div>
                                )}
                              </div>
                            </div>
                            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ml-2 ${
                              isExact
                                ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                                : "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
                            }`}>
                              {isExact ? "Exact" : "Possible"}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Outstanding balance warning for the selected match */}
                    {selectedMatch && (() => {
                      const outstanding = Number(selectedMatch.outstandingAmount ?? 0);
                      const available = Number(selectedMatch.availableCredit ?? 0);
                      const creditStatus = selectedMatch.creditStatus;
                      const isOverdue = creditStatus ? /overdue|past.?due|delinquent/i.test(creditStatus) : false;
                      const isOverLimit = available < 0;
                      const hasWarning = outstanding > 0 || isOverdue || isOverLimit;
                      if (!hasWarning) return null;
                      return (
                        <div className="p-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 space-y-1" data-testid="warning-outstanding">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-sm space-y-0.5">
                              {outstanding > 0 && (
                                <div className="font-medium text-amber-900 dark:text-amber-100">
                                  Outstanding: {formatINR(outstanding)}
                                  {Number(selectedMatch.outstandingOverdue ?? 0) > 0 && (
                                    <span className="font-normal text-amber-700 dark:text-amber-300"> (overdue: {formatINR(selectedMatch.outstandingOverdue!)})</span>
                                  )}
                                </div>
                              )}
                              {creditStatus && (
                                <div className="text-amber-800 dark:text-amber-200">
                                  Credit status: <span className="font-medium">{creditStatus}</span>
                                </div>
                              )}
                              {isOverLimit && (
                                <div className="text-amber-800 dark:text-amber-200">
                                  Credit limit exceeded (available: {formatINR(available)})
                                </div>
                              )}
                              <div className="text-xs text-amber-700 dark:text-amber-400 pt-0.5">
                                Admin discretion — you can still proceed with invoicing.
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {advanceVerifyStatus === "not_found" && advancePartyName.trim().length >= 2 && (
                <div className="flex items-center gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200" data-testid="warning-not-found">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Not found in CashDesk — double-check the name or proceed with caution.</span>
                </div>
              )}

              {advanceVerifyStatus === "error" && (
                <div className="flex items-center gap-2 p-3 rounded-md border bg-muted text-sm text-muted-foreground" data-testid="warning-api-error">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>CashDesk lookup unavailable — you can still confirm.</span>
                </div>
              )}

              {/* Invoice mandatory fields */}
              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Invoice Number <span className="text-red-500">*</span></label>
                    <Input
                      value={advanceInvoiceNumber}
                      onChange={e => setAdvanceInvoiceNumber(e.target.value)}
                      placeholder="e.g. INV-1234"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Invoice Date <span className="text-red-500">*</span></label>
                    <Input
                      type="date"
                      value={advanceInvoiceDate}
                      onChange={e => setAdvanceInvoiceDate(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Actual Invoice Value (₹) <span className="text-red-500">*</span></label>
                  <Input
                    type="number"
                    value={advanceActualValue}
                    onChange={e => setAdvanceActualValue(e.target.value)}
                    placeholder="e.g. 15000"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-2 justify-between items-center pt-2 border-t">
                <div className="text-xs text-muted-foreground truncate">
                  {advancePartyName.trim() ? (
                    <>Will use: <span className="font-medium text-foreground">{advancePartyName.trim()}</span></>
                  ) : (
                    "No party name entered"
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowPartyVerifyDialog(false);
                      setAdvanceOrder(null);
                      setAdvancePartyName("");
                      setAdvanceVerifyStatus("idle");
                      setAdvanceVerifyMatches([]);
                    }}
                    data-testid="button-advance-party-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!advanceOrder) return;
                      advanceMutation.mutate({
                        id: advanceOrder.id,
                        status: "Invoiced",
                        partyName: advancePartyName.trim() || advanceOrder.partyName || undefined,
                        invoiceNumber: advanceInvoiceNumber.trim(),
                        invoiceDate: advanceInvoiceDate,
                        actualOrderValue: advanceActualValue.trim(),
                      });
                    }}
                    disabled={advanceMutation.isPending || !advancePartyName.trim() || !advanceInvoiceNumber.trim() || !advanceInvoiceDate || !advanceActualValue.trim()}
                    data-testid="button-advance-party-confirm"
                  >
                    {advanceMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Advancing...
                      </>
                    ) : (
                      "Confirm & Invoice"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Split Delivery Cost Dialog */}
      <Dialog open={showSplitCostDialog} onOpenChange={(open) => {
        setShowSplitCostDialog(open);
        if (!open) { setSplitStep(1); setSplitSelectedIds(new Set()); setSplitCosts({ transportCar: "", parking: "", food: "", loadingUnloading: "", truck: "" }); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Split Delivery Cost
            </DialogTitle>
            <DialogDescription>
              {splitStep === 1 && "Step 1 of 3 — Select the orders in this dispatch batch"}
              {splitStep === 2 && "Step 2 of 3 — Enter the delivery cost components"}
              {splitStep === 3 && "Step 3 of 3 — Preview allocation and confirm"}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-2">
            {([1, 2, 3] as const).map((s) => (
              <div key={s} className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold border-2 ${splitStep === s ? "bg-primary text-primary-foreground border-primary" : splitStep > s ? "bg-primary/20 text-primary border-primary/40" : "border-muted-foreground/30 text-muted-foreground"}`}>
                {s}
              </div>
            ))}
          </div>

          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            {/* STEP 1: Select Orders */}
            {splitStep === 1 && (() => {
              const eligibleOrders = allOrders.filter(o =>
                ["Dispatched", "Delivered", "PODReceived"].includes(o.status) &&
                (splitDateFilter ? (o.dispatchDate ? new Date(o.dispatchDate).toISOString().split('T')[0] === splitDateFilter : false) : true) &&
                (splitCompanyFilter !== "all" ? o.deliveryCompany === splitCompanyFilter : true)
              );
              const allChecked = eligibleOrders.length > 0 && eligibleOrders.every(o => splitSelectedIds.has(o.id));
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Dispatch Date</Label>
                      <Input
                        type="date"
                        value={splitDateFilter}
                        onChange={(e) => { setSplitDateFilter(e.target.value); setSplitSelectedIds(new Set()); }}
                        data-testid="input-split-date"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">Delivery Company</Label>
                      <Select value={splitCompanyFilter} onValueChange={(v) => { setSplitCompanyFilter(v); setSplitSelectedIds(new Set()); }}>
                        <SelectTrigger data-testid="select-split-company">
                          <SelectValue placeholder="All companies" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Companies</SelectItem>
                          {DELIVERY_COMPANIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {eligibleOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No dispatched/delivered orders found for the selected date and company.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{eligibleOrders.length} order{eligibleOrders.length !== 1 ? "s" : ""} found</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(checked) => {
                              if (checked) setSplitSelectedIds(new Set(eligibleOrders.map(o => o.id)));
                              else setSplitSelectedIds(new Set());
                            }}
                          />
                          <span>Select all</span>
                        </label>
                      </div>
                      <ScrollArea className="h-64 border rounded-md">
                        <div className="divide-y">
                          {eligibleOrders.map(order => {
                            const checked = splitSelectedIds.has(order.id);
                            return (
                              <label
                                key={order.id}
                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors ${checked ? "bg-primary/5" : ""}`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => {
                                    const next = new Set(splitSelectedIds);
                                    if (c) next.add(order.id); else next.delete(order.id);
                                    setSplitSelectedIds(next);
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{order.partyName || "Unknown"}</div>
                                  <div className="text-xs text-muted-foreground">{order.brand} · #{order.invoiceNumber || order.id.slice(-6)}</div>
                                </div>
                                <div className="text-right text-sm shrink-0">
                                  {order.cases != null ? (
                                    <span className="font-medium">{order.cases} ctns</span>
                                  ) : (
                                    <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">No cases</span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </ScrollArea>
                      {Array.from(splitSelectedIds).some(id => {
                        const o = allOrders.find(x => x.id === id);
                        return !o?.cases;
                      }) && (
                        <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          Some selected orders have no case count and will receive ₹0 allocation.
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}

            {/* STEP 2: Enter Costs */}
            {splitStep === 2 && (() => {
              const total = Object.values(splitCosts).reduce((s, v) => s + (Number(v) || 0), 0);
              return (
                <div className="space-y-3">
                  {[
                    { key: "transportCar", label: "Transport Car" },
                    { key: "parking", label: "Parking" },
                    { key: "food", label: "Food (occasional)" },
                    { key: "loadingUnloading", label: "Loading / Unloading" },
                    { key: "truck", label: "Truck" },
                  ].map(({ key, label }) => (
                    <div key={key} className="grid grid-cols-2 items-center gap-3">
                      <Label className="text-sm">{label}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={splitCosts[key as keyof typeof splitCosts]}
                        onChange={(e) => setSplitCosts({ ...splitCosts, [key]: e.target.value })}
                        placeholder="0"
                        data-testid={`input-split-${key}`}
                      />
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 mt-2 rounded-md bg-muted border font-semibold">
                    <span>Total Delivery Cost</span>
                    <span>{formatINR(total)}</span>
                  </div>
                </div>
              );
            })()}

            {/* STEP 3: Preview */}
            {splitStep === 3 && (() => {
              const totalCost = Object.values(splitCosts).reduce((s, v) => s + (Number(v) || 0), 0);
              const selectedOrders = allOrders.filter(o => splitSelectedIds.has(o.id));
              const totalCases = selectedOrders.reduce((s, o) => s + (o.cases || 0), 0);
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="p-2 rounded-md bg-muted">
                      <div className="font-semibold text-base">{formatINR(totalCost)}</div>
                      <div className="text-muted-foreground text-xs">Total Cost</div>
                    </div>
                    <div className="p-2 rounded-md bg-muted">
                      <div className="font-semibold text-base">{totalCases}</div>
                      <div className="text-muted-foreground text-xs">Total Cartons</div>
                    </div>
                    <div className="p-2 rounded-md bg-muted">
                      <div className="font-semibold text-base">{totalCases > 0 ? formatINR(totalCost / totalCases) : "—"}</div>
                      <div className="text-muted-foreground text-xs">Per Carton</div>
                    </div>
                  </div>

                  <ScrollArea className="h-60 border rounded-md">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80">
                        <tr>
                          <th className="text-left p-2 font-medium text-xs">Party / Brand</th>
                          <th className="text-right p-2 font-medium text-xs">Cases</th>
                          <th className="text-right p-2 font-medium text-xs">Adding</th>
                          <th className="text-right p-2 font-medium text-xs">New Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {selectedOrders.map(order => {
                          const cases = order.cases || 0;
                          const allocated = totalCases > 0 && cases > 0 ? (cases / totalCases) * totalCost : 0;
                          const existing = Number((order as any).deliveryCost) || 0;
                          const newTotal = existing + allocated;
                          return (
                            <tr key={order.id} className={cases === 0 ? "opacity-50" : ""}>
                              <td className="p-2">
                                <div className="font-medium truncate max-w-[160px]">{order.partyName || "Unknown"}</div>
                                <div className="text-xs text-muted-foreground">{order.brand}</div>
                                {existing > 0 && (
                                  <div className="text-xs text-muted-foreground">existing: {formatINR(existing)}</div>
                                )}
                              </td>
                              <td className="p-2 text-right">{cases > 0 ? cases : <span className="text-amber-600 dark:text-amber-400">0</span>}</td>
                              <td className="p-2 text-right text-blue-600 dark:text-blue-400">+{formatINR(Math.round(allocated * 100) / 100)}</td>
                              <td className="p-2 text-right font-medium">{formatINR(Math.round(newTotal * 100) / 100)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t font-semibold bg-muted/50">
                        <tr>
                          <td className="p-2">Total</td>
                          <td className="p-2 text-right">{totalCases}</td>
                          <td className="p-2 text-right text-blue-600 dark:text-blue-400">+{formatINR(totalCost)}</td>
                          <td className="p-2 text-right">{formatINR(selectedOrders.reduce((s, o) => s + (Number((o as any).deliveryCost) || 0), 0) + totalCost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </ScrollArea>
                </div>
              );
            })()}
          </div>

          {/* Footer buttons */}
          <div className="flex justify-between gap-2 pt-4 border-t mt-2">
            <Button variant="outline" onClick={() => { if (splitStep === 1) setShowSplitCostDialog(false); else setSplitStep((splitStep - 1) as 1 | 2 | 3); }} data-testid="button-split-back">
              {splitStep === 1 ? "Cancel" : "Back"}
            </Button>
            {splitStep < 3 ? (
              <Button
                onClick={() => setSplitStep((splitStep + 1) as 2 | 3)}
                disabled={splitStep === 1 && splitSelectedIds.size === 0}
                data-testid="button-split-next"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const totalCost = Object.values(splitCosts).reduce((s, v) => s + (Number(v) || 0), 0);
                  if (totalCost <= 0) { toast({ title: "Total cost must be greater than 0", variant: "destructive" }); return; }
                  splitCostMutation.mutate({
                    orderIds: Array.from(splitSelectedIds),
                    transportCar: Number(splitCosts.transportCar) || 0,
                    parking: Number(splitCosts.parking) || 0,
                    food: Number(splitCosts.food) || 0,
                    loadingUnloading: Number(splitCosts.loadingUnloading) || 0,
                    truck: Number(splitCosts.truck) || 0,
                  });
                }}
                disabled={splitCostMutation.isPending}
                data-testid="button-split-confirm"
              >
                {splitCostMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  "Confirm & Apply"
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
