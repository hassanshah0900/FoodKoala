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
  Query,
  UseGuards,
} from '@nestjs/common';
import { pointQuerySchema, type Location } from '../geo/geo';
import { CurrentUser, IdentityGuard, type Identity } from '../identity/identity';
import { idSchema, pageQuerySchema, type PageQuery } from '../restaurants/restaurants.dto';
import { zoneCreateSchema, zoneUpdateSchema, type ZoneCreateDto, type ZoneUpdateDto } from './zones.dto';
import { ZonesService } from './zones.service';

/** Public: who delivers here, and on which terms. */
@Controller()
export class BrowseController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  deliveringTo(
    @Query({ schema: pointQuerySchema }) at: Location,
    @Query({ schema: pageQuerySchema }) page: PageQuery,
  ) {
    return this.zones.deliveringTo(at, page);
  }

  @Get(':id/delivery-quote')
  quote(@Param('id', { schema: idSchema }) id: string, @Query({ schema: pointQuerySchema }) at: Location) {
    return this.zones.quote(id, at);
  }
}

/** The owner's (or an admin's) delivery zones of a restaurant. */
@Controller(':id/zones')
@UseGuards(IdentityGuard)
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  list(@CurrentUser() me: Identity, @Param('id', { schema: idSchema }) id: string) {
    return this.zones.list(me, id);
  }

  @Post()
  create(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: zoneCreateSchema }) body: ZoneCreateDto,
  ) {
    return this.zones.create(me, id, body);
  }

  @Patch(':zoneId')
  update(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Param('zoneId', { schema: idSchema }) zoneId: string,
    @Body({ schema: zoneUpdateSchema }) body: ZoneUpdateDto,
  ) {
    return this.zones.update(me, id, zoneId, body);
  }

  @Delete(':zoneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() me: Identity,
    @Param('id', { schema: idSchema }) id: string,
    @Param('zoneId', { schema: idSchema }) zoneId: string,
  ) {
    await this.zones.remove(me, id, zoneId);
  }
}
