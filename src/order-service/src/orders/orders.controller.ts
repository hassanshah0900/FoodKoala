import { BadRequestException, Body, Controller, Get, Headers, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, IdentityGuard, type Identity } from '../identity/identity';
import {
  checkoutSchema,
  idempotencyKeySchema,
  idSchema,
  pageQuerySchema,
  restaurantOrdersQuerySchema,
  type CheckoutDto,
  type PageQuery,
  type RestaurantOrdersQuery,
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
    if (!key.success) throw new BadRequestException(rawKey === undefined ? 'Send an Idempotency-Key header' : key.error.issues[0].message);
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
}
