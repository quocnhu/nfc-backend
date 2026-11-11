import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export type NotificationAudienceValue = 'ALL' | 'ROLE' | 'USER';

/**
 * SendNotificationDto — Admin creates a message for every user, a role group,
 * or one specific user.
 * - title: Short headline shown in the bell list.
 * - body: Message content.
 * - audienceType: ALL = every user, ROLE = users in roleId, USER = userId.
 * - roleId: Required when audienceType is ROLE.
 * - userId: Required when audienceType is USER.
 * - sendEmail: Also deliver the message by email (default true).
 */
export class SendNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsIn(['ALL', 'ROLE', 'USER'])
  audienceType!: NotificationAudienceValue;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

/**
 * MarkReadDto — Mark specific notification recipients as read, or all of them.
 */
export class MarkReadDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

/**
 * DeleteNotificationDto — Admin removes a sent notification and its recipients.
 */
export class DeleteNotificationDto {
  @IsUUID()
  id!: string;
}
