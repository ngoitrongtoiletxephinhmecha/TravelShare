import { Module } from '@nestjs/common';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { AvailabilityService } from './availability.service';

@Module({
  controllers: [GearController],
  providers: [GearService, AvailabilityService],
  exports: [GearService, AvailabilityService],
})
export class GearModule { }
