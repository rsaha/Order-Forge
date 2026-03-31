import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Package, Tag } from "lucide-react";
import Header from "@/components/Header";

function formatDate(iso: string | null | undefined) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

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

export default function InventoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const isBrandAdmin = user?.role === "BrandAdmin";

  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [nonMovingOpen, setNonMovingOpen] = useState(false);

  const { data, isLoading } = useQuery<{ brands: BrandStock[] }>({
    queryKey: ["/api/portal/stock"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const brands = data?.brands || [];

  const activeBrand = selectedBrand
    ? brands.find((b) => b.brand === selectedBrand) ?? brands[0]
    : brands[0];

  const activeProducts = activeBrand?.products.filter((p) => !p.isNonMoving) || [];
  const nonMovingProducts = activeBrand?.products.filter((p) => p.isNonMoving) || [];

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
            showTabs={false}
          />
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Current stock levels and movement for your brands</p>
        </div>

        <Card>
          <CardContent className="pt-5">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : !brands.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No stock data available. Upload a stock file in the Products page to get started.</p>
              </div>
            ) : (
              <div>
                {brands.length > 1 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {brands.map((b) => (
                      <Button
                        key={b.brand}
                        variant={activeBrand?.brand === b.brand ? "default" : "outline"}
                        size="sm"
                        onClick={() => { setSelectedBrand(b.brand); setNonMovingOpen(false); }}
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
