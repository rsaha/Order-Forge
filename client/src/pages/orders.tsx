import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
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
} from "lucide-react";
import { generateWhatsAppMessage, openWhatsApp, type WhatsAppMessageType } from "@/lib/whatsapp";
import { Link, useLocation } from "wouter";
import type { Order, OrderStatus, Product } from "@shared/schema";
import * as XLSX from "xlsx";

const ORDER_STATUSES: OrderStatus[] = ["Created", "Approved", "Pending", "Invoiced", "Dispatched", "Delivered", "PODReceived", "Cancelled"];

const statusColors: Record<OrderStatus, string> = {
  Created: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Invoiced: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Dispatched: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Delivered: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  PODReceived: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const tabColors: Record<OrderStatus, string> = {
  Created: "border-blue-500 text-blue-700 dark:text-blue-300",
  Approved: "border-green-500 text-green-700 dark:text-green-300",
  Invoiced: "border-purple-500 text-purple-700 dark:text-purple-300",
  Pending: "border-amber-500 text-amber-700 dark:text-amber-300",
  Dispatched: "border-orange-500 text-orange-700 dark:text-orange-300",
  Delivered: "border-teal-500 text-teal-700 dark:text-teal-300",
  PODReceived: "border-indigo-500 text-indigo-700 dark:text-indigo-300",
  Cancelled: "border-gray-500 text-gray-700 dark:text-gray-300",
};

const tabBgColors: Record<OrderStatus, string> = {
  Created: "bg-blue-50 dark:bg-blue-950",
  Approved: "bg-green-50 dark:bg-green-950",
  Invoiced: "bg-purple-50 dark:bg-purple-950",
  Pending: "bg-amber-50 dark:bg-amber-950",
  Dispatched: "bg-orange-50 dark:bg-orange-950",
  Delivered: "bg-teal-50 dark:bg-teal-950",
  PODReceived: "bg-indigo-50 dark:bg-indigo-950",
  Cancelled: "bg-gray-50 dark:bg-gray-950",
};

const statusIcons: Record<OrderStatus, typeof Package> = {
  Created: FileText,
  Approved: Clock,
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

const BRANDS = ["Tynor", "Morison", "Karemed", "UM", "Biostige", "ACCUSURE", "Elmeric", "Blefit"];
const DELIVERY_COMPANIES = ["Guided", "Xmaple", "Elmeric"];

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

export default function OrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<OrderStatus>("Created");
  const [deliveryCompanyFilter, setDeliveryCompanyFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateRange, setDateRange] = useState<"7days" | "30days" | "lastMonth" | "thisMonth" | "today" | "all">("today");
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
  const [importInvoiceDate, setImportInvoiceDate] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStatus, setExportStatus] = useState<string>("all");
  const [exportBrand, setExportBrand] = useState<string>("all");
  const [isExporting, setIsExporting] = useState(false);
  const [orderForPendingCreation, setOrderForPendingCreation] = useState<Order | null>(null);

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

  // Filter orders by search query across all statuses, or by current status tab
  // PODReceived orders are only visible to Admin users
  const orders = useMemo(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      return allOrders.filter(o => {
        // Hide PODReceived orders from non-admin users in search results
        if (o.status === "PODReceived" && !isAdmin) return false;
        const partyMatch = o.partyName?.toLowerCase().includes(query);
        const invoiceMatch = o.invoiceNumber?.toLowerCase().includes(query);
        const createdByName = (o as any).createdByName?.toLowerCase().includes(query);
        const createdByEmail = (o as any).createdByEmail?.toLowerCase().includes(query);
        return partyMatch || invoiceMatch || createdByName || createdByEmail;
      });
    }
    return allOrders.filter(o => o.status === statusFilter);
  }, [allOrders, searchQuery, statusFilter, isAdmin]);
  
  // Count orders by status for tab badges
  const statusCounts: Record<OrderStatus, number> = {
    Created: allOrders.filter(o => o.status === "Created").length,
    Approved: allOrders.filter(o => o.status === "Approved").length,
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
    queryKey: ["/api/products/by-brand"],
    enabled: !!user && showAddItems,
    staleTime: 5 * 60 * 1000, // 5 minutes - products rarely change
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
        const res = await fetch(`/api/admin/orders/${selectedOrder.id}`, { credentials: "include" });
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

  const canDeleteOrder = (order: Order): boolean => {
    if (order.status !== 'Created') return false;
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
      if (order.status === "Dispatched") {
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
    return order.status === "Created" || order.status === "Approved" || order.status === "Pending";
  };

  const filteredProducts = products.filter((p) => {
    if (!selectedOrder?.brand) return false;
    if (p.brand !== selectedOrder.brand) return false;
    const search = addItemsSearch.toLowerCase();
    return p.name.toLowerCase().includes(search) ||
           p.sku.toLowerCase().includes(search);
  });

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
      if (exportBrand !== "all") {
        ordersToExport = ordersToExport.filter(o => o.brand === exportBrand);
      }
      
      if (ordersToExport.length === 0) {
        toast({ title: "No orders match the selected filters", variant: "destructive" });
        setIsExporting(false);
        return;
      }

      // Fetch items for each order
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

      // Create worksheet data
      const wsData: any[][] = [
        ["Order Date", "Order ID", "Party Name", "Brand", "Status", "Created By", "Product", "Size", "Qty", "Free Qty", "Unit Price", "Line Total", "Order Total", "Notes", "Delivery Company", "Invoice #", "Invoice Date"]
      ];

      ordersWithItems.forEach(({ order, items }) => {
        items.forEach((item: any, idx: number) => {
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
            item.freeQuantity || 0,
            Number(item.unitPrice) || 0,
            (item.quantity * Number(item.unitPrice)) || 0,
            idx === 0 ? Number(order.total) || 0 : "",
            idx === 0 ? order.specialNotes || "" : "",
            idx === 0 ? order.deliveryCompany || "" : "",
            idx === 0 ? order.invoiceNumber || "" : "",
            idx === 0 ? order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : "" : ""
          ]);
        });
        // If no items, still add order row
        if (items.length === 0) {
          wsData.push([
            order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "",
            order.id,
            order.partyName || "",
            order.brand || "",
            order.status,
            formatCreatedBy(order),
            "",
            "",
            0,
            0,
            0,
            0,
            Number(order.total) || 0,
            order.specialNotes || "",
            order.deliveryCompany || "",
            order.invoiceNumber || "",
            order.invoiceDate ? new Date(order.invoiceDate).toLocaleDateString() : ""
          ]);
        }
      });

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      
      // Generate filename with filters
      const filterParts = [exportStatus !== "all" ? exportStatus.toLowerCase() : "all"];
      if (exportBrand !== "all") filterParts.push(exportBrand);
      const filename = `orders_${filterParts.join("_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
      
      XLSX.writeFile(wb, filename);
      toast({ title: `Exported ${ordersWithItems.length} orders` });
      setShowExportDialog(false);
    } catch (error) {
      toast({ title: "Export failed", description: String(error), variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportOrders = async () => {
    if (!importFile || !importBrand) return;
    
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("brand", importBrand);
      if (importInvoiceDate) {
        formData.append("invoiceDate", importInvoiceDate);
      }
      
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
      toast({ title: `Imported ${result.count} orders successfully` });
      setShowImportDialog(false);
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
              onClick={() => setStatusFilter(status)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                statusFilter === status
                  ? `${tabColors[status]} ${tabBgColors[status]} border-b-2`
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              data-testid={`tab-status-${status.toLowerCase()}`}
            >
              {status}
              {statusCounts[status] > 0 && (
                <Badge 
                  variant="secondary" 
                  className={`text-xs px-1.5 py-0 min-w-5 h-5 ${statusFilter === status ? statusColors[status] : ""}`}
                >
                  {statusCounts[status]}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
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
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Delivery Co.</th>
                        <th className="text-center p-2 font-medium hidden md:table-cell">Pending</th>
                        <th className="text-center p-2 font-medium"></th>
                      </tr>
                    )}
                    {/* Pending Tab Headers */}
                    {!searchQuery.trim() && statusFilter === "Pending" && (
                      <tr>
                        <th className="text-left p-2 font-medium text-xs">Date</th>
                        <th className="text-left p-2 font-medium">Party</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Brand</th>
                        <th className="text-left p-2 font-medium hidden md:table-cell">Parent Order</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Notes</th>
                        <th className="text-right p-2 font-medium">Total</th>
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
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Delivery Co.</th>
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
                        {/* Created Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Created" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden md:table-cell text-sm">{formatCreatedBy(order)}</td>
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
                                    data-testid={`button-create-pending-created-${order.id}`}
                                  >
                                    <GitBranch className="w-4 h-4" />
                                  </Button>
                                )}
                                {canDeleteOrder(order) && <Button size="icon" variant="ghost" onClick={(e) => handleDeleteClick(order, e)} title="Delete Order" className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>}
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
                            <td className="p-2 hidden lg:table-cell text-sm">{order.deliveryCompany || "-"}</td>
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
                              </div>
                            </td>
                          </>
                        )}
                        {/* Pending Tab Cells */}
                        {!searchQuery.trim() && statusFilter === "Pending" && (
                          <>
                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
                            <td className="p-2"><div className="font-medium text-sm">{order.partyName || "Unknown"}</div></td>
                            <td className="p-2 hidden lg:table-cell text-sm">{order.brand || "-"}</td>
                            <td className="p-2 hidden md:table-cell text-sm">{order.parentOrderId ? `#${order.parentOrderId.slice(-6)}` : "-"}</td>
                            <td className="p-2 max-w-[200px] hidden lg:table-cell"><div className="truncate text-sm" title={order.specialNotes || ""}>{order.specialNotes || "-"}</div></td>
                            <td className="p-2 text-right font-medium whitespace-nowrap">{formatINR(order.total)}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
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
                            <td className="p-2 hidden lg:table-cell text-sm">{order.deliveryCompany || "-"}</td>
                            <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-0">
                                <Button size="icon" variant="ghost" onClick={(e) => handleWhatsAppShare(order, e)} title="Share on WhatsApp"><MessageCircle className="w-4 h-4" /></Button>
                                {hasAdminAccess && <Button size="icon" variant="ghost" onClick={(e) => handleDownloadXLS(order, e)}><Download className="w-4 h-4" /></Button>}
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
                            <td className="p-2 hidden md:table-cell text-xs whitespace-nowrap">{order.podTimestamp ? new Date(order.podTimestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "-"}</td>
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
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={async (open) => {
        if (!open) {
          const pendingShare = pendingWhatsAppShare;
          const orderId = selectedOrder?.id;
          setSelectedOrder(null);
          setPendingWhatsAppShare(null);
          
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

              {/* POD Status Toggle - only visible for Admin when order is Dispatched or Delivered */}
              {isAdmin && (selectedOrder.status === "Dispatched" || selectedOrder.status === "Delivered") && (
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
                  {isOrderEditable(selectedOrder) && hasAdminAccess && (
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
                            {ORDER_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="partyName">Party Name {["Invoiced", "Dispatched", "Delivered", "PODReceived"].includes(selectedOrder.status) && <span className="text-xs text-muted-foreground">(locked)</span>}</Label>
                      <Input
                        id="partyName"
                        value={editFormData.partyName}
                        onChange={(e) => setEditFormData({ ...editFormData, partyName: e.target.value })}
                        placeholder="Customer name"
                        disabled={["Invoiced", "Dispatched", "Delivered", "PODReceived"].includes(selectedOrder.status)}
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
                            disabled={selectedOrder.status === "PODReceived"}
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
                          disabled={selectedOrder.status === "PODReceived"}
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
                    <div className="flex justify-end gap-2 pt-4">
                      <div className="flex-1 p-3 rounded-md bg-muted/50 border">
                        <p className="text-sm text-muted-foreground">
                          This order has reached POD Received status. No further changes are allowed.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedOrder(null)}
                        data-testid="button-close-order"
                      >
                        Close
                      </Button>
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
                        <div className="font-medium truncate">{product.name}</div>
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
                        <div className="font-medium truncate">{item.product.name}</div>
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
          setExportBrand("all");
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
              <label className="text-sm font-medium mb-2 block">Brand</label>
              <Select value={exportBrand} onValueChange={setExportBrand}>
                <SelectTrigger data-testid="select-export-brand">
                  <SelectValue placeholder="Select brand" />
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
            </div>

            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              <p>
                {exportStatus === "all" && exportBrand === "all" 
                  ? `Will export all ${allOrders.length} orders`
                  : `Will export ${allOrders.filter(o => 
                      (exportStatus === "all" || o.status === exportStatus) &&
                      (exportBrand === "all" || o.brand === exportBrand)
                    ).length} orders`
                }
              </p>
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
          setImportInvoiceDate("");
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

            <div>
              <label className="text-sm font-medium mb-2 block">Invoice Date</label>
              <Input
                type="date"
                value={importInvoiceDate}
                onChange={(e) => setImportInvoiceDate(e.target.value)}
                data-testid="input-import-invoice-date"
              />
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
                <li>Qty (Unit1)</li>
                <li>Free Qty (Unit1)</li>
                <li>Amount</li>
              </ul>
              <p className="mt-2 text-amber-600">Products are matched by name to your catalog.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowImportDialog(false)} data-testid="button-cancel-import">
              Cancel
            </Button>
            <Button 
              onClick={handleImportOrders} 
              disabled={!importFile || !importBrand || isImporting}
              data-testid="button-confirm-import"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
