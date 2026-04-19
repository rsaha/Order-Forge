import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Upload, X, Link } from "lucide-react";
import { transformImageUrl, compressImageFile } from "@/lib/imageUtils";

interface ImagePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  currentUrl?: string | null;
  isSaving?: boolean;
  onSave: (url: string | null) => void;
}

export default function ImagePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  currentUrl,
  isSaving,
  onSave,
}: ImagePickerDialogProps) {
  const [urlInput, setUrlInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrlInput(currentUrl || "");
      setPreviewUrl(transformImageUrl(currentUrl));
      setPreviewError(false);
    }
  }, [open, currentUrl]);

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    setPreviewError(false);
    setPreviewUrl(transformImageUrl(val) || null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const dataUrl = await compressImageFile(file, 100);
      setUrlInput(dataUrl);
      setPreviewUrl(dataUrl);
      setPreviewError(false);
    } catch {
    } finally {
      setIsCompressing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = () => {
    setUrlInput("");
    setPreviewUrl(null);
    setPreviewError(false);
  };

  const handleSave = () => {
    const finalUrl = urlInput.trim() || null;
    onSave(finalUrl);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {previewUrl && !previewError && (
            <div className="flex justify-center">
              <div className="relative w-32 h-32 border rounded-lg overflow-hidden bg-muted">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                  onError={() => setPreviewError(true)}
                />
                <button
                  className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={handleClear}
                  data-testid="button-clear-image"
                  type="button"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          {previewError && (
            <p className="text-xs text-destructive text-center">Could not load image from this URL</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="image-url-input" className="flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5" />
              Image URL or Google Drive share link
            </Label>
            <Input
              id="image-url-input"
              placeholder="https://... or Google Drive share link"
              value={urlInput.startsWith("data:") ? "(uploaded file)" : urlInput}
              onChange={(e) => handleUrlChange(e.target.value)}
              data-testid="input-image-url"
              disabled={urlInput.startsWith("data:")}
            />
            {urlInput.startsWith("data:") && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={handleClear}
              >
                Remove uploaded file
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 border-t" />
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isCompressing}
              data-testid="button-upload-image-file"
            >
              {isCompressing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {isCompressing ? "Compressing…" : "Upload from device"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              Images are compressed to ≤100 KB automatically
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          {(currentUrl || urlInput) && (
            <Button
              variant="ghost"
              onClick={() => onSave(null)}
              disabled={isSaving}
              data-testid="button-remove-image"
            >
              Remove
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving || isCompressing} data-testid="button-save-image">
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
