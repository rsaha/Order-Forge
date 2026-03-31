import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, ListOrdered } from "lucide-react";
import Header from "@/components/Header";
import type { Order, OrderItem } from "@shared/schema";

function getDefaultDates() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const toStr = (d: Date) => d.toISOString().split("T")[0];
  return { startDate: toStr(firstDay), endDate: toStr(now) };
}

const STATUS_COLORS: Record<string, string> = {
  Created: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Backordered: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Invoiced: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Dispatched: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  Delivered: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  PODReceived: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCurrency(v: number | string | null | undefined) {
  const n = Number(v);
  if (!v || isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type PortalOrder = Order & {
  createdByName?: string | null;
  actualCreatorName?: string | null;
};

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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Order — {order.partyName}</span>
            <Badge className={STATUS_COLORS[order.status] || ""}>{order.status}</Badge>
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

export default function SalesOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.isAdmin === true;
  const isBrandAdmin = user?.role === "BrandAdmin";

  const [statusTab, setStatusTab] = useState("Needs Approval");
  const [selectedOrder, setSelectedOrder] = useState<PortalOrder | null>(null);
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  const queryParams = new URLSearchParams({ startDate, endDate }).toString();

  const { data: orders = [], isLoading } = useQuery<PortalOrder[]>({
    queryKey: ["/api/portal/orders", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/portal/orders?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiRequest("PATCH", `/api/portal/orders/${orderId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/orders"] });
      toast({ title: "Order approved", description: "Status changed to Approved." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to approve", description: err.message, variant: "destructive" });
    },
  });

  const filtered = orders.filter((o) => {
    if (statusTab === "Needs Approval") return o.status === "Created";
    if (statusTab === "Approved") return o.status === "Approved";
    return true;
  });

  const needsApprovalCount = orders.filter((o) => o.status === "Created").length;
  const approvedCount = orders.filter((o) => o.status === "Approved").length;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
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

      <div className="max-w-6xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">Sales Orders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Review and approve customer orders</p>
        </div>

        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-end gap-3 mb-4 pb-4 border-b">
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
              <span className="text-xs text-muted-foreground pb-1">{orders.length} orders</span>
            </div>

            <Tabs value={statusTab} onValueChange={setStatusTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="Needs Approval" data-testid="tab-needs-approval">
                  Needs Approval
                  {needsApprovalCount > 0 && (
                    <Badge className="ml-2 bg-blue-600 text-white text-xs px-1.5 py-0 rounded-full">
                      {needsApprovalCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="Approved" data-testid="tab-approved-orders">
                  Approved
                  {approvedCount > 0 && (
                    <Badge className="ml-2 bg-green-600 text-white text-xs px-1.5 py-0 rounded-full">
                      {approvedCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="All" data-testid="tab-all-orders">All ({orders.length})</TabsTrigger>
              </TabsList>

              <TabsContent value={statusTab}>
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
                          <TableHead className="text-right">Value</TableHead>
                          <TableHead>Status</TableHead>
                          {isBrandAdmin && (
                            <TableHead className="hidden lg:table-cell">Salesperson</TableHead>
                          )}
                          <TableHead className="text-right">Actions</TableHead>
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
                            <TableCell className="text-right text-sm font-medium">
                              {formatCurrency(order.total)}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-xs ${STATUS_COLORS[order.status] || ""}`}>
                                {order.status}
                              </Badge>
                            </TableCell>
                            {isBrandAdmin && (
                              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                                {order.actualCreatorName || order.createdByName || "—"}
                              </TableCell>
                            )}
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
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
