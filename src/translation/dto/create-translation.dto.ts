import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';

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

/**
 * LiveTranslateDto — one realtime turn, fanned out to several languages.
 * Nothing is persisted; the payload is intentionally narrow so the realtime
 * endpoint can never be used to write history by accident.
 */
export class LiveTranslateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text: string;

  /**
   * Optional detection hints. Exactly one hint is treated as the source language;
   * two or more means the conversation is mixed, so the model auto-detects.
   */
  @IsOptional()
  @IsString({ each: true })
  fromHint?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  to: string[];
}

/**
 * Body for POST /translation/romanize — a pronunciation guide for one text.
 * `lang` is the language of `text` itself (the guide describes that text).
 */
export class RomanizeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  lang: string;
}

/** Body for multipart POST /translation/stt — audio arrives as the `audio` file field. */
export class SttDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  langHint?: string;
}