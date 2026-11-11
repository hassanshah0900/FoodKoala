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
import { type Location, pointQuerySchema } from '../geo/geo';
import { CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import { idSchema, type PageQuery, pageQuerySchema } from '../restaurants/restaurants.dto';
import {
  type QuoteQuery,
  quoteQuerySchema,
  type ZoneCreateDto,
  type ZoneUpdateDto,
  zoneCreateSchema,
  zoneUpdateSchema,
} from './zones.dto';
import { ZonesService } from './zones.service';

/** Public: who delivers here, and on which terms. */
@Controller()
export class BrowseController {
  constructor(private readonly zones: ZonesService) {}

  @Get()
  deliveringTo(@Query({ schema: pointQuerySchema }) at: Location, @Query({ schema: pageQuerySchema }) page: PageQuery) {
    return this.zones.deliveringTo(at, page);
  }

  @Get(':id/delivery-quote')
  quote(@Param('id', { schema: idSchema }) id: string, @Query({ schema: quoteQuerySchema }) query: QuoteQuery) {
    const { at, ...point } = query;
    return this.zones.quote(id, point, at);
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
