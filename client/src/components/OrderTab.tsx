import { useMemo } from "react";
import SearchBar from "@/components/SearchBar";
import BrandFilter from "@/components/BrandFilter";
import ProductCard from "@/components/ProductCard";
import OrderDetailsForm, { type OrderDetails } from "@/components/OrderDetailsForm";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CartItemData } from "@/components/CartItem";

interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  price: number;
  stock: number;
}

interface OrderTabProps {
  products: Product[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedBrand: string | null;
  onBrandSelect: (brand: string | null) => void;
  orderDetails: OrderDetails;
  onOrderDetailsChange: (details: OrderDetails) => void;
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
  orderDetails,
  onOrderDetailsChange,
  cart,
  onAddToCart,
  onOpenCart,
}: OrderTabProps) {
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

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

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
          <div className="p-4">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No products found
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={(p, qty) => onAddToCart(product as any, qty)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l bg-muted/30 flex flex-col">
        <div className="p-4 flex-1 overflow-auto space-y-4">
          <OrderDetailsForm
            orderDetails={orderDetails}
            onOrderDetailsChange={onOrderDetailsChange}
          />

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

        <div className="p-4 border-t">
          <Button 
            className="w-full" 
            size="lg"
            onClick={onOpenCart}
            disabled={cart.length === 0}
            data-testid="button-view-cart"
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            View Cart & Send Order
            {cartItemCount > 0 && (
              <Badge className="ml-2" variant="secondary">
                {cartItemCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
