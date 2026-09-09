import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

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

export class DeleteTranslationDto {
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class BulkDeleteTranslationDto {
  @IsNotEmpty()
  ids: string[];
}