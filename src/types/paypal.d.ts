declare module '@paypal/checkout-server-sdk' {
  export class PayPalHttpClient {
    constructor(environment: any);
    execute(request: any): Promise<any>;
  }

  namespace orders {
    class OrdersCreateRequest {
      prefer(value: string): void;
      requestBody(body: any): void;
    }

    class OrdersCaptureRequest {
      constructor(orderId: string);
      requestBody(body: any): void;
    }
  }

  namespace core {
    class PayPalHttpClient {
      constructor(environment: any);
      execute(request: any): Promise<any>;
    }

    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }

    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
  }
}
