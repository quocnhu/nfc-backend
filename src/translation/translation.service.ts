import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';
import {
  CreateTranslationDto,
  UpdateTranslationDto,
  SpeakQueryDto,
} from '@/translation/dto/create-translation.dto';
import { translate } from '@vitalets/google-translate-api';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

/**
 * Microsoft Edge neural voices — authentic native speakers with regional accents:
 *  - vi      South Vietnamese (Hoài My)
 *  - en      British English (Sonia)
 *  - en-US   American English (Jenny)
 *  - zh-CN   Mandarin Chinese (Xiaoxiao)
 *  - zh-TW   Taiwanese Mandarin (Hsiao Chen)
 *  - ja      Japanese (Nanami)
 *  - nl/fr/de/es/pt/it/ru/pl/tr/uk/sv/no/da/fi/ro/hu/cs/el/th/id/fil/ms/bn/ur/fa/he/ar/hi/ko
 *    each mapped to a native regional neural voice below.
 */
const EDGE_VOICES: Record<string, string> = {
  vi: 'vi-VN-HoaiMyNeural',
  en: 'en-GB-SoniaNeural',
  'en-US': 'en-US-JennyNeural',
  'en-GB': 'en-GB-SoniaNeural',
  ja: 'ja-JP-NanamiNeural',
  ko: 'ko-KR-SunHiNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  fr: 'fr-FR-DeniseNeural',
  de: 'de-DE-KatjaNeural',
  es: 'es-ES-ElviraNeural',
  pt: 'pt-BR-ThalitaNeural',
  ru: 'ru-RU-SvetlanaNeural',
  it: 'it-IT-ElsaNeural',
  th: 'th-TH-PremwadeeNeural',
  id: 'id-ID-GadisNeural',
  ar: 'ar-SA-ZariyahNeural',
  hi: 'hi-IN-SwaraNeural',
  nl: 'nl-NL-ColetteNeural',
  pl: 'pl-PL-ZofiaNeural',
  tr: 'tr-TR-EmelNeural',
  uk: 'uk-UA-PolinaNeural',
  sv: 'sv-SE-SofieNeural',
  no: 'nb-NO-PernilleNeural',
  da: 'da-DK-ChristelNeural',
  fi: 'fi-FI-NooraNeural',
  ro: 'ro-RO-EmilNeural',
  hu: 'hu-HU-NoemiNeural',
  cs: 'cs-CZ-VlastaNeural',
  el: 'el-GR-AthinaNeural',
  fil: 'fil-PH-BlessicaNeural',
  ms: 'ms-MY-YasminNeural',
  bn: 'bn-BD-NabanitaNeural',
  ur: 'ur-PK-UzmaNeural',
  fa: 'fa-IR-DilaraNeural',
  he: 'he-IL-HilaNeural',
};

const EDGE_FALLBACK_VOICES: Record<string, string> = {
  ja: 'ja-JP-KeitaNeural',
  fi: 'fi-FI-HarriNeural',
  ro: 'ro-RO-AlinaNeural',
};

const resolveVoice = (lang: string): string | null =>
  EDGE_VOICES[lang] || EDGE_VOICES[lang.split('-')[0]] || null;

const resolveFallbackVoice = (lang: string): string | null =>
  EDGE_FALLBACK_VOICES[lang] ||
  EDGE_FALLBACK_VOICES[lang.split('-')[0]] ||
  null;

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Wrap raw 16-bit PCM into a playable WAV container. */
const pcmToWav = (pcm: Buffer, sampleRate: number, numChannels = 1, bitsPerSample = 16): Buffer => {
  const dataSize = pcm.length;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
};

@Injectable()
export class TranslationService {
  constructor(private prisma: PrismaService) {}

  /**
   * translateAndStore — Translate text from sourceLang to targetLang
   * using Google Translate and persist the result for the user.
   */
  async translateAndStore(userId: string, dto: CreateTranslationDto) {
    const sourceText = dto.sourceText.trim();
    if (!sourceText) {
      throw new BadRequestException('Text to translate is required');
    }

    if (dto.sourceLang === dto.targetLang) {
      throw new BadRequestException('Source and target languages must be different');
    }

    if (sourceText.length > 5000) {
      throw new BadRequestException('Text is too long (max 5000 characters)');
    }

    let translatedText = '';
    try {
      const result = await translate(sourceText, {
        from: dto.sourceLang,
        to: dto.targetLang,
      });
      translatedText = result.text;
    } catch (error) {
      throw new BadRequestException(
        'Translation service error. Please try again in a moment.',
      );
    }

    if (!translatedText) {
      throw new BadRequestException('Unable to translate the provided text');
    }

    const translation = await this.prisma.translation.create({
      data: {
        userId,
        sourceText,
        translatedText,
        sourceLang: dto.sourceLang,
        targetLang: dto.targetLang,
      },
    });

    return responseCreated('Translation saved successfully', translation);
  }

  /**
   * speak — Generate a native-sounding audio clip for the requested language.
   *
   * Voice chain (most natural first):
   *   1. Gemini TTS "Achernar" (American female) for en/en-US when GEMINI_API_KEY is set.
   *   2. Microsoft Edge neural voices — true regional accents
   *      (vi-VN-HoaiMyNeural South Vietnamese, en-US-JennyNeural American,
   *       en-GB-SoniaNeural British, zh-CN-XiaoxiaoNeural, zh-TW-HsiaoChenNeural, ja-JP-NanamiNeural...).
   *      If the primary voice streams fail, a per-language fallback voice is
   *      attempted once (ja-JP-KeitaNeural for Japanese, fi-FI-HarriNeural,
   *      ro-RO-AlinaNeural) before giving up.
   *   3. Google translate_tts as a last-resort fallback.
   */
  async speak(dto: SpeakQueryDto) {
    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException('Text to speak is required');
    }
    if (text.length > 200) {
      throw new BadRequestException('Text is too long (max 200 characters for speech)');
    }

    const lang = dto.lang;

    // 1) Gemini TTS "Achernar" — ultra-natural American English, only for explicit en-US.
    if (this.geminiApiKey() && lang === 'en-US') {
      try {
        const { audio, mimeType } = await this.geminiSpeak(text, 'Achernar');
        return responseOk('Speech generated successfully', { audio, mimeType, engine: 'gemini', lang });
      } catch (error) {
        // fall through to Edge
      }
    }

    // 2) Microsoft Edge neural voices — native regional accents.
    const edgeVoice = resolveVoice(lang);
    if (edgeVoice) {
      try {
        const audio = await this.edgeSpeak(text, edgeVoice);
        return responseOk('Speech generated successfully', {
          audio,
          mimeType: 'audio/mpeg',
          engine: 'edge',
          voice: edgeVoice,
          lang,
        });
      } catch (error) {
        const fallbackVoice = resolveFallbackVoice(lang);
        if (fallbackVoice) {
          try {
            const audio = await this.edgeSpeak(text, fallbackVoice);
            return responseOk('Speech generated successfully', {
              audio,
              mimeType: 'audio/mpeg',
              engine: 'edge',
              voice: fallbackVoice,
              lang,
            });
          } catch (fallbackError) {
            // fall through to Google
          }
        }
        // fall through to Google
      }
    }

    // 3) Google translate_tts fallback.
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
      lang,
    )}&q=${encodeURIComponent(text)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (error) {
      throw new ServiceUnavailableException('Speech service unavailable. Please try again.');
    }

    if (!res.ok) {
      throw new ServiceUnavailableException('Speech service returned an error. Please try again.');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) {
      throw new ServiceUnavailableException('Speech service returned no audio.');
    }

    return responseOk('Speech generated successfully', {
      audio: buffer.toString('base64'),
      mimeType: 'audio/mpeg',
      engine: 'google',
      lang,
    });
  }

  private geminiApiKey(): string {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
  }

  private async geminiSpeak(text: string, voice: string): Promise<{ audio: string; mimeType: string }> {
    const model = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        this.geminiApiKey(),
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Please read this text aloud naturally: ${text}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini TTS ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType?: string } }> } }>;
    };
    const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      throw new Error('Gemini TTS returned no audio');
    }

    // Gemini returns raw 16-bit PCM (audio/L16;rate=24000) — wrap it into WAV for the browser.
    const raw = Buffer.from(part.inlineData.data, 'base64');
    const mimeType = part.inlineData.mimeType || '';
    if (mimeType.includes('L16')) {
      const rateMatch = /rate=(\d+)/.exec(mimeType);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      return { audio: pcmToWav(raw, sampleRate).toString('base64'), mimeType: 'audio/wav' };
    }
    return { audio: raw.toString('base64'), mimeType };
  }

  private async edgeSpeak(text: string, voice: string): Promise<string> {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(text));
      const chunks: Buffer[] = [];
      for await (const chunk of audioStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
      }
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) {
        throw new Error('Edge TTS returned no audio');
      }
      return buffer.toString('base64');
    } finally {
      tts.close();
    }
  }

  /**
   * findMine — List all translations belonging to the logged-in user.
   */
  async findMine(userId: string) {
    const translations = await this.prisma.translation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return responseOk('Translations fetched successfully', translations);
  }

  /**
   * findAll — List all translations (admin).
   */
  async findAll(userId: string, hasReadAll: boolean) {
    if (!hasReadAll) return this.findMine(userId);

    const translations = await this.prisma.translation.findMany({
      include: { user: { select: { id: true, fullname: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return responseOk('Translations fetched successfully', translations);
  }

  /**
   * update — Edit the text of a translation the user owns.
   * Admin (read:translation:all) can edit any translation.
   */
  async update(userId: string, dto: UpdateTranslationDto, canEditAll: boolean) {
    const { id, sourceText, translatedText } = dto;
    if (sourceText === undefined && translatedText === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const translation = await this.prisma.translation.findUnique({
      where: { id },
    });

    if (!translation) {
      throw new NotFoundException('Translation not found');
    }

    if (translation.userId !== userId && !canEditAll) {
      throw new ForbiddenException('You can only edit your own translations');
    }

    const updated = await this.prisma.translation.update({
      where: { id },
      data: {
        ...(sourceText !== undefined ? { sourceText } : {}),
        ...(translatedText !== undefined ? { translatedText } : {}),
      },
    });

    return responseOk('Translation updated successfully', updated);
  }

  /**
   * deleteOne — Delete a translation owned by the user.
   * Admin (read:translation:all) can delete any translation.
   */
  async deleteOne(userId: string, translationId: string, canDeleteAll: boolean) {
    const translation = await this.prisma.translation.findUnique({
      where: { id: translationId },
    });

    if (!translation) {
      throw new NotFoundException('Translation not found');
    }

    if (translation.userId !== userId && !canDeleteAll) {
      throw new ForbiddenException('You can only delete your own translations');
    }

    await this.prisma.translation.delete({
      where: { id: translationId },
    });

    return responseOk('Translation deleted successfully');
  }

  /**
   * bulkDelete — Delete multiple translations owned by the user.
   * Admin (read:translation:all) can delete any translation.
   */
  async bulkDelete(userId: string, ids: string[], canDeleteAll: boolean) {
    if (!ids.length) throw new BadRequestException('No IDs provided');

    const translations = await this.prisma.translation.findMany({
      where: { id: { in: ids } },
    });

    if (!canDeleteAll) {
      const forbidden = translations.filter((t) => t.userId !== userId);
      if (forbidden.length) {
        throw new ForbiddenException('You can only delete your own translations');
      }
    }

    await this.prisma.translation.deleteMany({
      where: { id: { in: ids } },
    });

    return responseOk(`${ids.length} translation(s) deleted successfully`);
  }
}