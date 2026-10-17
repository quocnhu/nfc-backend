import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseConfig implements OnModuleInit {
  private client: SupabaseClient | null = null;
  private readonly logger = new Logger(SupabaseConfig.name);

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    // Do not crash the whole app on boot: only Supabase-backed features
    // (storage / uploads) depend on this client. Log loudly and let the
    // failure surface on first actual use instead.
    if (!url || !key) {
      this.logger.error(
        'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env — Supabase storage features will be unavailable.',
      );
      return;
    }

    this.client = createClient(url, key);
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase client is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    }
    return this.client;
  }
}
