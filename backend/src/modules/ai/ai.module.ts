import { Module } from '@nestjs/common';
import { ChecklistsModule } from '../checklists/checklists.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { TripRequirementParser } from './trip-requirement.parser';
import { TripStateValidator } from './trip-state.validator';

@Module({
  imports: [ChecklistsModule],
  controllers: [AiController],
  providers: [AiService, TripRequirementParser, TripStateValidator],
  exports: [AiService, TripRequirementParser, TripStateValidator],
})
export class AiModule {}
