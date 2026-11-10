import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import { idSchema } from '../orders/orders.dto';
import { type ReviewCreateDto, reviewCreateSchema } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller(':id/review')
@UseGuards(IdentityGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  get(@CurrentUser() me: Identity, @Param('id', { schema: idSchema }) id: string) {
    return this.reviews.get(me, id);
  }

  @Post()
  create(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: reviewCreateSchema }) body: ReviewCreateDto,
  ) {
    return this.reviews.create(me, id, body);
  }
}
