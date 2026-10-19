-- AddSharedBoxes
--
-- Additive only: two new tables plus an index on User. Nothing existing is
-- read, rewritten or dropped, so every saved Translation and every Learning
-- Box derived from them is untouched.
--
-- A shared box is stored separately from Translation on purpose. A Learning Box
-- is normally a view over the owner's own rows; sharing one must not expose
-- that private history, so a shared box starts empty and keeps everything
-- written into it here.

-- CreateTable
CREATE TABLE "SharedBox" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "inputLang" TEXT NOT NULL,
    "outputLang" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedSentence" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "romanization" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "authorIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedSentence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedBox_token_key" ON "SharedBox"("token");

-- CreateIndex
CREATE INDEX "SharedBox_ownerId_createdAt_idx" ON "SharedBox"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "SharedSentence_boxId_createdAt_idx" ON "SharedSentence"("boxId", "createdAt");

-- AddForeignKey
ALTER TABLE "SharedBox" ADD CONSTRAINT "SharedBox_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedSentence" ADD CONSTRAINT "SharedSentence_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "SharedBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;