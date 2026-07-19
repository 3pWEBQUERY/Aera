// Keep static image imports type-safe in clean checkouts. Next.js normally
// writes this reference to the ignored next-env.d.ts file, which is not
// guaranteed to exist before the standalone CI type-check runs.
/// <reference types="next/image-types/global" />
