import { useMemo, useState, useEffect } from "react";
import SearchBar from "@/components/SearchBar";
import BrandFilter from "@/components/BrandFilter";
import ProductCardCompact, { groupProductsByName, type ProductVariant } from "@/components/ProductCardCompact";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CartItemData } from "@/components/CartItem";

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  size?: string | null;
  price: number;
  distributorPrice?: number | string | null;
  alias1?: string | null;
  alias2?: string | null;
  stock: number;
}

const ITEMS_PER_PAGE = 50;

interface OrderTabProps {
  products: Product[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedBrand: string | null;
  onBrandSelect: (brand: string | null) => void;
  cart: CartItemData[];
  onAddToCart: (product: { id: string; sku: string; name: string; brand: string; price: string | number; stock: number }, quantity: number) => void;
  onOpenCart: () => void;
}

export default function OrderTab({
  products,
  searchQuery,
  onSearchChange,
  selectedBrand,
  onBrandSelect,
  cart,
  onAddToCart,
  onOpenCart,
}: OrderTabProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const brands = useMemo(() => {
    const uniqueBrands = Array.from(new Set(products.map(p => p.brand)));
    return uniqueBrands.sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.brand.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBrand = selectedBrand === null || product.brand === selectedBrand;
      return matchesSearch && matchesBrand;
    });
  }, [products, searchQuery, selectedBrand]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedBrand]);

  const groupedProducts = useMemo(() => {
    const variants: ProductVariant[] = filteredProducts.map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      size: p.size || null,
      price: p.price,
      distributorPrice: p.distributorPrice,
      alias1: p.alias1,
      alias2: p.alias2,
      stock: p.stock,
    }));
    return groupProductsByName(variants);
  }, [filteredProducts]);

  const totalPages = Math.ceil(groupedProducts.length / ITEMS_PER_PAGE);
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return groupedProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [groupedProducts, currentPage]);

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  
  const cartQuantityMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach(item => {
      map[item.product.id] = item.quantity;
    });
    return map;
  }, [cart]);

  const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-4 space-y-4 border-b bg-background">
          <SearchBar value={searchQuery} onChange={onSearchChange} />
          <BrandFilter
            brands={brands}
            selectedBrand={selectedBrand}
            onSelectBrand={onBrandSelect}
          />
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3">
            {groupedProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No products found
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-3 text-sm text-muted-foreground">
                  <span data-testid="text-product-count">
                    {groupedProducts.length} products ({filteredProducts.length} SKUs)
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="px-2" data-testid="text-page-info">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2">
                  {paginatedGroups.map(group => (
                    <ProductCardCompact
                      key={group.baseKey}
                      group={group}
                      cartQuantityMap={cartQuantityMap}
                      onAddToCart={(variant, qty) => onAddToCart({
                        id: variant.id,
                        sku: variant.sku,
                        name: variant.name,
                        brand: variant.brand,
                        price: variant.price,
                        stock: variant.stock,
                      }, qty)}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex justify-center mt-4">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page-bottom"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <span className="px-3 text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        data-testid="button-next-page-bottom"
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l bg-muted/30 flex flex-col">
        <div className="p-4 flex-1 overflow-auto space-y-4">
          {cart.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Cart Summary</h3>
                <Badge variant="secondary" data-testid="badge-cart-summary">
                  {cartItemCount} items
                </Badge>
              </div>
              
              <div className="space-y-2 text-sm max-h-32 overflow-auto">
                {cart.slice(0, 5).map(item => (
                  <div key={item.product.id} className="flex justify-between gap-2">
                    <span className="text-muted-foreground truncate">
                      {item.product.name} x{item.quantity}
                    </span>
                    <span className="shrink-0">{formatINR(item.product.price * item.quantity)}</span>
                  </div>
                ))}
                {cart.length > 5 && (
                  <p className="text-muted-foreground text-xs">
                    +{cart.length - 5} more items...
                  </p>
                )}
              </div>
              
              <div className="flex justify-between items-center pt-3 mt-3 border-t font-medium">
                <span>Total</span>
                <span data-testid="text-cart-total">{formatINR(cartTotal)}</span>
              </div>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}
