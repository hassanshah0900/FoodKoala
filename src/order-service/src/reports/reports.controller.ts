import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import { idSchema } from '../orders/orders.dto';
import { type ReportQuery, reportQuerySchema } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('restaurants/:restaurantId/report')
@UseGuards(IdentityGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  sales(
    @CurrentUser() me: Identity,
    @Param('restaurantId', { schema: idSchema }) restaurantId: string,
    @Query({ schema: reportQuerySchema }) query: ReportQuery,
  ) {
    return this.reports.sales(me, restaurantId, query);
  }
}
