import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

/**
 * bootstrap — Start the NestJS application.
 *
 * 1. Create the NestJS app from AppModule.
 * 2. Register cookie-parser middleware to parse JWT httpOnly cookies.
 * 3. Enable CORS with credentials (required for cross-origin cookie sending).
 * 4. Register global ValidationPipe for DTO validation on all routes.
 * 5. Start listening on the configured port (default: 3000).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Step 1: Global prefix — all routes become /api/...
  app.setGlobalPrefix('api');

  // Step 2: Parse cookies from incoming requests (needed for JWT cookie)
  app.use(cookieParser());

  // Step 3: Enable CORS — credentials: true allows httpOnly cookies in cross-origin requests
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, curl, same-origin)
      if (!origin) return callback(null, true);
      // Allow any localhost in development
      if (origin.startsWith('http://localhost:')) return callback(null, true);
      // Allow configured origin
      const allowed = process.env.CORS_ORIGIN || 'http://localhost:3000';
      if (origin === allowed) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Step 3: Global validation pipe — validates all incoming request bodies against DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // Strip properties not defined in the DTO
      forbidNonWhitelisted: true, // Throw 400 if unknown properties are sent
      transform: true,            // Auto-transform payloads to DTO instances
      transformOptions: { enableImplicitConversion: true }, // Allow type coercion (string → number)
    }),
  );

  // Step 4: Start the server
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
}
bootstrap();
