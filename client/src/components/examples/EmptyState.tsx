import EmptyState from "../EmptyState";

export default function EmptyStateExample() {
  return (
    <div className="space-y-8">
      <EmptyState type="no-products" onUploadClick={() => console.log("Upload clicked")} />
      <div className="border-t pt-8">
        <EmptyState type="no-results" />
      </div>
    </div>
  );
}
