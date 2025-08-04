import { ConfigService } from '@nestjs/config';
import type { MongooseModuleOptions } from '@nestjs/mongoose';

export const getMongoConfig = (
  configService: ConfigService,
): MongooseModuleOptions => {
  let uri = 'mongodb://';

  const username = configService.get('MONGODB_USERNAME');

  if (typeof username === 'string') {
    uri += username;

    const password = configService.get('MONGODB_PASSWORD');

    if (typeof password === 'string') {
      uri += `:${password}`;
    }

    uri += '@';
  }

  const dbHost = configService.get('MONGODB_HOST');
  const dbPort = configService.get('MONGODB_PORT');
  const dbName = configService.get('MONGODB_DB_NAME');

  uri += `${dbHost}:${dbPort}/${dbName}`;

  console.log(uri);

  return {
    uri,
  };
};
