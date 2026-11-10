import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import { type ProfileUpdateDto, profileUpdateSchema } from './profiles.dto';
import { ProfilesService } from './profiles.service';

@Controller('me')
@UseGuards(IdentityGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  get(@CurrentUser() me: Identity) {
    return this.profiles.getOrCreate(me);
  }

  @Patch()
  update(@CurrentUser() me: Identity, @Body({ schema: profileUpdateSchema }) body: ProfileUpdateDto) {
    return this.profiles.update(me, body);
  }
}
