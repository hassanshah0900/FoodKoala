import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { type HoursDto, hoursSchema } from '../hours/hours';
import { AdminGuard, CurrentUser, type Identity, IdentityGuard, OptionalUser } from '../identity/identity';
import {
  idSchema,
  pauseSchema,
  type RestaurantCreateDto,
  type RestaurantUpdateDto,
  type ReviewQuery,
  restaurantCreateSchema,
  restaurantUpdateSchema,
  reviewQuerySchema,
  type StatusChangeDto,
  statusChangeSchema,
} from './restaurants.dto';
import { RestaurantsService } from './restaurants.service';

// Static routes (mine, admin) are declared before `:id` so they win.
@Controller()
export class RestaurantsController {
  constructor(private readonly restaurants: RestaurantsService) {}

  @Post()
  @UseGuards(IdentityGuard)
  create(@CurrentUser() me: Identity, @Body({ schema: restaurantCreateSchema }) body: RestaurantCreateDto) {
    return this.restaurants.create(me, body);
  }

  @Get('mine')
  @UseGuards(IdentityGuard)
  mine(@CurrentUser() me: Identity) {
    return this.restaurants.listMine(me);
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  forReview(@Query({ schema: reviewQuerySchema }) query: ReviewQuery) {
    return this.restaurants.listByStatus(query);
  }

  @Get(':id')
  get(@OptionalUser() me: Identity | undefined, @Param('id', { schema: idSchema }) id: string) {
    return this.restaurants.get(me, id);
  }

  @Patch(':id')
  @UseGuards(IdentityGuard)
  update(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: restaurantUpdateSchema }) body: RestaurantUpdateDto,
  ) {
    return this.restaurants.update(me, id, body);
  }

  @Put(':id/hours')
  @UseGuards(IdentityGuard)
  setHours(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: hoursSchema }) body: HoursDto,
  ) {
    return this.restaurants.setHours(me, id, body);
  }

  @Put(':id/pause')
  @UseGuards(IdentityGuard)
  pause(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: pauseSchema }) body: { minutes: number },
  ) {
    return this.restaurants.pause(me, id, body.minutes);
  }

  @Delete(':id/pause')
  @UseGuards(IdentityGuard)
  resume(@CurrentUser() me: Identity, @Param('id', { schema: idSchema }) id: string) {
    return this.restaurants.resume(me, id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IdentityGuard)
  changeStatus(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: statusChangeSchema }) body: StatusChangeDto,
  ) {
    return this.restaurants.changeStatus(me, id, body);
  }
}
