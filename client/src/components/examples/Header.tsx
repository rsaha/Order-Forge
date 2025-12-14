import { useState } from "react";
import Header from "../Header";

export default function HeaderExample() {
  const [tab, setTab] = useState<"products" | "upload">("products");
  
  return (
    <div className="w-full">
      <Header
        cartItemCount={3}
        activeTab={tab}
        onTabChange={setTab}
        onCartClick={() => console.log("Cart clicked")}
      />
    </div>
  );
}
