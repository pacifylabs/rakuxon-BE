import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminCatalogueController } from './admin-catalogue.controller';
import { AdminCatalogueService } from './admin-catalogue.service';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { Article } from './entities/article.entity';
import { Country } from './entities/country.entity';
import { Course } from './entities/course.entity';
import { Institution } from './entities/institution.entity';
import { IntakeTerm } from './entities/intake-term.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Institution, Course, Article, Country, IntakeTerm]),
    AdminAuthModule,
  ],
  controllers: [CatalogueController, AdminCatalogueController],
  providers: [CatalogueService, AdminCatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
