import { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import BrandFilter from "@/components/BrandFilter";
import ProductCard, { type Product } from "@/components/ProductCard";
import UploadDropzone from "@/components/UploadDropzone";
import CartPanel from "@/components/CartPanel";
import EmptyState from "@/components/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { CartItemData } from "@/components/CartItem";

interface UploadedFile {
  name: string;
  brand: string;
  productCount: number;
}

// todo: remove mock functionality
const MOCK_PRODUCTS: Product[] = [
  { id: "1", sku: "TB-001", name: "Premium Widget Pro", brand: "TechBrand", price: 29.99, stock: 15 },
  { id: "2", sku: "TB-002", name: "Standard Widget", brand: "TechBrand", price: 19.99, stock: 8 },
  { id: "3", sku: "PL-100", name: "ProLine Gadget X", brand: "ProLine", price: 45.00, stock: 25 },
  { id: "4", sku: "PL-101", name: "ProLine Gadget Mini", brand: "ProLine", price: 25.00, stock: 0 },
  { id: "5", sku: "VM-200", name: "ValueMax Essential", brand: "ValueMax", price: 12.99, stock: 50 },
  { id: "6", sku: "VM-201", name: "ValueMax Premium", brand: "ValueMax", price: 22.99, stock: 30 },
  { id: "7", sku: "TB-003", name: "TechBrand Elite Series", brand: "TechBrand", price: 89.99, stock: 5 },
  { id: "8", sku: "PL-102", name: "ProLine Industrial Pack", brand: "ProLine", price: 150.00, stock: 12 },
];

export default function Home() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"products" | "upload">("products");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItemData[]>([]);
  
  // todo: remove mock functionality
  const [products, setProducts] = useState<Product[]>(MOCK_PRODUCTS);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([
    { name: "techbrand-inventory.xlsx", brand: "TechBrand", productCount: 3 },
    { name: "proline-products.csv", brand: "ProLine", productCount: 3 },
    { name: "valuemax-skus.xlsx", brand: "ValueMax", productCount: 2 },
  ]);

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

  const handleAddToCart = useCallback((product: Product) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
            : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
    toast({
      title: "Added to cart",
      description: `${product.name} has been added to your cart.`,
    });
  }, [toast]);

  const handleQuantityChange = useCallback((productId: string, quantity: number) => {
    setCart(prevCart =>
      prevCart.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, []);

  const handleRemoveItem = useCallback((productId: string) => {
    setCart(prevCart => prevCart.filter(item => item.product.id !== productId));
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
        
        const brandName = file.name.split(/[-_.]/)[0].toUpperCase();
        
        const newProducts: Product[] = jsonData.map((row, index) => ({
          id: `${brandName}-${Date.now()}-${index}`,
          sku: String(row.sku || row.SKU || row.Sku || `${brandName}-${index + 1}`),
          name: String(row.name || row.Name || row.product || row.Product || "Unknown Product"),
          brand: String(row.brand || row.Brand || brandName),
          price: Number(row.price || row.Price || row.cost || row.Cost || 0),
          stock: Number(row.stock || row.Stock || row.quantity || row.Quantity || 0),
        }));

        setProducts(prev => [...prev, ...newProducts]);
        setUploadedFiles(prev => [...prev, {
          name: file.name,
          brand: brandName,
          productCount: newProducts.length
        }]);

        toast({
          title: "Upload successful",
          description: `Imported ${newProducts.length} products from ${file.name}`,
        });
      } catch {
        toast({
          title: "Upload failed",
          description: "Could not parse the file. Please check the format.",
          variant: "destructive",
        });
      }
    };
    reader.readAsBinaryString(file);
  }, [toast]);

  const handleRemoveFile = useCallback((fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  }, []);

  const generateOrderMessage = useCallback(() => {
    const lines = [
      "NEW ORDER",
      "─".repeat(20),
      "",
    ];

    cart.forEach(item => {
      lines.push(`${item.product.name}`);
      lines.push(`  SKU: ${item.product.sku}`);
      lines.push(`  Qty: ${item.quantity} x $${item.product.price.toFixed(2)} = $${(item.quantity * item.product.price).toFixed(2)}`);
      lines.push("");
    });

    const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    lines.push("─".repeat(20));
    lines.push(`TOTAL: $${total.toFixed(2)}`);

    return lines.join("\n");
  }, [cart]);

  const handleSendWhatsApp = useCallback((phone: string) => {
    if (!phone.trim()) {
      toast({
        title: "Phone number required",
        description: "Please enter a WhatsApp number.",
        variant: "destructive",
      });
      return;
    }

    const message = encodeURIComponent(generateOrderMessage());
    const cleanPhone = phone.replace(/\D/g, "");
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, "_blank");
    
    toast({
      title: "Opening WhatsApp",
      description: "Your order message is ready to send.",
    });
  }, [generateOrderMessage, toast]);

  const handleSendEmail = useCallback((email: string) => {
    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }

    // Generate Excel file
    const orderData = cart.map(item => ({
      SKU: item.product.sku,
      Product: item.product.name,
      Brand: item.product.brand,
      Quantity: item.quantity,
      "Unit Price": item.product.price,
      Subtotal: item.quantity * item.product.price,
    }));

    const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    orderData.push({
      SKU: "",
      Product: "",
      Brand: "",
      Quantity: 0,
      "Unit Price": 0,
      Subtotal: 0,
    });
    orderData.push({
      SKU: "TOTAL",
      Product: "",
      Brand: "",
      Quantity: cart.reduce((sum, item) => sum + item.quantity, 0),
      "Unit Price": 0,
      Subtotal: total,
    });

    const worksheet = XLSX.utils.json_to_sheet(orderData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Order");
    XLSX.writeFile(workbook, `order-${Date.now()}.xlsx`);

    toast({
      title: "Spreadsheet downloaded",
      description: `Send the downloaded file to ${email}`,
    });
  }, [cart, toast]);

  const handleCopyMessage = useCallback(() => {
    navigator.clipboard.writeText(generateOrderMessage());
    toast({
      title: "Copied!",
      description: "Order message copied to clipboard.",
    });
  }, [generateOrderMessage, toast]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        cartItemCount={cartItemCount}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onCartClick={() => setIsCartOpen(true)}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab === "products" ? (
          <div className="h-full flex flex-col">
            {products.length === 0 ? (
              <EmptyState type="no-products" onUploadClick={() => setActiveTab("upload")} />
            ) : (
              <>
                <div className="p-4 space-y-4 border-b bg-background sticky top-16 z-40">
                  <SearchBar value={searchQuery} onChange={setSearchQuery} />
                  <BrandFilter
                    brands={brands}
                    selectedBrand={selectedBrand}
                    onSelectBrand={setSelectedBrand}
                  />
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {filteredProducts.length === 0 ? (
                      <EmptyState type="no-results" />
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredProducts.map(product => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            onAddToCart={handleAddToCart}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">Upload Inventory</h2>
              <p className="text-muted-foreground">
                Import product SKU lists from your brands. Supported formats: Excel (.xlsx, .xls) and CSV files.
              </p>
            </div>
            <UploadDropzone
              onFileUpload={handleFileUpload}
              uploadedFiles={uploadedFiles}
              onRemoveFile={handleRemoveFile}
            />
          </div>
        )}
      </main>

      <CartPanel
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onQuantityChange={handleQuantityChange}
        onRemoveItem={handleRemoveItem}
        onSendWhatsApp={handleSendWhatsApp}
        onSendEmail={handleSendEmail}
        onCopyMessage={handleCopyMessage}
      />
    </div>
  );
}
