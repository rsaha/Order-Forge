import type { Order, Product } from "@shared/schema";

interface OrderItem {
  productId: string;
  quantity: number;
  freeQuantity: number;
  price: string;
  product?: Product;
}

interface OrderWithItems extends Order {
  items: OrderItem[];
  user?: {
    firstName?: string | null;
    lastName?: string | null;
  };
}

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function generateOrderCreatedMessage(order: OrderWithItems): string {
  const creatorName = order.user
    ? [order.user.firstName, order.user.lastName].filter(Boolean).join(" ") || "Unknown"
    : "Unknown";

  let message = `*New Order Created*\n`;
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (order.partyName) {
    message += `*Party:* ${order.partyName}\n`;
  }
  message += `*Brand:* ${order.brand}\n`;
  message += `*Created by:* ${creatorName}\n\n`;
  
  message += `*Order Items:*\n`;
  message += `─────────────────\n`;
  
  order.items.forEach((item, index) => {
    const productName = item.product?.name || `Product ${item.productId}`;
    const qty = item.quantity;
    const freeQty = item.freeQuantity || 0;
    const price = parseFloat(item.price);
    const lineTotal = qty * price;
    
    message += `${index + 1}. ${productName}\n`;
    message += `   Qty: ${qty}`;
    if (freeQty > 0) {
      message += ` (+${freeQty} free)`;
    }
    message += ` × ${formatCurrency(price)} = ${formatCurrency(lineTotal)}\n`;
  });
  
  message += `─────────────────\n`;
  message += `*Total:* ${formatCurrency(order.total)}\n`;
  
  if (order.deliveryCompany) {
    message += `*Delivery:* ${order.deliveryCompany}\n`;
  }
  
  if (order.deliveryNote) {
    message += `*Notes:* ${order.deliveryNote}\n`;
  }

  return message;
}

export function generateDispatchedMessage(order: OrderWithItems): string {
  let message = `*Order Dispatched*\n`;
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  
  message += `*Party:* ${order.partyName || "N/A"}\n`;
  message += `*Brand:* ${order.brand}\n`;
  message += `*Actual Order Value:* ${formatCurrency(order.actualOrderValue || order.total)}\n\n`;
  
  if (order.deliveryAddress) {
    message += `*Delivery Address:*\n${order.deliveryAddress}\n\n`;
  }
  
  if (order.deliveryNote) {
    message += `*Delivery Details:* ${order.deliveryNote}\n`;
  }
  
  if (order.deliveryCompany) {
    message += `*Transport:* ${order.deliveryCompany}\n`;
  }
  
  if (order.cases) {
    message += `*No. of Cases:* ${order.cases}\n`;
  }
  
  if (order.estimatedDeliveryDate) {
    message += `*Estimated Delivery:* ${formatDate(order.estimatedDeliveryDate)}\n`;
  }

  return message;
}

export function generateDeliveredMessage(order: OrderWithItems): string {
  let message = `*Order Delivered*\n`;
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  
  message += `*Party:* ${order.partyName || "N/A"}\n`;
  message += `*Actual Order Value:* ${formatCurrency(order.actualOrderValue || order.total)}\n`;
  
  if (order.cases) {
    message += `*No. of Cases:* ${order.cases}\n`;
  }
  
  if (order.deliveryAddress) {
    message += `*Delivery Address:*\n${order.deliveryAddress}\n\n`;
  }
  
  if (order.actualDeliveryDate) {
    message += `*Delivery Date:* ${formatDate(order.actualDeliveryDate)}\n`;
  }
  
  if (order.remarks) {
    message += `*Remarks:* ${order.remarks}\n`;
  }

  return message;
}

export type WhatsAppMessageType = "created" | "dispatched" | "delivered";

export function generateWhatsAppMessage(order: OrderWithItems, type: WhatsAppMessageType): string {
  switch (type) {
    case "created":
      return generateOrderCreatedMessage(order);
    case "dispatched":
      return generateDispatchedMessage(order);
    case "delivered":
      return generateDeliveredMessage(order);
    default:
      return generateOrderCreatedMessage(order);
  }
}

export function openWhatsApp(message: string, phoneNumber?: string): void {
  const encodedMessage = encodeURIComponent(message);
  let url: string;
  
  if (phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    url = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
  } else {
    url = `https://wa.me/?text=${encodedMessage}`;
  }
  
  window.open(url, "_blank");
}

export function getWhatsAppUrl(message: string, phoneNumber?: string): string {
  const encodedMessage = encodeURIComponent(message);
  
  if (phoneNumber) {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
  }
  
  return `https://wa.me/?text=${encodedMessage}`;
}
