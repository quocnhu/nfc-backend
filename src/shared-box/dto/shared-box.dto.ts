import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateSharedBoxDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  inputLang: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  outputLang: string;
}

export class AddSharedSentenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  sourceText: string;
}
