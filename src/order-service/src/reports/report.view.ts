/** SalesReport in contracts/openapi/order-service.yaml. */
export interface SalesReport {
  restaurantId: string;
  from: string;
  to: string;
  /** Days are counted in this zone. */
  timeZone: string;
  orders: { placed: number; delivered: number; cancelled: number; rejected: number };
  /** Subtotals of the delivered orders: what the food sold for. */
  salesPaisa: number;
  /** Voucher discounts on those orders. */
  discountsPaisa: number;
  averageOrderPaisa: number | null;
  averagePrepMinutes: number | null;
  topItems: { itemId: string; name: string; quantity: number; salesPaisa: number }[];
  days: { date: string; placed: number; delivered: number; salesPaisa: number }[];
}
