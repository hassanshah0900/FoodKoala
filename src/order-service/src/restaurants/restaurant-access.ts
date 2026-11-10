import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantClient } from '../clients/clients';
import { type Identity, isAdmin } from '../identity/identity';

/** Who may see a restaurant's orders and reports: its owner (asked of restaurant-service, ADR 0006) or an admin. */
@Injectable()
export class RestaurantAccess {
  constructor(private readonly restaurants: RestaurantClient) {}

  async assertManages(me: Identity, restaurantId: string): Promise<void> {
    if (isAdmin(me)) return;
    const owner = await this.restaurants.isOwner(me, restaurantId);
    if (owner === null) throw new NotFoundException('Restaurant not found');
    if (!owner) throw new ForbiddenException('Not your restaurant');
  }
}
