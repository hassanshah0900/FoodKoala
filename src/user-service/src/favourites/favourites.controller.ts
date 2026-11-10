import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, IdentityGuard, type Identity } from '../identity/identity';
import { FavouritesService } from './favourites.service';

const restaurantIdSchema = z.uuid();

@Controller('me/favourites')
@UseGuards(IdentityGuard)
export class FavouritesController {
  constructor(private readonly favourites: FavouritesService) {}

  @Get()
  list(@CurrentUser() me: Identity) {
    return this.favourites.list(me);
  }

  @Put(':restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async add(@CurrentUser() me: Identity, @Param('restaurantId', { schema: restaurantIdSchema }) id: string) {
    await this.favourites.add(me, id);
  }

  @Delete(':restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() me: Identity, @Param('restaurantId', { schema: restaurantIdSchema }) id: string) {
    await this.favourites.remove(me, id);
  }
}
