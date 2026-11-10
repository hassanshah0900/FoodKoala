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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type Identity, IdentityGuard } from '../identity/identity';
import {
  type CategoryCreateDto,
  type CategoryUpdateDto,
  categoryCreateSchema,
  categoryUpdateSchema,
  type ItemCreateDto,
  type ItemUpdateDto,
  idSchema,
  itemCreateSchema,
  itemUpdateSchema,
  type OrderDto,
  orderSchema,
} from './menu.dto';
import { MenuService } from './menu.service';

@Controller()
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get('restaurants/:restaurantId')
  getMenu(@Param('restaurantId', { schema: idSchema }) restaurantId: string) {
    return this.menu.getMenu(restaurantId);
  }

  @Post('restaurants/:restaurantId/categories')
  @UseGuards(IdentityGuard)
  createCategory(
    @CurrentUser() me: Identity,
    @Param('restaurantId', { schema: idSchema }) restaurantId: string,
    @Body({ schema: categoryCreateSchema }) body: CategoryCreateDto,
  ) {
    return this.menu.createCategory(me, restaurantId, body);
  }

  @Put('restaurants/:restaurantId/categories/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(IdentityGuard)
  async reorderCategories(
    @CurrentUser() me: Identity,
    @Param('restaurantId', { schema: idSchema }) restaurantId: string,
    @Body({ schema: orderSchema }) body: OrderDto,
  ) {
    await this.menu.reorderCategories(me, restaurantId, body.ids);
  }

  @Patch('categories/:categoryId')
  @UseGuards(IdentityGuard)
  updateCategory(
    @CurrentUser() me: Identity,
    @Param('categoryId', { schema: idSchema }) categoryId: string,
    @Body({ schema: categoryUpdateSchema }) body: CategoryUpdateDto,
  ) {
    return this.menu.updateCategory(me, categoryId, body);
  }

  @Delete('categories/:categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(IdentityGuard)
  async deleteCategory(@CurrentUser() me: Identity, @Param('categoryId', { schema: idSchema }) categoryId: string) {
    await this.menu.deleteCategory(me, categoryId);
  }

  @Post('categories/:categoryId/items')
  @UseGuards(IdentityGuard)
  createItem(
    @CurrentUser() me: Identity,
    @Param('categoryId', { schema: idSchema }) categoryId: string,
    @Body({ schema: itemCreateSchema }) body: ItemCreateDto,
  ) {
    return this.menu.createItem(me, categoryId, body);
  }

  @Put('categories/:categoryId/items/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(IdentityGuard)
  async reorderItems(
    @CurrentUser() me: Identity,
    @Param('categoryId', { schema: idSchema }) categoryId: string,
    @Body({ schema: orderSchema }) body: OrderDto,
  ) {
    await this.menu.reorderItems(me, categoryId, body.ids);
  }

  @Get('items/:itemId')
  getItem(@Param('itemId', { schema: idSchema }) itemId: string) {
    return this.menu.getItem(itemId);
  }

  @Patch('items/:itemId')
  @UseGuards(IdentityGuard)
  updateItem(
    @CurrentUser() me: Identity,
    @Param('itemId', { schema: idSchema }) itemId: string,
    @Body({ schema: itemUpdateSchema }) body: ItemUpdateDto,
  ) {
    return this.menu.updateItem(me, itemId, body);
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(IdentityGuard)
  async deleteItem(@CurrentUser() me: Identity, @Param('itemId', { schema: idSchema }) itemId: string) {
    await this.menu.deleteItem(me, itemId);
  }
}
