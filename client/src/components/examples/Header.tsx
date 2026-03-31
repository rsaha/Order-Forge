import Header from "../Header";

export default function HeaderExample() {
  return (
    <div className="w-full">
      <Header
        cartItemCount={3}
        onCartClick={() => console.log("Cart clicked")}
      />
    </div>
  );
}
