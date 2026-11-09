import { type INestApplication, RequestMethod } from '@nestjs/common';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
}
