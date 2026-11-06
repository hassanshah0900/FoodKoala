import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';

/** A line as menu-service prices it (PriceRequest in contracts/openapi/menu-service.yaml). */
export interface LineToPrice {
  itemId: string;
  quantity: number;
  optionIds: string[];
}

export interface PricedOption {
  id: string;
  group: string;
  name: string;
  pricePaisa: number;
}

export interface PricedLine {
  itemId: string;
  name: string;
  quantity: number;
  options: PricedOption[];
  unitPricePaisa: number;
  lineTotalPaisa: number;
}

/** Either every line priced, or the problems, each with the index of its line (null when unknown). */
export type Pricing =
  | { ok: true; lines: PricedLine[]; subtotalPaisa: number }
  | { ok: false; problems: { line: number | null; message: string }[] };

const LINE_PREFIX = /^lines\[(\d+)\]: (.*)$/s;

/** Prices lines with menu-service, the only source of prices. */
@Injectable()
export class MenuClient {
  private readonly logger = new Logger(MenuClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async price(restaurantId: string, lines: LineToPrice[]): Promise<Pricing> {
    const url = new URL(
      `restaurants/${encodeURIComponent(restaurantId)}/price`,
      this.config.MENU_SERVICE_URL.replace(/\/?$/, '/'),
    );
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines }),
        signal: AbortSignal.timeout(this.config.MENU_SERVICE_TIMEOUT_MS),
      });
      if (res.status === 422) {
        const body = (await res.json()) as { message?: unknown };
        const messages = Array.isArray(body.message) ? body.message.map(String) : [String(body.message)];
        return {
          ok: false,
          problems: messages.map((m) => {
            const match = LINE_PREFIX.exec(m);
            return match ? { line: Number(match[1]), message: match[2] } : { line: null, message: m };
          }),
        };
      }
      if (!res.ok) throw new Error(`menu-service answered ${res.status}`);
      const body = (await res.json()) as { lines: PricedLine[]; subtotalPaisa: number };
      return { ok: true, lines: body.lines, subtotalPaisa: body.subtotalPaisa };
    } catch (err) {
      this.logger.error(`Pricing for restaurant ${restaurantId} failed: ${String(err)}`);
      throw new ServiceUnavailableException('Could not price the cart; try again');
    }
  }
}
