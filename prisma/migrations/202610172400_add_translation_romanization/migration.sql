-- AddTranslationRomanization
--
-- Additive only: adds one nullable TEXT column. No existing row is read,
-- rewritten or dropped, so all existing translations are preserved as-is
-- (their romanization reads back NULL until they are re-processed).
ALTER TABLE "Translation" ADD COLUMN "romanization" TEXT;