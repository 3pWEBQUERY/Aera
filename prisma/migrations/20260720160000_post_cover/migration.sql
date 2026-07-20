-- Cover image (banner) for a post: URL plus a stored focal point and zoom used
-- with object-fit: cover across composer, topic view and list cards. Additive.

ALTER TABLE "Post"
  ADD COLUMN "coverUrl" TEXT,
  ADD COLUMN "coverOffsetX" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "coverOffsetY" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "coverZoom" INTEGER NOT NULL DEFAULT 100;
