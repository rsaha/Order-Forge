import { Badge } from "@/components/ui/badge";

interface BrandFilterProps {
  brands: string[];
  selectedBrand: string | null;
  onSelectBrand: (brand: string | null) => void;
}

export default function BrandFilter({ brands, selectedBrand, onSelectBrand }: BrandFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={selectedBrand === null ? "default" : "secondary"}
        className="cursor-pointer"
        onClick={() => onSelectBrand(null)}
        data-testid="filter-all"
      >
        All Brands
      </Badge>
      {brands.map((brand) => (
        <Badge
          key={brand}
          variant={selectedBrand === brand ? "default" : "secondary"}
          className="cursor-pointer"
          onClick={() => onSelectBrand(brand)}
          data-testid={`filter-${brand}`}
        >
          {brand}
        </Badge>
      ))}
    </div>
  );
}
