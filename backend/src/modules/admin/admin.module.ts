import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, BookingsModule, NotificationsModule],
  controllers: [AdminController, ReportsController],
  providers: [AdminService, ReportsService],
  exports: [AdminService, ReportsService],
})
export class AdminModule {}
