import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, FileText, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ParsedItem {
  rawText: string;
  productRef: string;
  size?: string;
  quantity: number;
  confidence: number;
  matchedProduct: {
    id: string;
    sku: string;
    name: string;
    brand: string;
    price: number;
  } | null;
}

interface ImportOrderProps {
  onItemsParsed: (items: ParsedItem[]) => void;
}

export default function ImportOrder({ onItemsParsed }: ImportOrderProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"image" | "text">("image");
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/orders/parse-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to parse image");
      }

      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        onItemsParsed(data.items);
        toast({
          title: "Order parsed",
          description: `Found ${data.items.length} items in the image`,
        });
      } else {
        toast({
          title: "No items found",
          description: "Could not find any order items in the image",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Parse failed",
        description: error.message || "Failed to parse the order image",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [onItemsParsed, toast]);

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
      const response = await fetch("/api/orders/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to parse text");
      }

      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        onItemsParsed(data.items);
        setText("");
        toast({
          title: "Order parsed",
          description: `Found ${data.items.length} items`,
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
  }, [text, onItemsParsed, toast]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageUpload(e.dataTransfer.files[0]);
    }
  }, [handleImageUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageUpload(e.target.files[0]);
    }
  }, [handleImageUpload]);

  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold mb-4">Import Order</h2>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "image" | "text")}>
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="image" data-testid="tab-image">
            <Camera className="w-4 h-4 mr-2" />
            From Image
          </TabsTrigger>
          <TabsTrigger value="text" data-testid="tab-text">
            <FileText className="w-4 h-4 mr-2" />
            From Text
          </TabsTrigger>
        </TabsList>

        <TabsContent value="image" className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${
              dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Reading order from image...</p>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">
                  Drag and drop an order image here, or click to browse
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Supports handwritten or printed orders
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                  id="image-upload"
                  data-testid="input-image-upload"
                />
                <label htmlFor="image-upload">
                  <Button asChild disabled={isLoading}>
                    <span>
                      <Camera className="w-4 h-4 mr-2" />
                      Upload Image
                    </span>
                  </Button>
                </label>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="text" className="space-y-4">
          <Textarea
            placeholder="Paste or type your order here...&#10;&#10;Examples:&#10;L.S Belt - M 2case, L 2case&#10;Knee Cap - M 1case, L 1case&#10;I-73 Reg|2&#10;D-02 L|1 S|1"
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
        </TabsContent>
      </Tabs>
    </Card>
  );
}
