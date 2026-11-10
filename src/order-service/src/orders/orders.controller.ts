import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import {
  type CheckoutDto,
  checkoutSchema,
  idempotencyKeySchema,
  idSchema,
  type PageQuery,
  pageQuerySchema,
  type RestaurantOrdersQuery,
  restaurantOrdersQuerySchema,
  type StatusChangeDto,
  statusChangeSchema,
} from './orders.dto';
import { OrdersService } from './orders.service';

// Static routes (restaurants/...) are declared before `:id` so they win.
@Controller()
@UseGuards(IdentityGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async checkout(
    @CurrentUser() me: Identity,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body({ schema: checkoutSchema }) body: CheckoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = idempotencyKeySchema.safeParse(rawKey);
    if (!key.success)
      throw new BadRequestException(
        rawKey === undefined ? 'Send an Idempotency-Key header' : key.error.issues[0].message,
      );
    const { order, created } = await this.orders.checkout(me, key.data, body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return order;
  }

  @Get()
  mine(@CurrentUser() me: Identity, @Query({ schema: pageQuerySchema }) query: PageQuery) {
    return this.orders.listMine(me, query);
  }

  @Get('restaurants/:restaurantId/orders')
  forRestaurant(
    @CurrentUser() me: Identity,
    @Param('restaurantId', { schema: idSchema }) restaurantId: string,
    @Query({ schema: restaurantOrdersQuerySchema }) query: RestaurantOrdersQuery,
  ) {
    return this.orders.listForRestaurant(me, restaurantId, query);
  }

  @Get(':id')
  get(@CurrentUser() me: Identity, @Param('id', { schema: idSchema }) id: string) {
    return this.orders.get(me, id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: statusChangeSchema }) body: StatusChangeDto,
  ) {
    return this.orders.changeStatus(me, id, body);
  }
}
