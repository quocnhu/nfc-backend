import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as paypal from '@paypal/checkout-server-sdk';

@Injectable()
export class PaypalConfig {
  private client: paypal.PayPalHttpClient;

  constructor(private config: ConfigService) {
    this.initClient();
  }

  private initClient() {
    const mode = this.config.get('PAYPAL_MODE') || 'sandbox';
    const clientId = this.config.get('PAYPAL_CLIENT_ID');
    const clientSecret = this.config.get('PAYPAL_CLIENT_SECRET');

    let environment;
    if (mode === 'live') {
      environment = new paypal.core.LiveEnvironment(clientId, clientSecret);
    } else {
      environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
    }

    this.client = new paypal.core.PayPalHttpClient(environment);
  }

  getClient(): paypal.PayPalHttpClient {
    return this.client;
  }

  isLive(): boolean {
    return this.config.get('PAYPAL_MODE') === 'live';
  }
}
