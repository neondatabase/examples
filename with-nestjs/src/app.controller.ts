import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('/')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async getTable() {
    return this.appService.getTable('playing_with_neon');
  }
}
