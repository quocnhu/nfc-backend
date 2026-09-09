import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateTranslationDto {
  @IsString()
  @IsNotEmpty()
  sourceText: string;

  @IsString()
  @IsNotEmpty()
  sourceLang: string;

  @IsString()
  @IsNotEmpty()
  targetLang: string;
}

export class SpeakQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  text: string;

  @IsString()
  @IsNotEmpty()
  lang: string;
}

export class UpdateTranslationDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  sourceText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  translatedText?: string;
}

export class DeleteTranslationDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class BulkDeleteTranslationDto {
  @IsNotEmpty()
  ids: string[];
}