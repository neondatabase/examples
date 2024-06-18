import { config } from 'dotenv';
import { Module } from '@nestjs/common';
import { neon } from '@neondatabase/serverless';

config({
  path: ['.env', '.env.production', '.env.local'],
});

const sql = neon(process.env.POSTGRES_URL);

const dbProvider = {
  provide: 'POSTGRES_POOL',
  useValue: sql,
};

@Module({
  providers: [dbProvider],
  exports: [dbProvider],
})
export class DatabaseModule {}
