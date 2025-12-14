# Order Entry App - Design Guidelines

## Design Approach: Material Design System
**Rationale**: Productivity-focused application requiring efficient data entry, clear information hierarchy, and mobile-first touch interactions. Material Design provides robust patterns for forms, lists, and data displays essential for order management.

## Typography

**Font Family**: Inter (via Google Fonts CDN)
- Primary: Inter for all UI elements
- Monospace: Use for SKU codes and order numbers

**Type Scale**:
- Headers: text-2xl (order summaries), text-xl (section headers)
- Body: text-base (product names, descriptions)
- Supporting: text-sm (SKU codes, metadata, labels)
- Micro: text-xs (timestamps, helper text)

**Weights**: 
- Semibold (600) for headers and primary actions
- Medium (500) for product names and important data
- Regular (400) for body text

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 exclusively
- Component padding: p-4, p-6
- Section spacing: gap-4, gap-6
- Container margins: m-4, m-6
- Icon spacing: gap-2

**Grid Structure**:
- Mobile: Single column, full-width cards
- Desktop: Max-width container (max-w-4xl) centered for focused workflow
- Inventory lists: Grid on desktop (grid-cols-2 lg:grid-cols-3), stack on mobile

## Component Library

### Navigation
- Sticky top header (h-16) with app title and key actions
- Bottom navigation bar on mobile for primary functions (Upload, Orders, Settings)
- Desktop: Sidebar navigation (w-64) with collapsible sections

### Product Inventory Management
- Upload zone: Dashed border drop area with file input, clear upload instructions
- SKU list cards: Product image thumbnail (if available), SKU code, name, price, stock status
- Search bar: Sticky below header, prominent with icon prefix
- Filter chips: Brand selection, category, availability status

### Order Entry Form
- Product search with autocomplete dropdown
- Quantity selectors: Touch-friendly steppers (- / number input / +) with minimum h-12 tap targets
- Shopping cart panel: Fixed bottom sheet on mobile, right sidebar (w-80) on desktop
- Cart items: Removable list items with thumbnail, name, quantity, subtotal

### Order Summary
- Itemized list with clear visual separation (border-b)
- Price breakdown: Subtotal, tax, total with right-aligned numbers
- Primary CTA: Large button (h-12) "Send Order via WhatsApp"
- Secondary CTA: "Email Spreadsheet" button below primary

### Data Tables (Order History)
- Responsive cards on mobile (stack vertically)
- Table view on desktop with sortable columns
- Row height: h-14 for touch-friendly selection
- Column structure: Order ID, Date, Items count, Total, Status, Actions

### Forms & Inputs
- Input height: h-12 for all text fields
- Label placement: Floating labels inside inputs
- Error states: Red text-sm below input with icon
- Success states: Green checkmark icon right-aligned in input

### Modals & Overlays
- Bottom sheets on mobile (slides up from bottom)
- Centered modals on desktop (max-w-lg)
- Backdrop: Semi-transparent overlay
- Close actions: X button top-right, swipe down gesture on mobile

### Buttons
- Primary: h-12, rounded-lg, full-width on mobile
- Secondary: h-10, outlined variant
- Icon buttons: Square h-10 w-10 for actions
- FAB: Fixed bottom-right on desktop for quick "New Order" action

### Icons
- Library: Heroicons (outline style via CDN)
- Size: w-5 h-5 for inline icons, w-6 h-6 for standalone buttons
- Common icons: Upload, Search, ShoppingCart, Mail, Phone (WhatsApp), XMark, Check, Plus, Minus

### Status Indicators
- Badges: Rounded-full px-2 py-1 text-xs for stock status, order status
- Toast notifications: Fixed top-center for upload success, order sent confirmations

### Cards
- Elevation: Subtle shadow (shadow-sm), border (border)
- Padding: p-4 for content
- Radius: rounded-lg consistently
- Hover state: shadow-md lift effect on desktop

## Mobile-First Considerations

**Touch Targets**: Minimum 44px (h-11) for all interactive elements
**Spacing**: Generous padding (p-4 minimum) for thumb-friendly interactions
**Scrolling**: Natural vertical scroll, sticky headers for context retention
**Gestures**: Swipe to delete cart items, pull-to-refresh for inventory lists

## Key Screens Layout

**Inventory Upload**: Hero section with upload dropzone, recent uploads list below
**Product Browse**: Search bar + filters, grid of product cards with infinite scroll
**Order Entry**: Split view - product search left/top, cart summary right/bottom
**Order Confirmation**: Full-screen modal with order details, WhatsApp/Email CTAs prominently displayed

## Accessibility
- Form labels always present and descriptive
- Error messages clear and actionable
- Focus indicators visible on all interactive elements
- ARIA labels for icon-only buttons

**No animations** except subtle transitions (0.2s ease) for modal appearances and button states.