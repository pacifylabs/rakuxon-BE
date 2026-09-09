import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { Article } from './entities/article.entity';
import { Course } from './entities/course.entity';
import { Institution } from './entities/institution.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Institution, Course, Article])],
  controllers: [CatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
