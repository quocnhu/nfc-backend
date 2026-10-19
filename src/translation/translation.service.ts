import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma/prisma.service';
import { responseOk, responseCreated } from '@/common/helpers/response.helper';
import { pinyin } from 'pinyin-pro';
import {
  romanizeEnglish,
  romanizeJapanese,
  romanizeKorean,
  warmJapaneseRomaji,
} from '@/translation/romanizer';
import {
  CreateTranslationDto,
  UpdateTranslationDto,
  SpeakQueryDto,
} from '@/translation/dto/create-translation.dto';
import { translate } from '@vitalets/google-translate-api';
import { all as francAll } from 'franc';
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

/**
 * Romanization — a pronunciation guide rendered under a translation.
 *
 * Every supported language is resolved locally (see ./romanizer): Chinese via
 * pinyin-pro, Japanese via kuroshiro, Korean via a jamo table, English via
 * CMUdict. No API key, no quota, no network, and nothing to configure at
 * deploy time.
 *
 * This prompt table is the fallback for languages with no local engine. It is
 * currently empty by design — leaving it in place means a future language can
 * be given an AI guide without restructuring the romanize() dispatch.
 */
const ROMANIZE_PROMPTS: Record<string, string> = {};

/**
 * Gemini text models, newest first.
 *
 * Google keeps retiring model ids for newer API keys — they answer 404
 * "no longer available to new users" — and the newest ones occasionally answer
 * 503 under load. So a text call walks this list instead of trusting one id.
 */
const GEMINI_TEXT_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

/**
 * franc's ISO 639-3 codes → our UI codes. Only languages the UI can label and
 * the chain can translate appear here; anything else means "unknown", never a
 * guess. sco (Scots) reads as English for badge purposes.
 */
const FRANC_MAP: Record<string, string> = {
  eng: 'en',
  sco: 'en',
  vie: 'vi',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  jpn: 'ja',
  kor: 'ko',
  hin: 'hi',
  tha: 'th',
  ind: 'id',
  msa: 'ms',
  tgl: 'fil',
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
export class TranslationService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  /**
   * Load the Japanese dictionary while the app is still starting, so the first
   * Japanese turn doesn't pay the ~1.8s load inside a live conversation. Runs
   * in the background: booting must not block on it, and a failure here only
   * means Japanese romaji is unavailable.
   */
  onModuleInit() {
    warmJapaneseRomaji();
  }

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

    // Guide for the target language only — a pinyin of Chinese text helps nobody
    // reading an English translation.
    const romanization = await this.romanize(translatedText, dto.targetLang);

    const translation = await this.prisma.translation.create({
      data: {
        userId,
        sourceText,
        translatedText,
        romanization,
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
      include: { user: { select: { id: true, fullname: true, email: true } } },
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

  // ─── Realtime (Gemini) ─────────────────────────────────────────────────────

  private geminiTranslateKey(): string {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
  }

  private assertGeminiReady() {
    if (!this.geminiTranslateKey()) {
      throw new ServiceUnavailableException(
        'Translation AI not configured. Set GEMINI_API_KEY on the backend (free at aistudio.google.com/apikey).',
      );
    }
  }

  /**
   * translateLive — Fan one utterance out to every requested output language.
   *
   * Ephemeral: nothing is written to the Translation table, these turns belong
   * to a live conversation and must not pollute the user's saved history.
   *
   * Each target is translated independently so one failure never sinks the turn;
   * failures are reported per language in `errors`.
   */
  async translateLive(input: {
    text: string;
    fromHint?: string[];
    to: string[];
  }): Promise<{
    outputs: Record<string, string>;
    errors: Record<string, string>;
    romanizations: Record<string, string>;
    detectedSource: string | null;
  }> {
    const provider = (process.env.TRANSLATE_PROVIDER || 'auto').toLowerCase();
    if (provider === 'gemini') this.assertGeminiReady();

    const text = input.text?.trim();
    if (!text) throw new BadRequestException('Text to translate is required');

    const targets = [...new Set((input.to ?? []).filter(Boolean))];
    if (!targets.length) throw new BadRequestException('At least one output language is required');

    const hints = (input.fromHint ?? []).filter(Boolean);
    // One hint = confident guess. Several hints (or none) means mixed-language
    // conversation, so let Gemini detect per utterance instead of forcing one.
    const from = hints.length === 1 ? hints[0] : 'auto';

    const modelHint = from === 'auto'
      ? 'Detect the source language yourself — the conversation may switch languages between turns.'
      : `The source language is ${from}.`;

    const outputs: Record<string, string> = {};
    const errors: Record<string, string> = {};
    const romanizations: Record<string, string> = {};
    // Detection is synchronous CPU work (no I/O), so resolve it first and hand
    // the answer to every provider as explicit source — one detection per turn.
    const detectedSource = await this.detectSourceLanguage(text, hints);
    await Promise.all(
      targets.map(async (to) => {
        try {
          outputs[to] = await this.translateLongText(text, to, modelHint, detectedSource);
          // Guide runs on the settled translation and never blocks it: a null
          // guide simply leaves the language out of the map below.
          const guide = await this.romanize(outputs[to], to);
          if (guide) romanizations[to] = guide;
        } catch (error) {
          errors[to] =
            error instanceof Error ? error.message : 'Translation failed for this language';
        }
      }),
    );

    if (!Object.keys(outputs).length) {
      throw new ServiceUnavailableException(
        'Translation unavailable right now. Please wait a moment and retry.',
      );
    }

    return { outputs, errors, romanizations, detectedSource };
  }

  /**
   * translateText — One segment into one language using LibreTranslate only.
   * No fallback chains. If LibreTranslate fails, we surface the error clearly.
   * For unsupported languages (zh-TW, hi, etc.), we return a clear error.
   */
  private async translateText(
    text: string,
    to: string,
    sourceHint: string,
    detectedSource: string | null = null,
  ): Promise<string> {
    // Check if target language is supported by LibreTranslate
    const supportedCodes = ['en', 'vi', 'fr', 'de', 'id', 'ja', 'ko', 'ms', 'es', 'th', 'zh', 'zh-Hans'];
    const libreCode = this.libreCode(to);
    if (!supportedCodes.includes(libreCode)) {
      throw new ServiceUnavailableException(
        `Language "${to}" is not supported by LibreTranslate. Supported: ${supportedCodes.join(', ')}. Use a supported target or add the model to your LibreTranslate container.`,
      );
    }

    return this.libreTranslate(text, to, sourceHint, detectedSource);
  }

  /**
   * libreTranslate — Self-hosted LibreTranslate (Argos models, CPU-friendly).
   *
   * No key, no quota, works offline once models are downloaded. Anything the
   * local instance can't do (unknown code, model missing) throws so the chain
   * moves on to the next provider instead of failing the turn.
   */
  private libreBase(): string {
    return (process.env.LIBRETRANSLATE_URL || 'http://localhost:5000').replace(/\/+$/, '');
  }

  /** Our UI codes → LibreTranslate codes (it only knows bare codes like zh). */
  private libreCode(code: string): string {
    // LibreTranslate only has zh-Hans (Simplified). zh-Hant/zh-TW not supported.
    // Map zh-TW to zh-Hans so it works fast instead of failing through the chain.
    if (code === 'zh-TW') return 'zh-Hans';
    const base = code.split('-')[0].toLowerCase();
    const map: Record<string, string> = {
      'zh': 'zh-Hans',
      fil: 'tl',
      'en': 'en',
    };
    return map[base] ?? base;
  }

  /**
   * detectSourceLanguage — What language is this segment actually in?
   *
   * LibreTranslate's own detector is unreliable (Spanish reads as English with
   * 0 confidence, short texts are coin flips) — and a wrong guess there also
   * mistranslates, so detection runs here, once, and its answer drives both
   * the badge and the translation source language. Layers, cheapest first:
   *   1. Script routing (Han/Kana/Hangul/Devanagari/Thai are near-certain).
   *   2. Spanish/Portuguese marker words (franc confuses the two).
   *   3. franc trigrams, restricted to languages our UI supports.
   * Anything else returns null: no badge, translator auto-detects as before.
   */
  async detectSourceLanguage(text: string, hints: string[]): Promise<string | null> {
    // 'auto' is a UI-only sentinel, not a language — only a real code counts.
    const confident = (hints ?? []).filter((h) => h && h.toLowerCase() !== 'auto');
    if (confident.length === 1) return this.normaliseDetected(confident[0]);

    const sample = text.slice(0, 500);
    if (!sample.trim()) return null;

    const scriptHit = this.detectByScript(sample);
    if (scriptHit) return scriptHit;

    const markerHit = this.detectByMarkers(sample);
    if (markerHit) return markerHit;

    try {
      const ranked = francAll(sample, { minLength: 3 });
      const useable = ranked.find(
        ([code, score], index) => (index === 0 || score >= 0.7) && FRANC_MAP[code],
      );
      return useable ? FRANC_MAP[useable[0]] : null;
    } catch {
      return null;
    }
  }

  /** Script → language for scripts our UI supports (one script, one answer). */
  private detectByScript(sample: string): string | null {
    if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
    if (/[\u3040-\u30FF]/.test(sample)) return 'ja';
    if (/[\u0E00-\u0E7F]/.test(sample)) return 'th';
    if (/[\u0900-\u097F]/.test(sample)) return 'hi';
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(sample)) {
      // Simplified vs Traditional share code points — count the markers that
      // only exist on one side. Ties and no-markers mean Simplified.
      const trad = (sample.match(/[們麼來國學會這產們們們點們對們們]/g) || []).length;
      const simp = (sample.match(/[们么来国学会这产点对]/g) || []).length;
      return trad > simp ? 'zh-TW' : 'zh-CN';
    }
    return null;
  }

  /** Spanish vs Portuguese, which franc systematically confuses. */
  private detectByMarkers(sample: string): string | null {
    if (!/[a-zà-ÿ]/i.test(sample)) return null;
    const es = (sample.match(/\b(hola|gracias|estoy|soy|eres|gusta|acuesto|quiero|puedes|tengo|tiene|dónde|qué|cómo|mañana|hasta|está|están)\b/gi) || []).length;
    const pt = (sample.match(/\b(obrigado|obrigada|você|estou|sou|não|muito|também|hoje|olá|manhã|até)\b/gi) || []).length;
    if (es === 0 && pt === 0) return null;
    if (es > pt) return 'es';
    if (pt > es) return null; // Portuguese is real — but our UI has no such target.
    return null;
  }

  /** Detection codes → the codes our UI knows how to label. */
  private normaliseDetected(code: string): string {
    const base = code.split('-')[0].toLowerCase();
    if (base === 'zh') return code.toLowerCase().includes('hant') ? 'zh-TW' : 'zh-CN';
    if (base === 'tl') return 'fil';
    return base;
  }

  private async libreTranslate(
    text: string,
    to: string,
    sourceHint: string,
    detectedSource: string | null = null,
  ): Promise<string> {
    const singleHint = /the source language is ([\w-]+)/i.exec(sourceHint)?.[1];
    // Our own detection first (reliable), the explicit hint next, auto last —
    // LibreTranslate's built-in detector mistranslates on a wrong guess.
    const source = singleHint || detectedSource;
    const res = await fetch(`${this.libreBase()}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: source ? this.libreCode(source) : 'auto',
        target: this.libreCode(to),
        format: 'text',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ServiceUnavailableException(
        `LibreTranslate unavailable (${res.status}). Is the container up? ${body.slice(0, 120)}`,
      );
    }
    const json = (await res.json()) as { translatedText?: string; error?: string };
    if (json.error) throw new ServiceUnavailableException(`LibreTranslate error: ${json.error}`);
    const out = json.translatedText?.trim();
    if (!out) throw new ServiceUnavailableException('Empty translation response');
    this.assertSaneTranslation(out, text.length);
    return out;
  }

  /**
   * freeGoogleTranslate — The unofficial free Google endpoint (no key, no quota).
   * Same backend the saved-translations feature already uses. Quality is real
   * Google Translate; the only cost is one request per target language.
   */
  private async freeGoogleTranslate(
    text: string,
    to: string,
    detectedSource: string | null = null,
  ): Promise<string> {
    const result = await translate(text, { from: detectedSource ?? 'auto', to });
    const out = result.text?.trim();
    if (!out) throw new ServiceUnavailableException('Empty translation response');
    return out;
  }

  /** Local Ollama model — free forever, no quota, works offline. */
  private ollamaBase(): string {
    return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
  }

  private ollamaModel(): string {
    return process.env.OLLAMA_MODEL || 'qwen3:4b';
  }

  private async ollamaGenerate(prompt: string): Promise<string> {
    // The local model is the last resort: cap it so a stuck model fails the
    // turn in seconds instead of hanging it for minutes behind a token queue.
    const res = await fetch(`${this.ollamaBase()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: this.ollamaModel(),
        prompt,
        stream: false,
        think: false,
        options: { temperature: 0.2 },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ServiceUnavailableException(
        `Local translation model unavailable (${res.status}). Is Ollama running with "${this.ollamaModel()}" pulled? ${body.slice(0, 120)}`,
      );
    }
    const json = (await res.json()) as { response?: string; error?: string };
    if (json.error) throw new ServiceUnavailableException(`Local model error: ${json.error}`);
    return (json.response ?? '').trim();
  }

  private async ollamaTranslate(
    text: string,
    to: string,
    sourceHint: string,
    detectedSource: string | null = null,
  ): Promise<string> {
    const hint = detectedSource ? `The source language is ${detectedSource}.` : sourceHint;
    const raw = await this.ollamaGenerate(this.buildSinglePrompt(text, to, hint));
    const out = this.extractJsonText(raw);
    this.assertSaneTranslation(out, text.length);
    return out;
  }

  /** The single-target prompt every LLM provider shares. */
  private buildSinglePrompt(text: string, to: string, sourceHint: string): string {
    return (
      `Translate the text inside <source> into ${to}. ${sourceHint} ` +
      'Preserve meaning, tone and any **bold** emphasis markers. ' +
      '<source>\n' +
      text +
      '\n</source>\n' +
      'Return ONLY compact JSON, no fences, no commentary: {"text":"<translation>"}'
    );
  }

  /** Split an oversized turn into translatable pieces (each ≤ maxLen). */
  private splitTurn(text: string, maxLen = 80): string[] {
    const t = text.trim();
    if (t.length <= maxLen) return [t];
    const pieces: string[] = [];
    const push = (s: string) => {
      const v = s.trim();
      if (v) pieces.push(v);
    };
    let cur = '';
    for (const part of t.split(/(?<=[.?!…。？！\n])\s+/)) {
      if (!part.trim()) continue;
      if ((cur + ' ' + part).trim().length <= maxLen) {
        cur = (cur + ' ' + part).trim();
        continue;
      }
      push(cur);
      cur = '';
      if (part.trim().length <= maxLen) {
        cur = part.trim();
        continue;
      }
      // No usable boundary (e.g. spaceless CJK run): chop hard.
      for (const word of part.trim().split(/\s+/)) {
        if (word.length > maxLen) {
          push(cur);
          cur = '';
          for (let i = 0; i < word.length; i += maxLen) push(word.slice(i, i + maxLen));
          continue;
        }
        if ((cur + ' ' + word).trim().length <= maxLen) cur = (cur + ' ' + word).trim();
        else {
          push(cur);
          cur = word;
        }
      }
    }
    push(cur);
    return pieces.length ? pieces : [t];
  }

  /**
   * translateLongText — One turn into one language, chunked when oversized.
   * Small models collapse past ~80 source chars (slow + truncated +
   * cross-language contamination), so long turns go piece by piece in parallel
   * and rejoin. A failed piece retries via free Google; total failure throws.
   */
  private async translateLongText(
    text: string,
    to: string,
    sourceHint: string,
    detectedSource: string | null,
  ): Promise<string> {
    const pieces = this.splitTurn(text);
    if (pieces.length === 1) return this.translateText(pieces[0], to, sourceHint, detectedSource);
    const done = await Promise.all(
      pieces.map(async (piece) => {
        try {
          return await this.translateText(piece, to, sourceHint, detectedSource);
        } catch {
          try {
            return await this.freeGoogleTranslate(piece, to, detectedSource);
          } catch {
            return '';
          }
        }
      }),
    );
    const joined = done.map((s) => s.trim()).filter(Boolean).join(' ');
    if (!joined) {
      throw new ServiceUnavailableException(
        'Translation service error. Please try again in a moment.',
      );
    }
    return joined;
  }

  /**
   * assertSaneTranslation — Reject degenerate model output so the chain moves
   * on instead of publishing it. Small models loop (相相相… hundreds of times)
   * or balloon on noisy input; both are trivially detectable: one character
   * repeated 10+ times, or output far longer than its source ever justifies.
   */
  private assertSaneTranslation(out: string, srcLen: number): void {
    // Single character repeated 10+ times
    if (/(.)\1{9,}/u.test(out)) {
      throw new ServiceUnavailableException('Degenerate translation output (repetition loop)');
    }
    // Repeated 2-4 char sequences (e.g., "相好相好相好...")
    if (/(.{2,4})\1{4,}/u.test(out)) {
      throw new ServiceUnavailableException('Degenerate translation output (sequence repetition loop)');
    }
    if (out.length > 150 && out.length > srcLen * 2.5) {
      throw new ServiceUnavailableException('Degenerate translation output (length blowup)');
    }
  }

  /** Read {"text":"..."} defensively; raw reply beats losing the turn. */
  private extractJsonText(raw: string): string {    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as { text?: string };
      if (!parsed.text) throw new Error('empty translation');
      return parsed.text;
    } catch {
      if (!raw) throw new ServiceUnavailableException('Empty translation response');
      return raw;
    }
  }

  /**
   * geminiTranslate — One translation call with a strict JSON contract so the
   * caller never has to parse prose. Falls back to the raw reply when the model
   * ignores the contract, which is better than losing the turn entirely.
   */
  private async geminiTranslate(
    text: string,
    to: string,
    sourceHint: string,
    model: string,
  ): Promise<string> {
    const raw = await this.geminiGenerate(this.buildSinglePrompt(text, to, sourceHint), model);
    return this.extractJsonText(raw);
  }

  /**
   * translateMany — One Gemini call that translates a segment into every target.
   *
   * Deliberately a single request for all languages: latency stays flat as the
   * user adds outputs, and the segment is billed once instead of once per language.
   * The model is asked for a JSON object keyed by the target codes it was given.
   */
  async translateMany(input: {
    text: string;
    fromHint?: string[];
    to: string[];
  }): Promise<{
    outputs: Record<string, string>;
    errors: Record<string, string>;
    romanizations: Record<string, string>;
    detectedSource: string | null;
  }> {
    const provider = (process.env.TRANSLATE_PROVIDER || 'auto').toLowerCase();

    const text = input.text?.trim();
    if (!text) throw new BadRequestException('Text to translate is required');

    const targets = [...new Set((input.to ?? []).filter(Boolean))];
    if (!targets.length) throw new BadRequestException('At least one output language is required');

    const hints = (input.fromHint ?? []).filter(Boolean);
    // One hint = confident source. Several (or none) means the conversation mixes
    // languages, so the model detects per segment instead of being forced.
    const sourceNote =
      hints.length === 1
        ? `The source language is ${hints[0]}.`
        : 'Detect the source language yourself — the speaker may switch languages between segments.';

    // Fast path: one Gemini call for every target, only when Gemini is pinned.
    // Every other provider fans out to one chained call per language below.
    if (provider === 'gemini') {
      {
        this.assertGeminiReady();
        const model = process.env.GEMINI_TRANSLATE_MODEL || GEMINI_TEXT_MODELS[0];
        const prompt =
          `Translate the text inside <source> into each of these languages: ${targets.join(', ')}. ${sourceNote} ` +
          'Preserve meaning, tone and any **bold** emphasis markers. ' +
          '<source>\n' +
          text +
          '\n</source>\n' +
          `Return ONLY compact JSON with exactly these keys and no commentary: ${JSON.stringify(
            Object.fromEntries(targets.map((t) => [t, '<translation>'])),
          )}`;

        const raw = await this.geminiGenerate(prompt, model);

        const parsed = this.parseLanguageMap(raw, targets);
        if (!Object.keys(parsed.outputs).length) {
          throw new ServiceUnavailableException(
            'Translation service error. Please try again in a moment.',
          );
        }
        const detectedSource = await this.detectSourceLanguage(text, hints);
        // Guides are built here too, otherwise the single-call Gemini fast path
        // would be the one configuration with no pronunciation output.
        const romanizations: Record<string, string> = {};
        await Promise.all(
          Object.keys(parsed.outputs).map(async (to) => {
            const guide = await this.romanize(parsed.outputs[to], to);
            if (guide) romanizations[to] = guide;
          }),
        );
        return { ...parsed, romanizations, detectedSource };
      }
    }

    const outputs: Record<string, string> = {};
    const errors: Record<string, string> = {};
    const romanizations: Record<string, string> = {};
    // Detection is synchronous CPU work (no I/O), so resolve it first and hand
    // the answer to every provider as explicit source — one detection per turn.
    const detectedSource = await this.detectSourceLanguage(text, hints);
    await Promise.all(
      targets.map(async (to) => {
        try {
          outputs[to] = await this.translateLongText(text, to, sourceNote, detectedSource);
          // Guide runs on the settled translation and never blocks it: a null
          // guide simply leaves the language out of the map below.
          const guide = await this.romanize(outputs[to], to);
          if (guide) romanizations[to] = guide;
        } catch (error) {
          errors[to] =
            error instanceof Error ? error.message : 'Translation failed for this language';
        }
      }),
    );
    if (!Object.keys(outputs).length) {
      throw new ServiceUnavailableException(
        'Translation unavailable right now. Please wait a moment and retry.',
      );
    }
    return { outputs, errors, romanizations, detectedSource };
  }

  /**
   * parseLanguageMap — Read the model's JSON object defensively.
   *
   * A model that ignores the contract, returns a bare string, or omits one of the
   * requested keys must not cost the user the whole segment, so anything missing
   * is reported per language instead of throwing.
   */
  private parseLanguageMap(
    raw: string,
    targets: string[],
  ): { outputs: Record<string, string>; errors: Record<string, string> } {
    const outputs: Record<string, string> = {};
    const errors: Record<string, string> = {};

    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();

    let parsed: Record<string, unknown> | null = null;
    try {
      const value = JSON.parse(cleaned) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }

    if (parsed) {
      for (const to of targets) {
        // Models sometimes echo "Chinese (Simplified)" or "zh-CN" instead of "zh-CN".
        const match =
          parsed[to] ??
          Object.entries(parsed).find(
            ([k, v]) =>
              typeof v === 'string' &&
              v.trim() &&
              k.toLowerCase().replace(/[^a-z]/g, '') ===
                to.toLowerCase().replace(/[^a-z]/g, ''),
          )?.[1];

        if (typeof match === 'string' && match.trim()) outputs[to] = match.trim();
        else errors[to] = 'No translation returned for this language';
      }
      return { outputs, errors };
    }

    // Not JSON at all — one target means the whole reply is that translation.
    if (targets.length === 1 && raw) {
      outputs[targets[0]] = raw.trim();
      return { outputs, errors };
    }

    for (const to of targets) errors[to] = 'Translation was not readable — try again';
    return { outputs, errors };
  }

  /**
   * stt — Speech-to-text for the realtime mic.
   *
   * Gemini keys first (free), Whisper as an optional fallback when the user
   * also configures OPENAI_API_KEY. Returns '' for silence so the caller can
   * keep listening instead of showing an empty turn.
   */
  async stt(audio: Buffer, mimeType: string, langHint?: string): Promise<{ text: string; engine: string }> {
    if (!audio?.length) throw new BadRequestException('Audio is required');
    if (audio.length > 8 * 1024 * 1024) throw new BadRequestException('Audio clip is too large');

    const lang = langHint ? ` The spoken language is ${langHint}.` : ' Detect the spoken language.';

    if (this.geminiTranslateKey()) {
      const model = process.env.GEMINI_STT_MODEL || GEMINI_TEXT_MODELS[0];
      const body = {
        contents: [
          {
            parts: [
              { text: `Transcribe this audio verbatim.${lang} Return only the spoken words — no language labels, no commentary.` },
              { inline_data: { mime_type: mimeType || 'audio/webm', data: audio.toString('base64') } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      };
      const key = encodeURIComponent(this.geminiTranslateKey());
      const candidates = [model, ...GEMINI_TEXT_MODELS.filter((m) => m !== model)];

      let lastStatus = 0;
      for (const candidate of candidates) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        );

        if (res.ok) {
          const json = (await res.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
          };
          const text = (json?.candidates?.[0]?.content?.parts ?? [])
            .filter((p) => !p.thought)
            .map((p) => p.text ?? '')
            .join('')
            .trim();
          return { text, engine: `gemini (${candidate})` };
        }

        lastStatus = res.status;
        // Quota and capacity are per model, so a 429/503 on one is no reason to
        // stop before trying the rest. Anything else is a real failure.
        if (res.status !== 404 && res.status !== 429 && res.status !== 503) {
          throw new ServiceUnavailableException(`Speech recognition failed (${res.status})`);
        }
      }

      throw new ServiceUnavailableException(
        lastStatus === 429
          ? 'Speech recognition is rate-limited on every model right now. Please wait a moment and retry.'
          : `Speech recognition failed on every Gemini model (${candidates.join(', ')})`,
      );
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new ServiceUnavailableException(
        'Speech recognition not configured. Set GEMINI_API_KEY on the backend (free at aistudio.google.com/apikey).',
      );
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType || 'audio/webm' }), 'clip.webm');
    form.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });

    if (!res.ok) throw new ServiceUnavailableException(`Speech recognition failed (${res.status})`);

    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? '').trim(), engine: 'whisper' };
  }

  /** Shared Gemini text call — single place that owns the key, model and errors. */
  private async geminiGenerate(prompt: string, model: string): Promise<string> {
    this.assertGeminiReady();

    const key = encodeURIComponent(this.geminiTranslateKey());
    const candidates = [model, ...GEMINI_TEXT_MODELS.filter((m) => m !== model)];
    let lastError = '';

    for (const candidate of candidates) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
          }),
        },
      );

      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
        };
        return (json?.candidates?.[0]?.content?.parts ?? [])
          .filter((p) => !p.thought)
          .map((p) => p.text ?? '')
          .join('')
          .trim();
      }

      const body = await res.text();
      if (res.status === 429) {
        lastError =
          'Translation AI is rate-limited on every model right now. Please wait a moment and retry.';
      } else {
        lastError = `Translation AI error ${res.status}: ${body.slice(0, 200)}`;
      }
      // 404 = model id retired, 429/503 = quota/load: all three are per model, so
      // the next candidate is worth a try instead of failing the whole segment.
      if (res.status !== 404 && res.status !== 429 && res.status !== 503) {
        throw new ServiceUnavailableException(lastError);
      }
    }

    throw new ServiceUnavailableException(
      lastError || 'Translation service error. Please try again in a moment.',
    );
  }

  // ─── Romanization ─────────────────────────────────────────────────────────

  /**
   * romanize — Pronunciation guide for a piece of text, or null when the
   * language needs none (or the guide could not be produced).
   *
   * Never throws: romanization is an aid, never a requirement, so a failure
   * here must degrade to "no guide shown" instead of losing the translation.
   */
  async romanize(text: string, lang: string): Promise<string | null> {
    const value = (text ?? '').trim();
    if (!value || !lang) return null;

    const base = lang.split('-')[0].toLowerCase();

    // Local, deterministic scripts: no quota, no key, no network.
    if (base === 'zh') {
      try {
        return pinyin(value, { toneType: 'symbol' }) || null;
      } catch {
        return null;
      }
    }

    if (base === 'ja') {
      return romanizeJapanese(value);
    }

    if (base === 'ko') {
      // Hangul is algorithmic, so this only matters when there is Hangul to
      // convert — a pure-Latin string would just echo back unchanged.
      const romanized = romanizeKorean(value);
      return romanized === value ? null : romanized;
    }

    if (base === 'en') {
      // CMUdict, not a model: 135k words with exact phonemes beats any guess,
      // and it needs no key. Words it doesn't know are left alone rather than
      // invented, so the guide never teaches a wrong pronunciation.
      return romanizeEnglish(value);
    }

    const prompt = ROMANIZE_PROMPTS[base];
    if (!prompt) return null;

    try {
      const out = await this.geminiGenerate(`${prompt}\n\nText: ${value}`, GEMINI_TEXT_MODELS[0]);
      return out || null;
    } catch {
      // No key, rate-limited, or every model failing — the translation is
      // still worth showing, so drop the guide rather than the whole turn.
      return null;
    }
  }
}