import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import {
  type AddLineDto,
  addLineSchema,
  lineIdSchema,
  type ReorderDto,
  reorderSchema,
  type UpdateLineDto,
  updateLineSchema,
} from './cart.dto';
import { CartService } from './cart.service';

@Controller()
@UseGuards(IdentityGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() me: Identity) {
    return this.cart.get(me);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentUser() me: Identity) {
    await this.cart.clear(me);
  }

  @Post('items')
  add(@CurrentUser() me: Identity, @Body({ schema: addLineSchema }) body: AddLineDto) {
    return this.cart.add(me, body);
  }

  @Patch('items/:lineId')
  update(
    @CurrentUser() me: Identity,
    @Param('lineId', { schema: lineIdSchema }) lineId: string,
    @Body({ schema: updateLineSchema }) body: UpdateLineDto,
  ) {
    return this.cart.update(me, lineId, body);
  }

  @Delete('items/:lineId')
  remove(@CurrentUser() me: Identity, @Param('lineId', { schema: lineIdSchema }) lineId: string) {
    return this.cart.remove(me, lineId);
  }

  @Post('reorder')
  reorder(@CurrentUser() me: Identity, @Body({ schema: reorderSchema }) body: ReorderDto) {
    return this.cart.reorder(me, body);
  }
}
