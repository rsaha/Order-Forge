import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, ListOrdered } from "lucide-react";
import Header from "@/components/Header";
import type { Order, OrderItem } from "@shared/schema";

/* ─── helpers ─── */
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

/* ─── status config ─── */
type OrderStatus = "Created" | "Approved" | "Backordered" | "Pending" | "Invoiced" | "Dispatched" | "Delivered" | "PODReceived" | "Cancelled";

interface TabConfig {
  label: string;
  status: OrderStatus | "All";
  badgeClass: string;
  borderClass: string;
}

const ALL_TABS: TabConfig[] = [
  { label: "Needs Approval", status: "Created",     badgeClass: "bg-blue-100 text-blue-800",    borderClass: "border-blue-500 text-blue-700" },
  { label: "Approved",       status: "Approved",    badgeClass: "bg-green-100 text-green-800",  borderClass: "border-green-500 text-green-700" },
  { label: "Backordered",    status: "Backordered", badgeClass: "bg-rose-100 text-rose-800",    borderClass: "border-rose-500 text-rose-700" },
  { label: "Pending",        status: "Pending",     badgeClass: "bg-amber-100 text-amber-800",  borderClass: "border-amber-500 text-amber-700" },
  { label: "Invoiced",       status: "Invoiced",    badgeClass: "bg-purple-100 text-purple-800",borderClass: "border-purple-500 text-purple-700" },
  { label: "Dispatched",     status: "Dispatched",  badgeClass: "bg-orange-100 text-orange-800",borderClass: "border-orange-500 text-orange-700" },
  { label: "Delivered",      status: "Delivered",   badgeClass: "bg-teal-100 text-teal-800",    borderClass: "border-teal-500 text-teal-700" },
  { label: "POD Received",   status: "PODReceived", badgeClass: "bg-indigo-100 text-indigo-800",borderClass: "border-indigo-500 text-indigo-700" },
  { label: "Cancelled",      status: "Cancelled",   badgeClass: "bg-gray-100 text-gray-800",    borderClass: "border-gray-500 text-gray-700" },
  { label: "All",            status: "All",         badgeClass: "bg-muted text-foreground",     borderClass: "border-foreground" },
];

const CUSTOMER_STATUSES = new Set<string>(["Created", "Approved", "Invoiced", "Cancelled", "All"]);

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

/* ─── types ─── */
type PortalOrder = Order & { createdByName?: string | null; actualCreatorName?: string | null };

/* ─── order detail dialog ─── */
function OrderDetailDialog({ order, open, onClose }: { order: PortalOrder | null; open: boolean; onClose: () => void }) {
  const { data: items, isLoading } = useQuery<OrderItem[]>({
    queryKey: ["/api/orders", order?.id, "items"],
    queryFn: async () => {
      if (!order) return [];
      const res = await fetch(`/api/orders/${order.id}/items`);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: open && !!order,
  });

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Order — {order.partyName}</span>
            <Badge className={STATUS_BADGE[order.status] || ""}>{order.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <span className="text-muted-foreground">Brand</span>
            <p className="font-medium">{order.brand}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Date</span>
            <p className="font-medium">{formatDate(order.createdAt?.toString())}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total</span>
            <p className="font-medium">{formatCurrency(order.total)}</p>
          </div>
          {order.invoiceNumber && (
            <div>
              <span className="text-muted-foreground">Invoice #</span>
              <p className="font-medium">{order.invoiceNumber}</p>
            </div>
          )}
          {order.specialNotes && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Notes</span>
              <p className="font-medium">{order.specialNotes}</p>
            </div>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
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
                    <div className="font-medium">{item.productName}</div>
                    {item.productSize && <div className="text-xs text-muted-foreground">{item.productSize}</div>}
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
  const canApprove = !isCustomer;

  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [activeTab, setActiveTab] = useState<string>("Created");
  const [selectedOrder, setSelectedOrder] = useState<PortalOrder | null>(null);

  /* visible tabs depend on role */
  const visibleTabs = useMemo(
    () => isCustomer ? ALL_TABS.filter(t => CUSTOMER_STATUSES.has(t.status as string)) : ALL_TABS,
    [isCustomer]
  );

  /* fetch orders */
  const queryParams = new URLSearchParams({ startDate, endDate }).toString();
  const { data: orders = [], isLoading } = useQuery<PortalOrder[]>({
    queryKey: ["/api/portal/orders", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/portal/orders?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  /* approve mutation */
  const approveMutation = useMutation({
    mutationFn: (orderId: string) => apiRequest("PATCH", `/api/portal/orders/${orderId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Order approved", description: "Status changed to Approved." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to approve", description: err.message, variant: "destructive" });
    },
  });

  /* count per status */
  const countByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      map[o.status] = (map[o.status] || 0) + 1;
    }
    return map;
  }, [orders]);

  /* filter orders to active tab */
  const filtered = useMemo(() => {
    if (activeTab === "All") return orders;
    return orders.filter(o => o.status === activeTab);
  }, [orders, activeTab]);

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="flex-shrink-0 sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header cartItemCount={0} onCartClick={() => {}} isAdmin={isAdmin} isBrandAdmin={isBrandAdmin} />
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">My Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin ? "All orders across the system" : isBrandAdmin ? "Orders for your brands" : "Your orders"}
          </p>
        </div>

        <Card>
          <CardContent className="pt-5">
            {/* date range filter */}
            <div className="flex flex-wrap items-end gap-3 mb-5 pb-4 border-b">
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-sm w-36"
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-sm w-36"
                    data-testid="input-end-date"
                  />
                </div>
              </div>
              <span className="text-xs text-muted-foreground pb-1">{orders.length} total orders</span>
            </div>

            {/* status tabs — horizontal scrollable */}
            <div className="flex gap-0 border-b mb-4 overflow-x-auto">
              {visibleTabs.map((tab) => {
                const count = tab.status === "All" ? orders.length : (countByStatus[tab.status] || 0);
                const isActive = activeTab === tab.status;
                return (
                  <button
                    key={tab.status}
                    onClick={() => setActiveTab(tab.status as string)}
                    data-testid={`tab-status-${tab.status}`}
                    className={`
                      flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
                      ${isActive
                        ? `${tab.borderClass} bg-muted/40`
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
                      }
                    `}
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

            {/* orders table */}
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ListOrdered className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No orders in this category</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Party</TableHead>
                      <TableHead className="hidden sm:table-cell">Brand</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                      {activeTab === "Invoiced" || activeTab === "All" ? (
                        <TableHead className="hidden md:table-cell">Invoice #</TableHead>
                      ) : null}
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Status</TableHead>
                      {(isAdmin || isBrandAdmin) && (
                        <TableHead className="hidden lg:table-cell">Salesperson</TableHead>
                      )}
                      {canApprove && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() => setSelectedOrder(order)}
                        data-testid={`row-order-${order.id}`}
                      >
                        <TableCell className="font-medium max-w-[140px] truncate">
                          {order.partyName || "—"}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {order.brand}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {formatDate(order.createdAt?.toString())}
                        </TableCell>
                        {activeTab === "Invoiced" || activeTab === "All" ? (
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {order.invoiceNumber || "—"}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(order.total)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${STATUS_BADGE[order.status] || ""}`}>
                            {order.status === "PODReceived" ? "POD Received" : order.status}
                          </Badge>
                        </TableCell>
                        {(isAdmin || isBrandAdmin) && (
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {order.actualCreatorName || order.createdByName || "—"}
                          </TableCell>
                        )}
                        {canApprove && (
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            {order.status === "Created" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                disabled={approveMutation.isPending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  approveMutation.mutate(order.id);
                                }}
                                data-testid={`button-approve-${order.id}`}
                              >
                                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                                Approve
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

      <OrderDetailDialog
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
