import { Module } from '@nestjs/common';
import { GearModule } from '../gear/gear.module';
import {
  AdminDisputesController,
  BookingsController,
} from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingEventsService } from './booking-events.service';

@Module({
  imports: [GearModule],
  controllers: [BookingsController, AdminDisputesController],
  providers: [BookingsService, BookingEventsService],
  exports: [BookingsService, BookingEventsService],
})
export class BookingsModule {}
