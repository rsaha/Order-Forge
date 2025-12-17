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
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Order, OrderStatus } from "@shared/schema";

const ORDER_STATUSES: OrderStatus[] = ["Created", "Pending", "Invoiced", "Dispatched", "Delivered", "Cancelled"];

const statusColors: Record<OrderStatus, string> = {
  Created: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Invoiced: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Dispatched: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const statusIcons: Record<OrderStatus, typeof Package> = {
  Created: FileText,
  Pending: Clock,
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
}

export default function OrdersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
  });

  useEffect(() => {
    if (!authLoading && user && !user.isAdmin) {
      navigate("/");
    }
  }, [authLoading, user, navigate]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/admin/orders", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" 
        ? "/api/admin/orders" 
        : `/api/admin/orders?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: !!user?.isAdmin,
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

  const handleOrderClick = (order: Order) => {
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
    });
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
        ["Product Name", "Size", "Order Qty"].join(","),
        ...items.map((item: { productName?: string; size?: string; quantity: number }) => 
          [
            `"${(item.productName || "Unknown").replace(/"/g, '""')}"`,
            `"${(item.size || "Uni").replace(/"/g, '""')}"`,
            item.quantity
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

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Admin Access Required</h2>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
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
      <header className="flex items-center justify-between gap-4 p-4 border-b bg-background">
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ORDER_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <div className="grid gap-3">
              {orders.map((order) => {
                const StatusIcon = statusIcons[order.status as OrderStatus] || FileText;
                return (
                  <Card
                    key={order.id}
                    className="p-4 cursor-pointer hover-elevate"
                    onClick={() => handleOrderClick(order)}
                    data-testid={`card-order-${order.id}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-md bg-muted">
                          <StatusIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium" data-testid={`text-party-${order.id}`}>
                              {order.partyName || "Unknown Customer"}
                            </span>
                            <Badge className={statusColors[order.status as OrderStatus]} data-testid={`badge-status-${order.id}`}>
                              {order.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                            <span data-testid={`text-date-${order.id}`}>
                              <Calendar className="w-3 h-3 inline mr-1" />
                              {formatDate(order.createdAt)}
                            </span>
                            {order.invoiceNumber && (
                              <span data-testid={`text-invoice-${order.id}`}>
                                <FileText className="w-3 h-3 inline mr-1" />
                                {order.invoiceNumber}
                              </span>
                            )}
                            {order.dispatchBy && (
                              <span>
                                <Truck className="w-3 h-3 inline mr-1" />
                                {order.dispatchBy}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-lg font-semibold" data-testid={`text-total-${order.id}`}>
                            {formatINR(order.total)}
                          </div>
                          {order.cases && (
                            <div className="text-sm text-muted-foreground">
                              {order.cases} cases
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => handleDownloadCSV(order, e)}
                          data-testid={`button-download-${order.id}`}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Order</DialogTitle>
            <DialogDescription>
              Update order details and tracking information.
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted">
                <div className="font-medium">{selectedOrder.partyName || "Unknown Customer"}</div>
                <div className="text-sm text-muted-foreground">
                  Order Total: {formatINR(selectedOrder.total)}
                </div>
                {selectedOrder.deliveryAddress && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedOrder.deliveryAddress}
                  </div>
                )}
              </div>

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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
