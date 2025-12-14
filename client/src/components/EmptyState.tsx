import { Button } from "@/components/ui/button";
import { Upload, Search } from "lucide-react";

interface EmptyStateProps {
  type: "no-products" | "no-results";
  onUploadClick?: () => void;
}

export default function EmptyState({ type, onUploadClick }: EmptyStateProps) {
  if (type === "no-products") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <Upload className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-lg mb-2">No products yet</h3>
        <p className="text-muted-foreground mb-6 max-w-sm">
          Upload your brand SKU lists to start adding products to your orders.
        </p>
        {onUploadClick && (
          <Button onClick={onUploadClick} data-testid="button-upload-empty">
            <Upload className="w-4 h-4 mr-2" />
            Upload SKU List
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
        <Search className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-lg mb-2">No results found</h3>
      <p className="text-muted-foreground max-w-sm">
        Try adjusting your search or filters to find what you're looking for.
      </p>
    </div>
  );
}
