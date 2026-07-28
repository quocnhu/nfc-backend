import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, StrategyOptions } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const options: StrategyOptions = {
      clientID: config.get('GOOGLE_CLIENT_ID') || '',
      clientSecret: config.get('GOOGLE_CLIENT_SECRET') || '',
      callbackURL: config.get('GOOGLE_CALLBACK_URL') || '',
      scope: ['email', 'profile'],
    };
    super(options);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const { id, emails, displayName, photos } = profile;
    done(null, {
      googleId: id,
      email: emails?.[0]?.value,
      fullname: displayName,
      avatarUrl: photos?.[0]?.value,
    });
  }
}
