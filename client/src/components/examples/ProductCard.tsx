import ProductCard, { type Product } from "../ProductCard";

// todo: remove mock functionality
const mockProduct: Product = {
  id: "1",
  sku: "ABC-12345",
  name: "Premium Widget Pro",
  brand: "TechBrand",
  price: 29.99,
  stock: 15,
  category: "Electronics"
};

export default function ProductCardExample() {
  return (
    <div className="max-w-sm">
      <ProductCard 
        product={mockProduct} 
        onAddToCart={(p) => console.log("Added to cart:", p.name)} 
      />
    </div>
  );
}
