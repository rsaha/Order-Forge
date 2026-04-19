import { useState } from "react";
import { Tag } from "lucide-react";
import { transformImageUrl } from "@/lib/imageUtils";

interface BrandLogoImgProps {
  logoUrl?: string | null;
  brandName: string;
  className?: string;
  iconClassName?: string;
  "data-testid"?: string;
}

export default function BrandLogoImg({ logoUrl, brandName, className, iconClassName, "data-testid": testId }: BrandLogoImgProps) {
  const [imgError, setImgError] = useState(false);
  const src = transformImageUrl(logoUrl);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={brandName}
        className={className ?? "w-8 h-8 object-contain rounded"}
        onError={() => setImgError(true)}
        data-testid={testId}
      />
    );
  }

  return <Tag className={iconClassName ?? "w-5 h-5 text-muted-foreground"} />;
}
