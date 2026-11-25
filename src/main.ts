import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { TransformResponseInterceptor } from './interceptors/transform-response/transform-response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Menyajikan berkas media publik dari folder uploads/public
  app.useStaticAssets(join(process.cwd(), 'uploads', 'public'), {
    prefix: '/uploads/',
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Buang field yang tidak ada di DTO
      forbidNonWhitelisted: true, // Tolak request jika membawa field ekstra
      transform: true, // Ubah payload/query menjadi instance DTO & tipe yang benar
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new TransformResponseInterceptor());

  // Development membolehkan origin lokal; production wajib memakai allow-list.
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const allowedOrigins = (config.get<string>('CORS_ORIGINS', '') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: nodeEnv === 'production' ? allowedOrigins : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Swagger Documentation
  const swagger = new DocumentBuilder()
    .setTitle('Wedding+ API')
    .setDescription('API untuk aplikasi mobile (Flutter) dan dashboard web (admin & vendor)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
}

await bootstrap();