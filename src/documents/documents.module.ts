// documents/documents.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deal } from '../deals/entities/deal.entity.js';
import { PlanNeed } from '../plans/entities/plan-need.entity.js';
import { PlansModule } from '../plans/plans.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { DocumentTask } from './entities/document-task.entity.js';
import { Receipt } from './entities/receipt.entity.js';
import { DocumentScan } from './entities/document-scan.entity.js';
import { Vendor } from '../vendors/entities/vendor.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentTask, DocumentScan, Receipt, PlanNeed, Deal, Vendor]), PlansModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}