import { Global, Module } from '@nestjs/common';
import { SupabaseConfig } from '@/config/supabase.config';

@Global()
@Module({
  providers: [SupabaseConfig],
  exports: [SupabaseConfig],
})
export class SupabaseModule {}
