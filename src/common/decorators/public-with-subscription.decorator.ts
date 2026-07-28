import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_WITH_SUBSCRIPTION_KEY = 'isPublicWithSubscription';

export const PublicWithSubscription = () =>
  SetMetadata(IS_PUBLIC_WITH_SUBSCRIPTION_KEY, true);
