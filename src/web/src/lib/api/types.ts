// The shapes this app reads, as in contracts/openapi/*.yaml. Money is in paisa.

export interface Point {
  lat: number;
  lng: number;
}

export interface Rating {
  /** One decimal; null until the first review. */
  average: number | null;
  count: number;
}

export interface Delivery {
  zoneId: string;
  deliveryFeePaisa: number;
  minimumOrderPaisa: number;
  deliveryTimeMinutes: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  hasMore: boolean;
}

/** SearchResult in search-service.yaml. */
export interface RestaurantResult {
  id: string;
  name: string;
  cuisines: string[];
  area: string;
  city: string;
  logoUrl: string | null;
  coverUrl: string | null;
  distanceMeters: number;
  openNow: boolean;
  pausedUntil: string | null;
  acceptingOrders: boolean;
  rating: Rating;
  delivery: Delivery;
  matchingDishes: { id: string; name: string; pricePaisa: number }[];
}

export interface CuisineCount {
  cuisine: string;
  restaurants: number;
}

/** Restaurant in restaurant-service.yaml. */
export interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  cuisines: string[];
  address: { line1: string; area: string; city: string; province: string };
  location: Point;
  logoUrl: string | null;
  coverUrl: string | null;
  openNow: boolean;
  pausedUntil: string | null;
  acceptingOrders: boolean;
  rating: Rating;
  hours: Hours;
}

export interface TimeRange {
  opens: string;
  closes: string;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface Hours {
  weekly: Partial<Record<Weekday, TimeRange[]>>;
  special: { name: string; startsOn: string; endsOn: string; ranges: TimeRange[] }[];
}

export type RestaurantStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

/** ManagedRestaurant: what its owner and admins see. */
export interface ManagedRestaurant extends Restaurant {
  ownerId: string;
  phone: string;
  status: RestaurantStatus;
  /** Why it was rejected or suspended. */
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** DeliveryZone, without the polygon. */
export interface DeliveryZone {
  id: string;
  name: string;
  deliveryFeePaisa: number;
  minimumOrderPaisa: number;
  deliveryTimeMinutes: number;
}

export interface DeliveryQuote {
  deliverable: boolean;
  acceptingOrders: boolean;
  distanceMeters: number;
  delivery: Delivery | null;
}

export interface Review {
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Menu in menu-service.yaml. */
export interface Menu {
  restaurantId: string;
  categories: MenuCategory[];
}

export interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
  items: MenuItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricePaisa: number;
  isAvailable: boolean;
  optionGroups: { id: string; name: string; minSelect: number; maxSelect: number; options: MenuOption[] }[];
}

export interface MenuOption {
  id: string;
  name: string;
  pricePaisa: number;
  isAvailable: boolean;
}

/** Cart in cart-service.yaml. */
export interface Cart {
  restaurantId: string | null;
  lines: CartLine[];
  subtotalPaisa: number;
  /** Lines that no longer match the menu; the cart can't be checked out until they're fixed. */
  problems: { lineId: string | null; message: string }[];
  updatedAt: string | null;
}

export interface CartLine {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  optionIds: string[];
  options: { id: string; group: string; name: string; pricePaisa: number }[];
  note: string | null;
  unitPricePaisa: number;
  lineTotalPaisa: number;
}

/** Address in user-service.yaml: one of the customer's saved places. */
export interface Address {
  id: string;
  label: 'home' | 'work' | 'other';
  labelText: string | null;
  line1: string;
  area: string;
  city: string;
  landmark: string | null;
  instructions: string | null;
  location: Point;
  isDefault: boolean;
}

export type OrderStatus = 'placed' | 'accepted' | 'ready' | 'picked_up' | 'delivered' | 'rejected' | 'cancelled';

/** Order in order-service.yaml. */
export interface Order {
  id: string;
  status: OrderStatus;
  restaurant: { id: string; name: string; location: Point | null };
  lines: {
    itemId: string;
    name: string;
    quantity: number;
    options: { name: string }[];
    note: string | null;
    lineTotalPaisa: number;
  }[];
  subtotalPaisa: number;
  deliveryFeePaisa: number;
  discountPaisa: number;
  voucherCode: string | null;
  tipPaisa: number;
  totalPaisa: number;
  paymentMethod: 'cod' | 'card' | 'jazzcash' | 'easypaisa';
  deliveryAddress: {
    label: string;
    line1: string;
    area: string;
    city: string;
    landmark: string | null;
    instructions: string | null;
    location: Point;
  };
  note: string | null;
  prepTimeMinutes: number | null;
  estimatedDeliveryAt: string;
  timeline: { status: OrderStatus; at: string; by: string; reason: string | null }[];
  placedAt: string;
}

export interface VoucherDiscount {
  code: string;
  description: string;
  discountPaisa: number;
}

export type RiderStatus = 'pending' | 'approved' | 'suspended';

/** Rider in delivery-service.yaml. */
export interface Rider {
  userId: string;
  name: string;
  phone: string;
  vehicle: 'motorbike' | 'bicycle' | 'car';
  city: string;
  status: RiderStatus;
  online: boolean;
  location: Point | null;
  locatedAt: string | null;
  rating: Rating;
  createdAt: string;
  updatedAt: string;
}

export interface Earnings {
  /** Orders the rider dropped off in [from, to). */
  period: {
    from: string;
    to: string;
    deliveries: number;
    deliveryFeesPaisa: number;
    tipsPaisa: number;
    earnedPaisa: number;
    cashCollectedPaisa: number;
  };
  /** Everything delivered and settled so far. */
  balance: { cashInHandPaisa: number; unpaidEarningsPaisa: number; netPaisa: number };
}

export type SettlementKind = 'cash_deposit' | 'payout' | 'kept_from_cash';

export interface Settlement {
  id: string;
  riderId: string;
  kind: SettlementKind;
  amountPaisa: number;
  note: string | null;
  recordedBy: string;
  createdAt: string;
}
