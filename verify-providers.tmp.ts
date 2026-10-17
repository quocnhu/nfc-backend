import { TranslationService } from '@/translation/translation.service';

const svc = new TranslationService({} as never);
const text = 'and then the car goes into Escape mode with no speed limit';

async function main() {
  for (const provider of ['google', 'ollama'] as const) {
    process.env.TRANSLATE_PROVIDER = provider;
    const start = Date.now();
    try {
      const r = await svc.translateMany({ text, to: ['vi'] });
      console.log(`[${provider}] ${(Date.now() - start) / 1000}s ->`, JSON.stringify(r.outputs));
    } catch (e) {
      console.log(`[${provider}] FAILED:`, (e as Error).message);
    }
  }

  // auto chain with Gemini throttled (3.8-flash quota is out right now)
  process.env.TRANSLATE_PROVIDER = 'auto';
  const start = Date.now();
  const r = await svc.translateMany({ text, to: ['vi', 'fr'] });
  console.log(`[auto] ${(Date.now() - start) / 1000}s ->`, JSON.stringify(r.outputs));
}

main().catch((e) => {
  console.error('FAILED:', (e as Error)?.message || e);
  process.exit(1);
});