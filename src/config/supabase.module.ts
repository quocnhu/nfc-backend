import { Global, Module } from '@nestjs/common';
import { SupabaseConfig } from './supabase.config';

@Global()
@Module({
  providers: [SupabaseConfig],
  exports: [SupabaseConfig],
})
export class SupabaseModule {}
