import { Controller, Get, Param, Query } from '@nestjs/common';
import { idSchema, type PageQuery, pageQuerySchema } from '../restaurants/restaurants.dto';
import { RatingsService } from './ratings.service';

@Controller(':id/reviews')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Get()
  list(@Param('id', { schema: idSchema }) id: string, @Query({ schema: pageQuerySchema }) query: PageQuery) {
    return this.ratings.list(id, query);
  }
}
