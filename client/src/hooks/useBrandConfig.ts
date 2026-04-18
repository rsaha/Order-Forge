import { useQuery } from "@tanstack/react-query";
import type { BrandRecord } from "@shared/schema";

export function useDeliveryCompanies(brand?: string | null) {
  const url = brand ? `/api/delivery-companies?brand=${encodeURIComponent(brand)}` : `/api/delivery-companies`;
  return useQuery<string[]>({
    queryKey: ["/api/delivery-companies", brand || "all"],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch delivery companies");
      const data = await res.json();
      // API returns array of objects (admin) or strings; normalize
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        return data.map((d: any) => d.name);
      }
      return data as string[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrands() {
  return useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useBrandConfig(brandName: string | null | undefined) {
  const { data: brands } = useBrands();
  if (!brandName || !brands) return undefined;
  return brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
}
