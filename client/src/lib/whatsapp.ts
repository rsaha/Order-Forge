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
  createdByName?: string | null;
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

export function generateOrderCreatedMessage(order: OrderWithItems, status?: string): string {
  const creatorName = order.user
    ? [order.user.firstName, order.user.lastName].filter(Boolean).join(" ") || order.createdByName || "Unknown"
    : order.createdByName || "Unknown";

  // Determine the header based on status
  let header = "*New Order Created*";
  if (status === "Pending") {
    header = "*Order Pending*";
  } else if (status === "Approved") {
    header = "*Order Approved*";
  } else if (status === "Backordered") {
    header = "*Order Backordered*";
  } else if (status === "Invoiced") {
    header = "*Order Invoiced*";
  }

  let message = `${header}\n`;
  message += `━━━━━━━━━━━━━━━━━━\n`;
  
  if (order.partyName) {
    message += `*Party:* ${order.partyName}\n`;
  }
  message += `*Created by:* ${creatorName}\n\n`;
  
  message += `*Order Items:*\n`;
  message += `*Brand:* ${order.brand}\n`;
  message += `─────────────────\n\n`;
  
  order.items.forEach((item) => {
    const productName = item.product?.name || `Product ${item.productId}`;
    const qty = item.quantity;
    const freeQty = item.freeQuantity || 0;
    const price = parseFloat(item.price);
    const lineTotal = qty * price;
    
    message += `${productName}\n`;
    message += `Qty: ${qty}`;
    if (freeQty > 0) {
      message += ` (+${freeQty} free)`;
    }
    message += ` × ${formatCurrency(price)} = ${formatCurrency(lineTotal)}\n`;
  });
  
  message += `─────────────────\n`;
  
  if (order.deliveryCompany) {
    message += `*Deliver By:* ${order.deliveryCompany}\n`;
  }
  
  if (order.specialNotes) {
    message += `*Special Notes:* ${order.specialNotes}\n`;
  }
  
  if (order.deliveryNote) {
    message += `*Delivery Notes:* ${order.deliveryNote}\n`;
  }

  return message;
}

export function generateDispatchedMessage(order: OrderWithItems, dispatchDate?: string): string {
  let message = `*Order Dispatched*\n`;
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  
  message += `*Party:* ${order.partyName || "N/A"}\n`;
  message += `*Brand:* ${order.brand}\n`;
  
  // Use provided dispatch date or fall back to order's dispatch date
  const dateToUse = dispatchDate || order.dispatchDate;
  if (dateToUse) {
    message += `*Dispatch Date:* ${formatDate(dateToUse)}\n`;
  }
  
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

export function generateDeliveredMessage(order: OrderWithItems, deliveryDate?: string): string {
  let message = `*Order Delivered*\n`;
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  
  message += `*Party:* ${order.partyName || "N/A"}\n`;
  
  // Add Invoice details
  if (order.invoiceNumber) {
    message += `*Invoice No:* ${order.invoiceNumber}\n`;
  }
  if (order.invoiceDate) {
    message += `*Invoice Date:* ${formatDate(order.invoiceDate)}\n`;
  }
  
  message += `*Actual Order Value:* ${formatCurrency(order.actualOrderValue || order.total)}\n`;
  
  if (order.cases) {
    message += `*No. of Cases:* ${order.cases}\n`;
  }
  
  // Add dispatch date
  if (order.dispatchDate) {
    message += `*Dispatch Date:* ${formatDate(order.dispatchDate)}\n`;
  }
  
  // Use provided delivery date or fall back to order's actual delivery date
  const dateToUse = deliveryDate || order.actualDeliveryDate;
  if (dateToUse) {
    message += `*Delivery Date:* ${formatDate(dateToUse)}\n`;
  }
  
  // Add on-time status
  if (order.deliveredOnTime !== null && order.deliveredOnTime !== undefined) {
    message += `*On Time:* ${order.deliveredOnTime ? "Yes ✓" : "No ✗"}\n`;
  }
  
  if (order.deliveryAddress) {
    message += `\n*Delivery Address:*\n${order.deliveryAddress}\n`;
  }

  return message;
}

export type WhatsAppMessageType = "created" | "pending" | "approved" | "backordered" | "invoiced" | "dispatched" | "delivered";

export function generateWhatsAppMessage(order: OrderWithItems, type: WhatsAppMessageType, customDate?: string): string {
  switch (type) {
    case "created":
      return generateOrderCreatedMessage(order, "Created");
    case "pending":
      return generateOrderCreatedMessage(order, "Pending");
    case "approved":
      return generateOrderCreatedMessage(order, "Approved");
    case "backordered":
      return generateOrderCreatedMessage(order, "Backordered");
    case "invoiced":
      return generateOrderCreatedMessage(order, "Invoiced");
    case "dispatched":
      return generateDispatchedMessage(order, customDate);
    case "delivered":
      return generateDeliveredMessage(order, customDate);
    default:
      return generateOrderCreatedMessage(order, "Created");
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
