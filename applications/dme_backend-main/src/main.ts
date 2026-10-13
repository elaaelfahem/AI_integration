import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { DatabaseUnavailableFilter } from './common/filters/database-unavailable.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      xFrameOptions: { action: 'deny' },
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new PrismaExceptionFilter(),
    new DatabaseUnavailableFilter(),
  );
  const configService = app.get(ConfigService);
  const allowedOrigins = (
    configService.get<string>('CORS_ORIGINS') ??
    configService.get<string>('FRONTEND_URL', 'http://localhost:3000')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowAllOrigins = allowedOrigins.includes('*');

  app.enableCors({
    origin: allowAllOrigins ? true : allowedOrigins,
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });

  const config = new DocumentBuilder()
    .setTitle('DME Backend API')
    .setDescription('Authentication API for the DME MVP')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('refresh_token')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  await app.listen(
    Number(configService.get('PORT', 3001)),
    configService.get<string>('HOST', '127.0.0.1'),
  );
}

void bootstrap();
