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
