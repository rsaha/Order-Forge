import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ParsedItem {
  rawText: string;
  productRef: string;
  quantity: number;
  freeQuantity: number;
  matchedProduct: {
    id: string;
    sku: string;
    name: string;
    brand: string;
    price: number;
    distributorPrice?: number | null;
  } | null;
}

interface ImportOrderProps {
  onItemsParsed: (partyName: string, items: ParsedItem[], originalText: string) => void;
  availableBrands?: string[];
  selectedBrand?: string;
  onBrandChange?: (brand: string) => void;
}

export default function ImportOrder({ onItemsParsed, availableBrands = [], selectedBrand = "all", onBrandChange }: ImportOrderProps) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleBrandChange = (brand: string) => {
    if (onBrandChange) {
      onBrandChange(brand);
    }
  };

  const handleTextParse = useCallback(async () => {
    if (!text.trim()) {
      toast({
        title: "No text",
        description: "Please enter or paste order text",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const body: { text: string; brand?: string } = { text };
      if (selectedBrand && selectedBrand !== "all") {
        body.brand = selectedBrand;
      }

      const response = await fetch("/api/orders/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to parse text");
      }

      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        onItemsParsed(data.partyName || "", data.items, text);
        toast({
          title: "Order parsed",
          description: `Party: ${data.partyName || "Not specified"} - Found ${data.items.length} items`,
        });
      } else if (data.partyName) {
        onItemsParsed(data.partyName, [], text);
        toast({
          title: "Party name found",
          description: `Party: ${data.partyName} - No product items found`,
        });
      } else {
        toast({
          title: "No items found",
          description: "Could not find any order items in the text",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Parse failed",
        description: error.message || "Failed to parse the order text",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [text, selectedBrand, onItemsParsed, toast]);

  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold mb-2">Import Order</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Paste or type your order items below. Each line should have a product name/SKU and quantity.
      </p>
      
      <div className="space-y-4">
        {availableBrands.length > 0 && (
          <div>
            <Label className="text-sm text-muted-foreground">Filter by Brand (optional)</Label>
            <Select value={selectedBrand} onValueChange={handleBrandChange}>
              <SelectTrigger data-testid="select-import-brand">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {availableBrands.map((brand) => (
                  <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        
        <Textarea
          placeholder="Paste or type your order here...&#10;&#10;First line = Party/Customer Name&#10;Following lines = Products&#10;&#10;Example:&#10;ABC Traders&#10;L.S Belt 2&#10;Knee Cap - 3&#10;Product Name x 5"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[200px]"
          disabled={isLoading}
          data-testid="input-order-text"
        />
        <Button 
          onClick={handleTextParse} 
          disabled={isLoading || !text.trim()}
          className="w-full"
          data-testid="button-parse-text"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Parse Order
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
