import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Upload, FileSpreadsheet, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface UploadedFile {
  name: string;
  brand: string;
  productCount: number;
}

interface UploadDropzoneProps {
  onFileUpload: (file: File) => void;
  uploadedFiles: UploadedFile[];
  onRemoveFile: (fileName: string) => void;
  isUploading?: boolean;
}

export default function UploadDropzone({ 
  onFileUpload, 
  uploadedFiles,
  onRemoveFile,
  isUploading = false 
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      onFileUpload(file);
    }
  }, [onFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
    e.target.value = "";
  }, [onFileUpload]);

  return (
    <div className="space-y-4">
      <Card
        className={`p-8 border-2 border-dashed transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Upload className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium text-lg">Upload Product Inventory</p>
            <p className="text-sm text-muted-foreground">
              Drag and drop your Excel file here
            </p>
          </div>
          <label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file-upload"
            />
            <Button variant="outline" className="cursor-pointer" asChild>
              <span data-testid="button-browse-files">Browse Files</span>
            </Button>
          </label>
          <p className="text-xs text-muted-foreground">
            Required columns: Brand, Product Name, Product SKU ID (MRP optional)
          </p>
          <p className="text-xs text-muted-foreground">
            Supported formats: .xlsx, .xls
          </p>
        </div>
      </Card>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Uploaded Inventories</p>
          {uploadedFiles.map((file) => (
            <Card key={file.name} className="p-3 flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{file.brand}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                <Check className="w-3 h-3 mr-1" />
                {file.productCount} items
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onRemoveFile(file.name)}
                data-testid={`button-remove-file-${file.name}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
