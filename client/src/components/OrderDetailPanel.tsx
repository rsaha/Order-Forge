import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { filterProductsWithFuzzySearch } from "@/lib/fuzzySearch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle, AlertCircle, Loader2, ChevronDown, Plus, Search, Minus,
  Trash2, MessageCircle, Pencil, Check, X, XCircle, ClipboardCheck,
  GitBranch, Download,
} from "lucide-react";
import { generateWhatsAppMessage, openWhatsApp, type WhatsAppMessageType } from "@/lib/whatsapp";
import type { Order, OrderStatus, Product } from "@shared/schema";
import * as XLSX from "xlsx";

/* ─── constants ─── */
const ORDER_STATUSES: OrderStatus[] = [
  "Online", "Created", "Approved", "Backordered", "Pending", "Invoiced",
  "PaymentPending", "Dispatched", "Delivered", "PODReceived", "Cancelled",
];

const DELIVERY_COMPANIES = ["Guided", "Xmaple", "Elmeric", "Guided Kol"];

const statusColors: Record<OrderStatus, string> = {
  Online: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  Created: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Backordered: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  Invoiced: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  PaymentPending: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-200",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Dispatched: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Delivered: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  PODReceived: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

/* ─── helpers ─── */
function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatINR(amount: string | number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 0,
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

type OrderItem = {
  id: string;
  productName?: string | null;
  size?: string | null;
  quantity: number;
  freeQuantity?: number;
  unitPrice: string;
  caseSize?: number;
};

/* ─── props ─── */
export interface OrderDetailPanelProps {
  /** The order to display. Use `key={order.id}` on the component to force re-mount when order changes. */
  order: Order;
  isAdmin: boolean;
  isBrandAdmin: boolean;
  hasAdminAccess: boolean;
  isCustomer?: boolean;
  userId?: string;
  pendingOrderLookup?: Map<string, Order>;
  onClose: () => void;
  onViewPendingOrder?: (order: Order) => void;
  onPendingWhatsApp?: (payload: { order: Order; status: OrderStatus }) => void;
}

/* ─── component ─── */
export function OrderDetailPanel({
  order,
  isAdmin,
  isBrandAdmin,
  hasAdminAccess,
  isCustomer = false,
  userId,
  pendingOrderLookup = new Map(),
  onClose,
  onViewPendingOrder,
  onPendingWhatsApp,
}: OrderDetailPanelProps) {
  const { toast } = useToast();

  // Local order state — updated by mutations (POD status, total changes, etc.)
  const [localOrder, setLocalOrder] = useState<Order>(order);

  // Order items
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  // Item editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemQty, setEditingItemQty] = useState<number>(0);
  const [editingItemFreeQty, setEditingItemFreeQty] = useState<number>(0);

  // Add items
  const [showAddItems, setShowAddItems] = useState(false);
  const [addItemsSearch, setAddItemsSearch] = useState("");
  const [itemsToAdd, setItemsToAdd] = useState<Array<{ product: Product; quantity: number }>>([]);

  // Party verification (admin only)
  const [showVerifyParty, setShowVerifyParty] = useState(false);
  const [verifyPartyName, setVerifyPartyName] = useState("");
  const [verifyPartyResult, setVerifyPartyResult] = useState<{
    verified: boolean; found: boolean; verifiedName?: string;
    outstandingAmount?: number; creditLimit?: number; availableCredit?: number;
    creditStatus?: string; location?: string; message?: string;
  } | null>(null);

  // Pending order creation
  const [orderForPendingCreation, setOrderForPendingCreation] = useState<Order | null>(null);

  // Edit form — initialized from the order on mount
  const normalizedStatus = ORDER_STATUSES.find(
    s => s.toLowerCase() === (order.status || "created").toLowerCase()
  ) || "Created";

  const [editFormData, setEditFormData] = useState<OrderEditFormData>({
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

  // Fetch order items on mount
  useEffect(() => {
    setLoadingItems(true);
    const endpoint = hasAdminAccess
      ? `/api/admin/orders/${order.id}`
      : `/api/orders/${order.id}`;
    fetch(endpoint, { credentials: "include" })
      .then(res => res.ok ? res.json() : { items: [] })
      .then(data => setOrderItems(data.items || []))
      .catch(() => setOrderItems([]))
      .finally(() => setLoadingItems(false));
  }, []);

  // Products for add-items (lazy loaded)
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products/by-brand", order.brand],
    enabled: showAddItems && !!order.brand,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Popularity counts for smart product sorting
  const { data: popularityCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/products/popularity"],
    enabled: showAddItems,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const filteredProducts = useMemo(() => {
    if (!order.brand) return [];
    const brandProducts = products.filter(p => p.brand === order.brand);
    return filterProductsWithFuzzySearch(brandProducts, addItemsSearch, null, popularityCounts);
  }, [products, order.brand, addItemsSearch, popularityCounts]);

  /* ─── mutations ─── */

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
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Order updated successfully" });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update order", description: error.message, variant: "destructive" });
    },
  });

  const addItemsMutation = useMutation({
    mutationFn: async ({ orderId, items }: { orderId: string; items: Array<{ productId: string; quantity: number }> }) => {
      return apiRequest("POST", `/api/orders/${orderId}/items`, { items });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Items added successfully" });
      setShowAddItems(false);
      setItemsToAdd([]);
      setAddItemsSearch("");
      // Refresh items and total
      const endpoint = hasAdminAccess ? `/api/admin/orders/${localOrder.id}` : `/api/orders/${localOrder.id}`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOrderItems(data.items || []);
        setLocalOrder(prev => ({ ...prev, total: data.total }));
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add items", description: error.message, variant: "destructive" });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ orderId, itemId, quantity, freeQuantity }: {
      orderId: string; itemId: string; quantity: number; freeQuantity: number;
    }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/items/${itemId}`, { quantity, freeQuantity });
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Item updated" });
      setEditingItemId(null);
      if (data.order) {
        setLocalOrder(prev => ({ ...prev, total: data.order.total }));
        const endpoint = hasAdminAccess ? `/api/admin/orders/${localOrder.id}` : `/api/orders/${localOrder.id}`;
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
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Item removed" });
      if (data.order) {
        setLocalOrder(prev => ({ ...prev, total: data.order.total }));
        const endpoint = hasAdminAccess ? `/api/admin/orders/${localOrder.id}` : `/api/orders/${localOrder.id}`;
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
      if (isPodReceived) payload.status = "PODReceived";
      const res = await apiRequest("PATCH", `/api/admin/orders/${orderId}/pod-status`, payload);
      return res.json();
    },
    onSuccess: (data: Order, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "POD status updated successfully" });
      const isPodReceived = variables.podStatus === "Received" || variables.podStatus === "Digital Received";
      setLocalOrder(prev => ({
        ...prev,
        podStatus: variables.podStatus,
        podTimestamp: isPodReceived ? new Date() : prev.podTimestamp,
        status: data.status || prev.status,
      } as Order));
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
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Pending order created successfully", description: "A new order with out-of-stock items has been created." });
      setOrderForPendingCreation(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create pending order", description: error.message, variant: "destructive" });
      setOrderForPendingCreation(null);
    },
  });

  const verifyPartyMutation = useMutation({
    mutationFn: async ({ orderId, partyName, updateOrder }: {
      orderId: string; partyName?: string; updateOrder?: boolean;
    }) => {
      const res = await apiRequest("POST", `/api/admin/orders/${orderId}/verify-party`, { partyName, updateOrder });
      return res.json();
    },
    onSuccess: (data) => {
      setVerifyPartyResult(data);
      if (data.partyUpdated) {
        setLocalOrder(prev => ({ ...prev, partyName: data.verifiedName }));
        setEditFormData(prev => ({ ...prev, partyName: data.verifiedName }));
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
        toast({ title: "Party name updated", description: `Updated to: ${data.verifiedName}` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to verify party", description: error.message, variant: "destructive" });
      setVerifyPartyResult({ verified: false, found: false, message: error.message });
    },
  });

  /* ─── handlers ─── */

  const PRE_INVOICE_STATUSES = ["Online", "Created", "Approved", "Pending", "Backordered"];
  const isOrderEditable = (o: Order) => PRE_INVOICE_STATUSES.includes(o.status);

  const handleSave = () => {
    if (editFormData.status === "Invoiced" || editFormData.status === "PaymentPending" || editFormData.status === "Dispatched") {
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
    updateMutation.mutate({ id: localOrder.id, updates: editFormData });
  };

  const handleVerifyParty = (updateOrder = false) => {
    verifyPartyMutation.mutate({
      orderId: localOrder.id,
      partyName: verifyPartyName || undefined,
      updateOrder,
    });
  };

  const handleWhatsAppShare = async () => {
    try {
      const endpoint = hasAdminAccess
        ? `/api/admin/orders/${localOrder.id}`
        : `/api/orders/${localOrder.id}`;
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      const data = await res.json();
      const orderWithItems = {
        ...localOrder,
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
        createdByName: (localOrder as any).createdByName || null,
        items: (data.items || []).map((item: any) => ({
          ...item,
          price: item.unitPrice || "0",
          product: { name: item.productName || "Unknown Product", price: item.unitPrice || "0" },
        })),
        user: data.user || null,
      };
      let messageType: WhatsAppMessageType = "created";
      const st = localOrder.status;
      if (st === "Pending") messageType = "pending";
      else if (st === "Approved") messageType = "approved";
      else if (st === "Backordered") messageType = "backordered";
      else if (st === "Invoiced") messageType = "invoiced";
      else if (st === "Dispatched") messageType = "dispatched";
      else if (st === "Delivered") messageType = "delivered";
      const message = generateWhatsAppMessage(orderWithItems as any, messageType);
      openWhatsApp(message, (localOrder as any).whatsappPhone || undefined);
    } catch (error: any) {
      toast({ title: "Failed to share", description: error.message, variant: "destructive" });
    }
  };

  const handleDownloadXLS = async () => {
    try {
      const res = await fetch(`/api/admin/orders/${localOrder.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      const data = await res.json();
      const items = data.items || [];
      const worksheetData = [
        ["Product", "MRP", "Qty", "Free Qty"],
        ...items.map((item: any) => [
          item.productName || "Unknown",
          item.unitPrice || "0",
          item.quantity,
          item.freeQuantity || 0,
        ]),
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Order");
      const brand = localOrder.brand || "Order";
      const partyName = localOrder.partyName || "Unknown";
      const date = localOrder.createdAt ? new Date(localOrder.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      const filename = `${brand}_${partyName}_${date}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g, "_");
      XLSX.writeFile(workbook, filename);
      toast({ title: "Excel file downloaded" });
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
    }
  };

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
        return { ...i, quantity: Math.max(1, i.quantity + delta) };
      }
      return i;
    }));
  };

  const handleRemoveItemFromList = (productId: string) => {
    setItemsToAdd(itemsToAdd.filter(i => i.product.id !== productId));
  };

  const handleConfirmAddItems = () => {
    if (itemsToAdd.length === 0) return;
    addItemsMutation.mutate({
      orderId: localOrder.id,
      items: itemsToAdd.map(i => ({ productId: i.product.id, quantity: i.quantity })),
    });
  };

  /* ─── render ─── */
  return (
    <>
      {/* ── Main panel content ── */}
      <div className="space-y-4">
        {/* Order summary header */}
        <div className="p-3 rounded-md bg-muted space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium">{localOrder.partyName || "Unknown Customer"}</div>
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleWhatsAppShare}
                title="Share on WhatsApp"
                data-testid="button-panel-whatsapp"
              >
                <MessageCircle className="w-4 h-4" />
              </Button>
              {hasAdminAccess && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={handleDownloadXLS}
                  title="Download Excel"
                  data-testid="button-panel-download"
                >
                  <Download className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Order Total: {formatINR(localOrder.total)}
          </div>
          {localOrder.actualOrderValue && (
            <div className="text-sm">
              <span className="font-medium">Actual Invoice Value: </span>
              <span className="text-muted-foreground">{formatINR(Number(localOrder.actualOrderValue))}</span>
            </div>
          )}
          {pendingOrderLookup.has(localOrder.id) && (
            <div className="flex items-center gap-2 text-sm">
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                <AlertCircle className="w-3 h-3 mr-1" />
                Has Pending Order
              </Badge>
              <span className="text-muted-foreground text-xs">
                #{pendingOrderLookup.get(localOrder.id)?.id.slice(-6)}
              </span>
            </div>
          )}
          {((localOrder as any).createdByName || (localOrder as any).createdByEmail) && (
            <div className="text-sm">
              <span className="font-medium">Created By: </span>
              <span className="text-muted-foreground">{formatCreatedBy(localOrder)}</span>
            </div>
          )}
          {localOrder.approvedBy && (
            <div className="text-sm">
              <span className="font-medium">Approved By: </span>
              <span className="text-muted-foreground">{localOrder.approvedBy}</span>
              {localOrder.approvedAt && (
                <span className="text-muted-foreground ml-1">
                  ({new Date(localOrder.approvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })})
                </span>
              )}
            </div>
          )}
          {localOrder.deliveryAddress && (
            <div className="text-sm mt-1">
              <span className="font-medium">Delivery Notes: </span>
              <span className="text-muted-foreground">{localOrder.deliveryAddress}</span>
            </div>
          )}
          {localOrder.deliveryCompany && (
            <div className="text-sm">
              <span className="font-medium">Delivery Company: </span>
              <span className="text-muted-foreground">{localOrder.deliveryCompany}</span>
            </div>
          )}
        </div>

        {/* POD Status Toggle — admin only, when Delivered */}
        {isAdmin && localOrder.status === "Delivered" && (
          <div className="p-3 rounded-md border bg-muted/30 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">POD Status</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={
                  localOrder.podStatus === "Received" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
                    localOrder.podStatus === "Digital Received" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                }>
                  {localOrder.podStatus || "Pending"}
                </Badge>
                {(!localOrder.podStatus || localOrder.podStatus === "Pending") ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => updatePodStatusMutation.mutate({ orderId: localOrder.id, podStatus: "Received" })}
                      disabled={updatePodStatusMutation.isPending}
                      data-testid="button-mark-pod-received"
                    >
                      {updatePodStatusMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                      Received
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => updatePodStatusMutation.mutate({ orderId: localOrder.id, podStatus: "Digital Received" })}
                      disabled={updatePodStatusMutation.isPending}
                      data-testid="button-mark-pod-digital"
                    >
                      {updatePodStatusMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                      Digital
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm" variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => updatePodStatusMutation.mutate({ orderId: localOrder.id, podStatus: "Pending" })}
                    disabled={updatePodStatusMutation.isPending}
                    data-testid="button-reset-pod"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            {(localOrder as any).podTimestamp && (
              <div className="text-xs text-muted-foreground">
                POD received on {new Date((localOrder as any).podTimestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            )}
          </div>
        )}

        {/* Party Verification — admin only, for Invoiced+ orders */}
        {isAdmin && ["Invoiced", "Dispatched", "Delivered", "PODReceived"].includes(localOrder.status) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">Party: </span>
                <span className="text-muted-foreground">{localOrder.partyName}</span>
              </div>
              {!showVerifyParty && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => {
                    setShowVerifyParty(true);
                    setVerifyPartyName(localOrder.partyName || "");
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
                    {verifyPartyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  </Button>
                </div>
                {verifyPartyResult && (
                  <div className={`p-3 rounded-md text-sm ${verifyPartyResult.found ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800"}`}>
                    {verifyPartyResult.found ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="font-medium">Party Found</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div><span className="font-medium">Verified Name:</span> {verifyPartyResult.verifiedName}</div>
                          {verifyPartyResult.location && <div><span className="font-medium">Location:</span> {verifyPartyResult.location}</div>}
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
                        {verifyPartyResult.verifiedName !== localOrder.partyName && (
                          <div className="flex gap-2 mt-2 pt-2 border-t border-green-200 dark:border-green-800">
                            <Button
                              size="sm"
                              onClick={() => handleVerifyParty(true)}
                              disabled={verifyPartyMutation.isPending}
                              data-testid="button-update-party-name"
                            >
                              {verifyPartyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                              Update to Verified Name
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowVerifyParty(false)} data-testid="button-keep-party-name">
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
                          {verifyPartyResult.message || "The party name could not be verified."}
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => setVerifyPartyResult(null)} data-testid="button-try-again">Try Different Name</Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowVerifyParty(false)} data-testid="button-close-verify">Close</Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Import text */}
        {(localOrder as any).importText && (
          <Collapsible className="border rounded-md" data-testid="collapsible-import-text">
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 text-sm font-medium hover:bg-muted/50">
              <span>Original Import Text</span>
              <ChevronDown className="w-4 h-4 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-0">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted p-2 rounded max-h-40 overflow-y-auto" data-testid="text-import-original">
                  {(localOrder as any).importText}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Products list */}
        <div className="border rounded-md">
          <div className="p-3 border-b bg-muted/50 flex justify-between items-center gap-2">
            <h4 className="font-medium text-sm">Products Ordered</h4>
            {isOrderEditable(localOrder) && (hasAdminAccess || localOrder.userId === userId) && (
              <Button size="sm" variant="outline" onClick={() => setShowAddItems(true)} data-testid="button-add-items">
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
              <div className="p-3 text-sm text-muted-foreground text-center">No items found</div>
            ) : (
              <div className="divide-y">
                {orderItems.map((item) => {
                  const canEdit = isOrderEditable(localOrder) && (
                    localOrder.userId === userId || isAdmin || isBrandAdmin
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
                            {item.caseSize && item.caseSize > 1 ? (
                              <span className="text-muted-foreground text-sm">
                                {item.quantity % item.caseSize === 0
                                  ? item.quantity / item.caseSize
                                  : (item.quantity / item.caseSize).toFixed(2)} cases
                                <span className="text-xs ml-1">(= {item.quantity} units)</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">x{item.quantity}</span>
                            )}
                            {item.freeQuantity && item.freeQuantity > 0 && (
                              <span className="text-xs text-green-600 dark:text-green-400">+{item.freeQuantity} free</span>
                            )}
                            <span className="min-w-16 text-right">{formatINR(Number(item.unitPrice) * item.quantity)}</span>
                            {canEdit && (
                              <div className="flex items-center gap-0">
                                <Button
                                  size="icon" variant="ghost" className="h-7 w-7"
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
                                  size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (confirm("Remove this item from the order?")) {
                                      deleteItemMutation.mutate({ orderId: localOrder.id, itemId: item.id });
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
                              type="number" min="0"
                              value={editingItemQty}
                              onChange={(e) => setEditingItemQty(parseInt(e.target.value) || 0)}
                              className="w-16 h-8"
                              data-testid={`input-edit-qty-${item.id}`}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground">Free:</Label>
                            <Input
                              type="number" min="0"
                              value={editingItemFreeQty}
                              onChange={(e) => setEditingItemFreeQty(parseInt(e.target.value) || 0)}
                              className="w-16 h-8"
                              data-testid={`input-edit-free-qty-${item.id}`}
                            />
                          </div>
                          <Button
                            size="sm" variant="default" className="h-8"
                            onClick={() => {
                              if (editingItemQty === 0 && editingItemFreeQty === 0) {
                                toast({ title: "Either quantity or free quantity must be greater than 0", variant: "destructive" });
                                return;
                              }
                              updateItemMutation.mutate({
                                orderId: localOrder.id,
                                itemId: item.id,
                                quantity: editingItemQty,
                                freeQuantity: editingItemFreeQty,
                              });
                            }}
                            disabled={updateItemMutation.isPending}
                            data-testid={`button-save-item-${item.id}`}
                          >
                            {updateItemMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-8"
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

        {/* ── Admin edit form ── */}
        {isAdmin ? (
          <>
            <div className="grid gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                {localOrder.status === "Delivered" || localOrder.status === "PODReceived" ? (
                  <div className="flex items-center h-9 px-3 rounded-md border bg-muted">
                    <Badge className={statusColors[localOrder.status as OrderStatus]}>
                      {localOrder.status === "PODReceived" ? "POD Received" : localOrder.status}
                    </Badge>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {localOrder.status === "Delivered" ? "(Can only mark POD Received)" : "(Final status)"}
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
                      {(localOrder.status === "PaymentPending"
                        ? (["PaymentPending", "Dispatched", "Cancelled"] as OrderStatus[])
                        : localOrder.status === "Dispatched"
                        ? (["Invoiced", "Dispatched", "Delivered"] as OrderStatus[])
                        : localOrder.status === "Invoiced"
                        ? ORDER_STATUSES
                        : ORDER_STATUSES.filter(s => s !== "PaymentPending")
                      ).map((status) => (
                        <SelectItem key={status} value={status}>
                          {status === "PODReceived" ? "POD Received" : status === "PaymentPending" ? "Payment Pending" : status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label htmlFor="partyName">
                  Party Name{" "}
                  {["Backordered", "Invoiced", "PaymentPending", "Dispatched", "Delivered", "PODReceived"].includes(localOrder.status) && (
                    <span className="text-xs text-muted-foreground">(locked)</span>
                  )}
                </Label>
                <Input
                  id="partyName"
                  value={editFormData.partyName}
                  onChange={(e) => setEditFormData({ ...editFormData, partyName: e.target.value })}
                  placeholder="Customer name"
                  disabled={["Backordered", "Invoiced", "PaymentPending", "Dispatched", "Delivered", "PODReceived"].includes(localOrder.status)}
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
                  disabled={localOrder.status === "PODReceived"}
                  data-testid="input-delivery-address"
                />
              </div>

              <div>
                <Label htmlFor="deliveryCompany">Delivery Company</Label>
                <Select
                  value={editFormData.deliveryCompany}
                  onValueChange={(v) => setEditFormData({ ...editFormData, deliveryCompany: v })}
                  disabled={localOrder.status === "PODReceived"}
                >
                  <SelectTrigger id="deliveryCompany" data-testid="select-edit-delivery-company">
                    <SelectValue placeholder="Select delivery company" />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_COMPANIES.map((company) => (
                      <SelectItem key={company} value={company}>{company}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="invoiceNumber">
                    Invoice No{" "}
                    {(editFormData.status === "Invoiced" || editFormData.status === "PaymentPending" || editFormData.status === "Dispatched") && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Input
                    id="invoiceNumber"
                    value={editFormData.invoiceNumber}
                    onChange={(e) => setEditFormData({ ...editFormData, invoiceNumber: e.target.value })}
                    placeholder="INV-001"
                    disabled={localOrder.status === "PODReceived"}
                    data-testid="input-invoice-number"
                  />
                </div>
                <div>
                  <Label htmlFor="invoiceDate">
                    Invoice Date{" "}
                    {(editFormData.status === "Invoiced" || editFormData.status === "PaymentPending" || editFormData.status === "Dispatched") && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Input
                    id="invoiceDate" type="date"
                    value={editFormData.invoiceDate}
                    onChange={(e) => setEditFormData({ ...editFormData, invoiceDate: e.target.value })}
                    disabled={localOrder.status === "PODReceived"}
                    data-testid="input-invoice-date"
                  />
                </div>
                <div>
                  <Label htmlFor="actualOrderValue">
                    Actual Value{" "}
                    {(editFormData.status === "Invoiced" || editFormData.status === "PaymentPending" || editFormData.status === "Dispatched") && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Input
                    id="actualOrderValue" type="number"
                    value={editFormData.actualOrderValue}
                    onChange={(e) => setEditFormData({ ...editFormData, actualOrderValue: e.target.value })}
                    placeholder="0.00"
                    disabled={localOrder.status === "PODReceived"}
                    data-testid="input-actual-order-value"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="dispatchDate">Dispatch Date</Label>
                  <Input
                    id="dispatchDate" type="date"
                    value={editFormData.dispatchDate}
                    onChange={(e) => setEditFormData({ ...editFormData, dispatchDate: e.target.value })}
                    disabled={localOrder.status === "PODReceived"}
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
                    disabled={localOrder.status === "PODReceived"}
                    data-testid="input-dispatch-by"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cases">Cases</Label>
                  <Input
                    id="cases" type="number"
                    value={editFormData.cases}
                    onChange={(e) => setEditFormData({ ...editFormData, cases: e.target.value })}
                    placeholder="0"
                    disabled={localOrder.status === "PODReceived"}
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
                    id="estimatedDeliveryDate" type="date"
                    value={editFormData.estimatedDeliveryDate}
                    onChange={(e) => setEditFormData({ ...editFormData, estimatedDeliveryDate: e.target.value })}
                    disabled={localOrder.status === "PODReceived"}
                    data-testid="input-est-delivery"
                  />
                </div>
                <div>
                  <Label htmlFor="actualDeliveryDate">Actual Delivery</Label>
                  <Input
                    id="actualDeliveryDate" type="date"
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
                  <Label htmlFor="deliveredOnTime" className="cursor-pointer">Delivered On Time</Label>
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
                  disabled={localOrder.status === "PODReceived"}
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
                  disabled={localOrder.status === "PODReceived"}
                  data-testid="input-delivery-note"
                />
              </div>
            </div>

            {localOrder.status === "PODReceived" ? (
              <div className="space-y-3 pt-4">
                <div className="p-3 rounded-md bg-muted/50 border">
                  <p className="text-sm text-muted-foreground">
                    Only Delivery Cost and Actual Delivery Date can be updated for POD Received orders.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit">Cancel</Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-order">
                    {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-between gap-2 pt-4">
                <div className="flex gap-2">
                  {isOrderEditable(localOrder) && (
                    <Button
                      variant="outline" size="sm"
                      onClick={() => setOrderForPendingCreation(localOrder)}
                      data-testid="button-create-pending"
                    >
                      <GitBranch className="w-4 h-4 mr-1" />
                      Create Pending
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit">Cancel</Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-order">
                    {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : isBrandAdmin && localOrder.status === "Created" ? (
          /* ── Brand admin: approve / invoice ── */
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-muted/50 border">
              <p className="text-sm text-muted-foreground">
                Review this order and approve it to proceed with fulfillment.
              </p>
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
                  id="brandAdminInvoiceDate" type="date"
                  value={editFormData.invoiceDate}
                  onChange={(e) => setEditFormData({ ...editFormData, invoiceDate: e.target.value })}
                  data-testid="input-brand-admin-invoice-date"
                />
              </div>
              <div>
                <Label htmlFor="brandAdminActualValue">Actual Value <span className="text-destructive">*</span></Label>
                <Input
                  id="brandAdminActualValue" type="number"
                  value={editFormData.actualOrderValue}
                  onChange={(e) => setEditFormData({ ...editFormData, actualOrderValue: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-brand-admin-actual-value"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit">Cancel</Button>
              <Button
                onClick={() => {
                  const missingFields: string[] = [];
                  if (!editFormData.invoiceNumber?.trim()) missingFields.push("Invoice Number");
                  if (!editFormData.invoiceDate?.trim()) missingFields.push("Invoice Date");
                  if (!editFormData.actualOrderValue?.trim()) missingFields.push("Actual Order Value");
                  if (missingFields.length > 0) {
                    toast({ title: "Required fields missing", description: `Please fill in: ${missingFields.join(", ")}`, variant: "destructive" });
                    return;
                  }
                  updateMutation.mutate({ id: localOrder.id, updates: {
                    status: "Invoiced",
                    deliveryCompany: editFormData.deliveryCompany || undefined,
                    invoiceNumber: editFormData.invoiceNumber,
                    invoiceDate: editFormData.invoiceDate,
                    actualOrderValue: editFormData.actualOrderValue,
                  }});
                }}
                disabled={updateMutation.isPending}
                data-testid="button-mark-invoiced"
              >
                {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating...</> : "Mark as Invoiced"}
              </Button>
            </div>
          </div>
        ) : isBrandAdmin ? (
          /* ── Brand admin: read-only for other statuses ── */
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <Badge className={statusColors[localOrder.status as OrderStatus]}>
                {localOrder.status === "PODReceived" ? "POD Received" : localOrder.status}
              </Badge>
            </div>
            {pendingOrderLookup.has(localOrder.id) && (
              <div className="flex justify-between items-center p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <span className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-1">
                  <GitBranch className="w-4 h-4" />
                  Has pending order
                </span>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-100 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-900/40"
                  onClick={() => {
                    const pendingOrder = pendingOrderLookup.get(localOrder.id);
                    if (pendingOrder && onViewPendingOrder) {
                      onClose();
                      setTimeout(() => onViewPendingOrder(pendingOrder), 100);
                    }
                  }}
                  data-testid="button-dialog-view-pending"
                >
                  View
                </Button>
              </div>
            )}
            {localOrder.invoiceNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice:</span>
                <span>{localOrder.invoiceNumber} {localOrder.invoiceDate && `(${formatDate(localOrder.invoiceDate)})`}</span>
              </div>
            )}
            {localOrder.status === "Dispatched" && localOrder.estimatedDeliveryDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Delivery:</span>
                <span>{formatDate(localOrder.estimatedDeliveryDate)}</span>
              </div>
            )}
            {localOrder.status === "Delivered" && localOrder.actualDeliveryDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivered:</span>
                <span>{formatDate(localOrder.actualDeliveryDate)}</span>
              </div>
            )}
            {localOrder.specialNotes && (
              <div>
                <span className="text-muted-foreground">Special Notes:</span>
                <p className="mt-1 text-sm">{localOrder.specialNotes}</p>
              </div>
            )}
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={onClose} data-testid="button-close-details">Close</Button>
            </div>
          </div>
        ) : (
          /* ── Regular user / Customer: read-only summary ── */
          <div className="space-y-3">
            {/* Customer edit notice for pre-invoice orders */}
            {isCustomer && isOrderEditable(localOrder) && (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  You can add, edit, or remove items above. Any changes will reset this order to <strong>Needs Approval</strong> and your salesperson will need to approve it again.
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <Badge className={statusColors[localOrder.status as OrderStatus]}>
                {localOrder.status === "PODReceived" ? "POD Received" : localOrder.status}
              </Badge>
            </div>
            {localOrder.invoiceNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice:</span>
                <span>{localOrder.invoiceNumber} {localOrder.invoiceDate && `(${formatDate(localOrder.invoiceDate)})`}</span>
              </div>
            )}
            {localOrder.status === "Dispatched" && localOrder.estimatedDeliveryDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Delivery:</span>
                <span>{formatDate(localOrder.estimatedDeliveryDate)}</span>
              </div>
            )}
            {localOrder.status === "Delivered" && localOrder.actualDeliveryDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivered:</span>
                <span>{formatDate(localOrder.actualDeliveryDate)}</span>
              </div>
            )}
            {localOrder.specialNotes && (
              <div>
                <span className="text-muted-foreground">Special Notes:</span>
                <p className="mt-1 text-sm">{localOrder.specialNotes}</p>
              </div>
            )}
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={onClose} data-testid="button-close-details">Close</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Items Dialog (sibling, not nested) ── */}
      <Dialog open={showAddItems} onOpenChange={(open) => {
        if (!open) { setShowAddItems(false); setItemsToAdd([]); setAddItemsSearch(""); }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Items to Order</DialogTitle>
            <DialogDescription>
              Search and add products from {order.brand || "this brand"} to the order.
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
                      className="px-3 py-2 flex justify-between items-center text-sm hover:bg-muted/50 cursor-pointer"
                      onClick={() => handleAddProductToList(product)}
                      data-testid={`product-add-${product.id}`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-medium break-words whitespace-normal leading-tight">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.sku}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{formatINR(product.price || 0)}</span>
                        <Button size="icon" variant="ghost"><Plus className="w-4 h-4" /></Button>
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
                        <Button size="icon" variant="ghost" onClick={() => handleUpdateItemQuantity(item.product.id, -1)} data-testid={`button-decrease-${item.product.id}`}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-6 text-center">{item.quantity}</span>
                        <Button size="icon" variant="ghost" onClick={() => handleUpdateItemQuantity(item.product.id, 1)} data-testid={`button-increase-${item.product.id}`}>
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleRemoveItemFromList(item.product.id)} data-testid={`button-remove-${item.product.id}`}>
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
            <Button variant="outline" onClick={() => { setShowAddItems(false); setItemsToAdd([]); setAddItemsSearch(""); }} data-testid="button-cancel-add-items">
              Cancel
            </Button>
            <Button onClick={handleConfirmAddItems} disabled={itemsToAdd.length === 0 || addItemsMutation.isPending} data-testid="button-confirm-add-items">
              {addItemsMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</> : `Add ${itemsToAdd.length} Item${itemsToAdd.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Create Pending Order AlertDialog ── */}
      <AlertDialog open={!!orderForPendingCreation} onOpenChange={(open) => !open && setOrderForPendingCreation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Pending Order</AlertDialogTitle>
            <AlertDialogDescription>
              Create a pending order with out-of-stock items from this order for "{orderForPendingCreation?.partyName || "Unknown"}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-pending-order">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => orderForPendingCreation && createPendingOrderMutation.mutate(orderForPendingCreation.id)}
              disabled={createPendingOrderMutation.isPending}
              data-testid="button-confirm-pending-order"
            >
              {createPendingOrderMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
              ) : "Create Pending Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
