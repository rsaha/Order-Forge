import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Package,
  Calendar,
  Truck,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  AlertCircle,
  Download,
  Plus,
  Search,
  Minus,
  Trash2,
  MessageCircle,
  Filter,
  Send,
} from "lucide-react";
import { generateWhatsAppMessage, openWhatsApp, type WhatsAppMessageType } from "@/lib/whatsapp";
import { Link, useLocation } from "wouter";
import type { Order, OrderStatus, Product } from "@shared/schema";

const ORDER_STATUSES: OrderStatus[] = ["Created", "Approved", "Invoiced", "Dispatched", "Delivered", "Cancelled"];

const statusColors: Record<OrderStatus, string> = {
  Created: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Approved: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Invoiced: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Dispatched: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const statusIcons: Record<OrderStatus, typeof Package> = {
  Created: FileText,
  Approved: Clock,
  Invoiced: FileText,
  Dispatched: Truck,
  Delivered: CheckCircle,
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

interface OrderEditFormData {
  status: OrderStatus;
  partyName: string;
  deliveryAddress: string;
  invoiceNumber: string;
  invoiceDate: string;
  dispatchDate: string;
  dispatchBy: string;
  cases: string;
  remarks: string;
  estimatedDeliveryDate: string;
  actualDeliveryDate: string;
  deliveryCost: string;
  deliveryNote: string;
}

const BRANDS = ["Tynor", "Morisons", "Karemed", "UM", "Biostige", "Acusure", "Elmeric"];
const DELIVERY_COMPANIES = ["Guided", "Xmaple", "Elemric"];

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
  }>;
}

export default function OrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [deliveryCompanyFilter, setDeliveryCompanyFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"7days" | "today" | "all">("7days");
  const [showBulkWhatsApp, setShowBulkWhatsApp] = useState(false);
  const [bulkType, setBulkType] = useState<"dispatched" | "delivered">("dispatched");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editFormData, setEditFormData] = useState<OrderEditFormData>({
    status: "Created",
    partyName: "",
    deliveryAddress: "",
    invoiceNumber: "",
    invoiceDate: "",
    dispatchDate: "",
    dispatchBy: "",
    cases: "",
    remarks: "",
    estimatedDeliveryDate: "",
    actualDeliveryDate: "",
    deliveryCost: "",
    deliveryNote: "",
  });
  const [orderItems, setOrderItems] = useState<Array<{ productName?: string | null; size?: string | null; quantity: number; freeQuantity?: number; unitPrice: string }>>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  
  const [showAddItems, setShowAddItems] = useState(false);
  const [addItemsSearch, setAddItemsSearch] = useState("");
  const [itemsToAdd, setItemsToAdd] = useState<Array<{ product: Product; quantity: number }>>([]);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToShare, setOrderToShare] = useState<{ order: Order; status: OrderStatus } | null>(null);
  const [pendingWhatsAppShare, setPendingWhatsAppShare] = useState<{ order: Order; status: OrderStatus } | null>(null);

  const isAdmin = user?.isAdmin || false;
  const isBrandAdmin = user?.role === 'BrandAdmin';
  const hasAdminAccess = isAdmin || isBrandAdmin;

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: [hasAdminAccess ? "/api/admin/orders" : "/api/orders", statusFilter, deliveryCompanyFilter, brandFilter, dateRange],
    queryFn: async () => {
      if (hasAdminAccess) {
        const params = new URLSearchParams();
        if (statusFilter !== "all" && statusFilter !== "active") {
          params.append("status", statusFilter);
        }
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
          params.append("includeActive", "true");
        } else if (dateRange === "today") {
          const today = getTodayDate();
          params.append("fromDate", today);
          params.append("toDate", today);
          params.append("includeActive", "true");
        }
        const queryString = params.toString();
        const url = queryString ? `/api/admin/orders?${queryString}` : "/api/admin/orders";
        
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch orders");
        const data: Order[] = await res.json();
        
        const sorted = data.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        
        if (statusFilter === "active") {
          return sorted.filter(o => o.status !== "Cancelled" && o.status !== "Delivered");
        }
        return sorted;
      } else {
        const res = await fetch("/api/orders", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch orders");
        const data: Order[] = await res.json();
        
        let sorted = data.sort((a, b) => 
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        
        if (statusFilter === "active") {
          sorted = sorted.filter(o => o.status !== "Cancelled" && o.status !== "Delivered");
        } else if (statusFilter !== "all") {
          sorted = sorted.filter(o => o.status === statusFilter);
        }
        
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
            const isWithinRange = orderDate >= fromDate;
            const isActive = o.status !== "Cancelled" && o.status !== "Delivered";
            return isWithinRange || isActive;
          });
        } else if (dateRange === "today") {
          const today = getTodayDate();
          sorted = sorted.filter(o => {
            const orderDate = (o.createdAt || '').toString().split('T')[0];
            const isToday = orderDate === today;
            const isActive = o.status !== "Cancelled" && o.status !== "Delivered";
            return isToday || isActive;
          });
        }
        
        return sorted;
      }
    },
    enabled: !!user,
  });

  const { data: bulkSummary = [] } = useQuery<BulkOrderSummary[]>({
    queryKey: ["/api/admin/orders/bulk-summary", bulkType],
    queryFn: async () => {
      const today = getTodayDate();
      const params = new URLSearchParams();
      params.append("status", bulkType === "dispatched" ? "Dispatched" : "Delivered");
      params.append("fromDate", today);
      params.append("toDate", today);
      
      const res = await fetch(`/api/admin/orders/bulk-summary?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bulk summary");
      return res.json();
    },
    enabled: !!user && hasAdminAccess && showBulkWhatsApp,
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
      if (updates.remarks !== undefined) payload.remarks = updates.remarks || null;
      if (updates.estimatedDeliveryDate !== undefined) payload.estimatedDeliveryDate = updates.estimatedDeliveryDate || null;
      if (updates.actualDeliveryDate !== undefined) payload.actualDeliveryDate = updates.actualDeliveryDate || null;
      if (updates.deliveryCost !== undefined) payload.deliveryCost = updates.deliveryCost || null;
      if (updates.deliveryNote !== undefined) payload.deliveryNote = updates.deliveryNote || null;

      return apiRequest("PATCH", `/api/admin/orders/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
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

  const canDeleteOrder = (order: Order): boolean => {
    if (!['Created', 'Approved'].includes(order.status)) return false;
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
      invoiceNumber: order.invoiceNumber || "",
      invoiceDate: order.invoiceDate ? new Date(order.invoiceDate).toISOString().split("T")[0] : "",
      dispatchDate: order.dispatchDate ? new Date(order.dispatchDate).toISOString().split("T")[0] : "",
      dispatchBy: order.dispatchBy || "",
      cases: order.cases?.toString() || "",
      remarks: order.remarks || "",
      estimatedDeliveryDate: order.estimatedDeliveryDate ? new Date(order.estimatedDeliveryDate).toISOString().split("T")[0] : "",
      actualDeliveryDate: order.actualDeliveryDate ? new Date(order.actualDeliveryDate).toISOString().split("T")[0] : "",
      deliveryCost: order.deliveryCost || "",
      deliveryNote: order.deliveryNote || "",
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
    try {
      await apiRequest("PATCH", `/api/admin/orders/${order.id}`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: `Order status updated to ${newStatus}` });
      
      if (newStatus === "Dispatched" || newStatus === "Delivered") {
        setPendingWhatsAppShare({ order: { ...order, status: newStatus }, status: newStatus });
        handleOrderClick({ ...order, status: newStatus });
      }
    } catch (error: any) {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    }
  };

  const handleSave = () => {
    if (!selectedOrder) return;
    updateMutation.mutate({ id: selectedOrder.id, updates: editFormData });
  };

  const handleDownloadCSV = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      
      const data = await res.json();
      const items = data.items || [];
      
      const csvRows = [
        ["Product", "MRP", "Qty", "Free Qty"].join(","),
        ...items.map((item: { productName?: string; unitPrice?: string; quantity: number; freeQuantity?: number }) => 
          [
            `"${(item.productName || "Unknown").replace(/"/g, '""')}"`,
            item.unitPrice || "0",
            item.quantity,
            item.freeQuantity || 0
          ].join(",")
        )
      ];
      
      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      
      const brand = order.partyName ? order.partyName.split(" ")[0] : "Order";
      const partyName = order.partyName || "Unknown";
      const date = order.createdAt ? new Date(order.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      const filename = `${brand}_${partyName}_${date}.csv`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({ title: "CSV downloaded" });
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

  const handleWhatsAppShare = async (order: Order, e: React.MouseEvent) => {
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
      
      const message = generateWhatsAppMessage(orderWithItems, messageType);
      openWhatsApp(message, order.whatsappPhone || undefined);
    } catch (error: any) {
      toast({ title: "Failed to share", description: error.message, variant: "destructive" });
    }
  };

  const isOrderEditable = (order: Order) => {
    return order.status === "Created" || order.status === "Approved";
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
    <div className="flex flex-col h-screen">
      <header className="flex flex-col gap-3 p-4 border-b bg-background">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">Orders</h1>
            <Badge variant="secondary" data-testid="badge-order-count">
              {orders.length} orders
            </Badge>
          </div>

          {hasAdminAccess && (
            <Button
              variant="outline"
              onClick={() => setShowBulkWhatsApp(true)}
              className="gap-2"
              data-testid="button-bulk-whatsapp"
            >
              <Send className="w-4 h-4" />
              Bulk WhatsApp
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Filter className="w-4 h-4" />
          </div>
          
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as "7days" | "today" | "all")}>
            <SelectTrigger className="w-32" data-testid="select-date-filter">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Orders</SelectItem>
              <SelectItem value="all">All Statuses</SelectItem>
              {ORDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-32" data-testid="select-brand-filter">
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
            <SelectTrigger className="w-32" data-testid="select-delivery-filter">
              <SelectValue placeholder="Delivery Co." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Delivery</SelectItem>
              {DELIVERY_COMPANIES.map((company) => (
                <SelectItem key={company} value={company}>
                  {company}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4">
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
                    <tr>
                      <th className="text-left p-3 font-medium">Date</th>
                      <th className="text-left p-3 font-medium">Party Name</th>
                      <th className="text-left p-3 font-medium">Created By</th>
                      <th className="text-left p-3 font-medium">Delivery Notes</th>
                      <th className="text-left p-3 font-medium">Invoice</th>
                      <th className="text-left p-3 font-medium">Delivery Co.</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Delivery Date</th>
                      <th className="text-right p-3 font-medium">Total</th>
                      <th className="text-center p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover-elevate cursor-pointer"
                        onClick={() => handleOrderClick(order)}
                        data-testid={`row-order-${order.id}`}
                      >
                        <td className="p-3 whitespace-nowrap" data-testid={`text-date-${order.id}`}>
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="p-3" data-testid={`text-party-${order.id}`}>
                          <div className="font-medium">{order.partyName || "Unknown"}</div>
                        </td>
                        <td className="p-3" data-testid={`text-created-by-${order.id}`}>
                          {(order as any).createdByName || (order as any).createdByEmail || "-"}
                        </td>
                        <td className="p-3 max-w-[200px]" data-testid={`text-delivery-notes-${order.id}`}>
                          <div className="truncate" title={order.deliveryNote || ""}>
                            {order.deliveryNote || "-"}
                          </div>
                        </td>
                        <td className="p-3" data-testid={`text-invoice-${order.id}`}>
                          {order.invoiceNumber ? (
                            <div>
                              <div className="font-medium">{order.invoiceNumber}</div>
                              {order.invoiceDate && (
                                <div className="text-xs text-muted-foreground">{formatDate(order.invoiceDate)}</div>
                              )}
                            </div>
                          ) : "-"}
                        </td>
                        <td className="p-3" data-testid={`text-delivery-${order.id}`}>
                          {order.deliveryCompany || "-"}
                        </td>
                        <td className="p-3" onClick={(e) => (isAdmin || (isBrandAdmin && order.status === "Approved")) && e.stopPropagation()}>
                          {isAdmin ? (
                            <Select
                              value={order.status}
                              onValueChange={(v) => handleInlineStatusUpdate(order, v as OrderStatus, { stopPropagation: () => {} } as React.MouseEvent)}
                            >
                              <SelectTrigger 
                                className={`w-28 h-7 px-2 text-xs ${statusColors[order.status as OrderStatus]}`}
                                data-testid={`select-status-${order.id}`}
                              >
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
                          ) : isBrandAdmin && order.status === "Approved" ? (
                            <Select
                              value={order.status}
                              onValueChange={(v) => handleInlineStatusUpdate(order, v as OrderStatus, { stopPropagation: () => {} } as React.MouseEvent)}
                            >
                              <SelectTrigger 
                                className={`w-28 h-7 px-2 text-xs ${statusColors[order.status as OrderStatus]}`}
                                data-testid={`select-status-${order.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Approved">Approved</SelectItem>
                                <SelectItem value="Invoiced">Invoiced</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={statusColors[order.status as OrderStatus]} data-testid={`badge-status-${order.id}`}>
                              {order.status}
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap" data-testid={`text-delivery-date-${order.id}`}>
                          {order.status === "Dispatched" && order.estimatedDeliveryDate ? (
                            <div>
                              <div className="text-xs text-muted-foreground">Est:</div>
                              <div>{formatDate(order.estimatedDeliveryDate)}</div>
                            </div>
                          ) : order.status === "Delivered" && order.actualDeliveryDate ? (
                            <div>{formatDate(order.actualDeliveryDate)}</div>
                          ) : "-"}
                        </td>
                        <td className="p-3 text-right font-medium whitespace-nowrap" data-testid={`text-total-${order.id}`}>
                          {formatINR(order.total)}
                        </td>
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => handleWhatsAppShare(order, e)}
                              data-testid={`button-whatsapp-${order.id}`}
                              title="Share on WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                            {hasAdminAccess && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => handleDownloadCSV(order, e)}
                                data-testid={`button-download-${order.id}`}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            )}
                            {canDeleteOrder(order) && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => handleDeleteClick(order, e)}
                                data-testid={`button-delete-${order.id}`}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
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
      </ScrollArea>

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
              {isAdmin ? "Edit Order" : isBrandAdmin && selectedOrder?.status === "Approved" ? "Update Order Status" : "Order Details"}
            </DialogTitle>
            <DialogDescription>
              {isAdmin ? "Update order details and tracking information." : isBrandAdmin && selectedOrder?.status === "Approved" ? "Mark this order as Invoiced." : "View your order details."}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted space-y-2">
                <div className="font-medium">{selectedOrder.partyName || "Unknown Customer"}</div>
                <div className="text-sm text-muted-foreground">
                  Order Total: {formatINR(selectedOrder.total)}
                </div>
                {((selectedOrder as any).createdByName || (selectedOrder as any).createdByEmail) && (
                  <div className="text-sm">
                    <span className="font-medium">Created By: </span>
                    <span className="text-muted-foreground">{(selectedOrder as any).createdByName || (selectedOrder as any).createdByEmail}</span>
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
                <div className="max-h-40 overflow-y-auto">
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
                      {orderItems.map((item, idx) => (
                        <div key={idx} className="px-3 py-2 flex justify-between items-center text-sm">
                          <div>
                            <span className="font-medium">{item.productName || "Unknown Product"}</span>
                            {item.size && item.size !== "Uni" && (
                              <span className="text-muted-foreground ml-2">({item.size})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-muted-foreground">x{item.quantity}</span>
                            {item.freeQuantity && item.freeQuantity > 0 && (
                              <span className="text-xs text-green-600 dark:text-green-400">+{item.freeQuantity} free</span>
                            )}
                            <span>{formatINR(Number(item.unitPrice) * item.quantity)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {isAdmin ? (
                <>
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="status">Status</Label>
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
                    </div>

                    <div>
                      <Label htmlFor="partyName">Party Name</Label>
                      <Input
                        id="partyName"
                        value={editFormData.partyName}
                        onChange={(e) => setEditFormData({ ...editFormData, partyName: e.target.value })}
                        placeholder="Customer name"
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
                        data-testid="input-delivery-address"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="invoiceNumber">Invoice No</Label>
                        <Input
                          id="invoiceNumber"
                          value={editFormData.invoiceNumber}
                          onChange={(e) => setEditFormData({ ...editFormData, invoiceNumber: e.target.value })}
                          placeholder="INV-001"
                          data-testid="input-invoice-number"
                        />
                      </div>
                      <div>
                        <Label htmlFor="invoiceDate">Invoice Date</Label>
                        <Input
                          id="invoiceDate"
                          type="date"
                          value={editFormData.invoiceDate}
                          onChange={(e) => setEditFormData({ ...editFormData, invoiceDate: e.target.value })}
                          data-testid="input-invoice-date"
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
                          data-testid="input-cases"
                        />
                      </div>
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
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="estimatedDeliveryDate">Est. Delivery</Label>
                        <Input
                          id="estimatedDeliveryDate"
                          type="date"
                          value={editFormData.estimatedDeliveryDate}
                          onChange={(e) => setEditFormData({ ...editFormData, estimatedDeliveryDate: e.target.value })}
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

                    <div>
                      <Label htmlFor="remarks">Remarks</Label>
                      <Textarea
                        id="remarks"
                        value={editFormData.remarks}
                        onChange={(e) => setEditFormData({ ...editFormData, remarks: e.target.value })}
                        placeholder="Additional notes..."
                        rows={3}
                        data-testid="input-remarks"
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
                        data-testid="input-delivery-note"
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
                </>
              ) : isBrandAdmin && selectedOrder.status === "Approved" ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Current Status:</span>
                      <Badge className={statusColors[selectedOrder.status as OrderStatus]}>
                        {selectedOrder.status}
                      </Badge>
                    </div>
                    {selectedOrder.invoiceNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Invoice:</span>
                        <span>{selectedOrder.invoiceNumber}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 rounded-md bg-muted/50 border">
                    <p className="text-sm text-muted-foreground">
                      As a Brand Admin, you can mark this order as Invoiced.
                    </p>
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
                        updateMutation.mutate(
                          { id: selectedOrder.id, updates: { status: "Invoiced" } },
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
                  {selectedOrder.remarks && (
                    <div>
                      <span className="text-muted-foreground">Remarks:</span>
                      <p className="mt-1 text-sm">{selectedOrder.remarks}</p>
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

      <Dialog open={!!orderToShare} onOpenChange={(open) => !open && setOrderToShare(null)}>
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
            <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
              <p><span className="font-medium">Party:</span> {orderToShare.order.partyName}</p>
              <p><span className="font-medium">Total:</span> {formatINR(orderToShare.order.total)}</p>
              <p><span className="font-medium">Status:</span> {orderToShare.status}</p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setOrderToShare(null)}
              data-testid="button-skip-whatsapp"
            >
              Skip
            </Button>
            <Button
              onClick={async () => {
                if (orderToShare) {
                  const e = { stopPropagation: () => {} } as React.MouseEvent;
                  await handleWhatsAppShare(orderToShare.order, e);
                  setOrderToShare(null);
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
              Send WhatsApp messages for all orders {bulkType === "dispatched" ? "dispatched" : "delivered"} today, grouped by brand and delivery company.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex gap-2 pb-4">
            <Button
              variant={bulkType === "dispatched" ? "default" : "outline"}
              onClick={() => setBulkType("dispatched")}
              size="sm"
              data-testid="button-bulk-dispatched"
            >
              <Truck className="w-4 h-4 mr-2" />
              Dispatched Today
            </Button>
            <Button
              variant={bulkType === "delivered" ? "default" : "outline"}
              onClick={() => setBulkType("delivered")}
              size="sm"
              data-testid="button-bulk-delivered"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Delivered Today
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {bulkSummary.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No orders {bulkType === "dispatched" ? "dispatched" : "delivered"} today</p>
              </div>
            ) : (
              bulkSummary.map((group, idx) => (
                <Card key={idx} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{group.brand} - {group.deliveryCompany}</h3>
                      <p className="text-sm text-muted-foreground">
                        {group.orderCount} orders | {formatINR(group.totalValue)} | {group.totalCases || 0} cases
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                        const orderLines = group.orders.map(o => 
                          `- ${o.partyName || "Unknown"}: ${formatINR(o.total)} (${o.cases || 0} cases)`
                        ).join("\n");
                        
                        const message = bulkType === "dispatched"
                          ? `*${group.brand} - Orders Dispatched Today*\n\nTransport: ${group.deliveryCompany}\nDate: ${today}\n\n*Orders (${group.orderCount}):*\n${orderLines}\n\n*Total Value:* ${formatINR(group.totalValue)}\n*Total Cases:* ${group.totalCases || 0}`
                          : `*${group.brand} - Orders Delivered Today*\n\nTransport: ${group.deliveryCompany}\nDate: ${today}\n\n*Orders (${group.orderCount}):*\n${orderLines}\n\n*Total Value:* ${formatINR(group.totalValue)}\n*Total Cases:* ${group.totalCases || 0}`;
                        
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
    </div>
  );
}
