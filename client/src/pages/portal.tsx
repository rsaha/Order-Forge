import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, ChevronDown, ChevronRight, Package, ListOrdered, AlertTriangle, Info, CalendarDays, Tag } from "lucide-react";
import Header from "@/components/Header";
import type { Order, OrderItem } from "@shared/schema";

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

type StockProduct = {
  productId: string;
  sku: string;
  name: string;
  size: string;
  brand: string;
  stock: number;
  totalSold90: number;
  lastSaleDate: string | null;
  isNonMoving: boolean;
};

type BrandStock = {
  brand: string;
  lastImportDate: string | null;
  updatedCount: number | null;
  totalStocked: number;
  activeCount: number;
  nonMovingCount: number;
  products: StockProduct[];
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

function OrdersSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusTab, setStatusTab] = useState("Needs Approval");
  const [selectedOrder, setSelectedOrder] = useState<PortalOrder | null>(null);

  const { data: orders = [], isLoading } = useQuery<PortalOrder[]>({
    queryKey: ["/api/portal/orders"],
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

  return (
    <div>
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
                    {user?.role === "BrandAdmin" && (
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
                      {user?.role === "BrandAdmin" && (
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

      <OrderDetailDialog
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}

function StockSection() {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [nonMovingOpen, setNonMovingOpen] = useState(false);

  const { data, isLoading } = useQuery<{ brands: BrandStock[] }>({
    queryKey: ["/api/portal/stock"],
  });

  const brands = data?.brands || [];

  const activeBrand = selectedBrand
    ? brands.find((b) => b.brand === selectedBrand) ?? brands[0]
    : brands[0];

  const activeProducts = activeBrand?.products.filter((p) => !p.isNonMoving) || [];
  const nonMovingProducts = activeBrand?.products.filter((p) => p.isNonMoving) || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!brands.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>No brand access configured</p>
      </div>
    );
  }

  return (
    <div>
      {brands.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {brands.map((b) => (
            <Button
              key={b.brand}
              variant={activeBrand?.brand === b.brand ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedBrand(b.brand)}
              data-testid={`button-brand-${b.brand}`}
            >
              {b.brand}
            </Button>
          ))}
        </div>
      )}

      {activeBrand && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-1.5 text-sm">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last stock update:</span>
              <span className="font-medium">
                {activeBrand.lastImportDate ? formatDate(activeBrand.lastImportDate) : "Never uploaded"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{activeBrand.totalStocked}</span>
              <span className="text-muted-foreground">products in stock</span>
            </div>
            {activeBrand.nonMovingCount > 0 && (
              <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {activeBrand.nonMovingCount} non-moving
              </Badge>
            )}
          </div>

          {activeProducts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2 text-foreground/80">
                Active Stock ({activeProducts.length})
              </h3>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="hidden sm:table-cell">SKU</TableHead>
                      <TableHead className="hidden md:table-cell">Size</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Sold (90d)</TableHead>
                      <TableHead className="hidden xl:table-cell">Last Sale</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeProducts.map((p) => (
                      <TableRow key={p.productId} data-testid={`row-stock-${p.productId}`}>
                        <TableCell className="font-medium text-sm">{p.name}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{p.sku}</TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.size}</TableCell>
                        <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                        <TableCell className="text-right text-sm hidden lg:table-cell">{p.totalSold90}</TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden xl:table-cell">{formatDate(p.lastSaleDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {nonMovingProducts.length > 0 && (
            <Collapsible open={nonMovingOpen} onOpenChange={setNonMovingOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                  data-testid="button-toggle-nonmoving"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Non-Moving Stock ({nonMovingProducts.length} products — no sales in 90 days)</span>
                  </div>
                  {nonMovingOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-md border border-amber-200 dark:border-amber-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-amber-50/60 dark:bg-amber-950/40">
                        <TableHead>Product</TableHead>
                        <TableHead className="hidden sm:table-cell">SKU</TableHead>
                        <TableHead className="hidden md:table-cell">Size</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="hidden lg:table-cell">Last Sale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nonMovingProducts.map((p) => (
                        <TableRow key={p.productId} className="bg-amber-50/30 dark:bg-amber-950/20" data-testid={`row-nonmoving-${p.productId}`}>
                          <TableCell className="font-medium text-sm">{p.name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{p.sku}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.size}</TableCell>
                          <TableCell className="text-right font-semibold text-amber-700 dark:text-amber-400">{p.stock}</TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{formatDate(p.lastSaleDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {activeProducts.length === 0 && nonMovingProducts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No stock data available. Upload a stock file to get started.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PortalPage() {
  const { user } = useAuth();

  const isAdmin = user?.isAdmin === true;
  const isBrandAdmin = user?.role === "BrandAdmin";

  if (!user || isAdmin || (user.role !== "User" && user.role !== "BrandAdmin")) {
    return (
      <div className="flex flex-col h-screen min-h-0">
        <header className="flex-shrink-0 sticky top-0 z-50 bg-background border-b">
          <div className="flex items-center justify-between gap-4 px-4 h-16">
            <Header cartItemCount={0} onCartClick={() => {}} isAdmin={isAdmin} isBrandAdmin={isBrandAdmin} showTabs={false} />
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Info className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>This page is for Sales Users and Brand Admins only.</p>
          </div>
        </div>
      </div>
    );
  }

  const roleLabel = user.role === "BrandAdmin" ? "Brand Admin Portal" : "Sales Portal";

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="flex-shrink-0 sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header
            cartItemCount={0}
            onCartClick={() => {}}
            isAdmin={isAdmin}
            isBrandAdmin={isBrandAdmin}
            showPortal={true}
            showTabs={false}
          />
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">{roleLabel}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {user.firstName ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : user.email}
          </p>
        </div>

        <Tabs defaultValue="orders">
          <TabsList className="mb-5">
            <TabsTrigger value="orders" className="flex items-center gap-2" data-testid="portal-tab-orders">
              <ListOrdered className="w-4 h-4" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="stock" className="flex items-center gap-2" data-testid="portal-tab-stock">
              <Package className="w-4 h-4" />
              Stock
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Management</CardTitle>
              </CardHeader>
              <CardContent>
                <OrdersSection />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Stock View</CardTitle>
              </CardHeader>
              <CardContent>
                <StockSection />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
