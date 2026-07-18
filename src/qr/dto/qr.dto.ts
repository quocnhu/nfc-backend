import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class CreateQRDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  url: string;
}
