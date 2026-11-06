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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, IdentityGuard, type Identity } from '../identity/identity';
import {
  addressCreateSchema,
  addressIdSchema,
  addressUpdateSchema,
  type AddressCreateDto,
  type AddressUpdateDto,
} from './addresses.dto';
import { AddressesService } from './addresses.service';

@Controller('me/addresses')
@UseGuards(IdentityGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() me: Identity) {
    return this.addresses.list(me);
  }

  @Post()
  create(@CurrentUser() me: Identity, @Body({ schema: addressCreateSchema }) body: AddressCreateDto) {
    return this.addresses.create(me, body);
  }

  @Get(':id')
  get(@CurrentUser() me: Identity, @Param('id', { schema: addressIdSchema }) id: string) {
    return this.addresses.get(me, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() me: Identity,
    @Param('id', { schema: addressIdSchema }) id: string,
    @Body({ schema: addressUpdateSchema }) body: AddressUpdateDto,
  ) {
    return this.addresses.update(me, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() me: Identity, @Param('id', { schema: addressIdSchema }) id: string) {
    await this.addresses.remove(me, id);
  }
}
