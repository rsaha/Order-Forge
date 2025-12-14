import { useState } from "react";
import UploadDropzone from "../UploadDropzone";

// todo: remove mock functionality
const mockFiles = [
  { name: "brand-a-inventory.xlsx", brand: "Brand A", productCount: 150 },
  { name: "brand-b-products.csv", brand: "Brand B", productCount: 85 },
];

export default function UploadDropzoneExample() {
  const [files, setFiles] = useState(mockFiles);
  
  return (
    <div className="max-w-lg">
      <UploadDropzone
        onFileUpload={(file) => {
          console.log("File uploaded:", file.name);
          setFiles([...files, { name: file.name, brand: "New Brand", productCount: 0 }]);
        }}
        uploadedFiles={files}
        onRemoveFile={(name) => setFiles(files.filter(f => f.name !== name))}
      />
    </div>
  );
}
