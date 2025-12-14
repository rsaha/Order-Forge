import { useState } from "react";
import BrandFilter from "../BrandFilter";

// todo: remove mock functionality
const mockBrands = ["TechBrand", "ProLine", "ValueMax"];

export default function BrandFilterExample() {
  const [selected, setSelected] = useState<string | null>(null);
  
  return (
    <BrandFilter 
      brands={mockBrands} 
      selectedBrand={selected} 
      onSelectBrand={setSelected} 
    />
  );
}
