import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import { idSchema, type PageQuery, pageQuerySchema } from '../orders/orders.dto';
import {
  type VoucherCreateDto,
  type VoucherUpdateDto,
  voucherCodeSchema,
  voucherCreateSchema,
  voucherUpdateSchema,
} from './vouchers.dto';
import { VouchersService } from './vouchers.service';

/** Admins manage vouchers; customers check what one takes off their cart. */
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Post()
  @UseGuards(AdminGuard)
  create(@Body({ schema: voucherCreateSchema }) body: VoucherCreateDto) {
    return this.vouchers.create(body);
  }

  @Get()
  @UseGuards(AdminGuard)
  list(@Query({ schema: pageQuerySchema }) query: PageQuery) {
    return this.vouchers.list(query);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id', { schema: idSchema }) id: string, @Body({ schema: voucherUpdateSchema }) body: VoucherUpdateDto) {
    return this.vouchers.update(id, body);
  }

  @Get(':code/discount')
  @UseGuards(IdentityGuard)
  discount(@CurrentUser() me: Identity, @Param('code', { schema: voucherCodeSchema }) code: string) {
    return this.vouchers.discountOnCart(me, code);
  }
}
