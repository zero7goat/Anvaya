/**
 * PRODUCT PHOTO UPLOADS (Supabase Storage)
 *
 * The admin picks JPEG, PNG or WebP photos from any device; the browser shrinks each to at
 * most 1600px on its longest side and saves it as WebP (aiming for about 500 KB, never over
 * 5 MB), then uploads it to the public "product-images" bucket. Photo addresses are saved
 * with the product (image, then additional_images).
 *
 * A photo removed from a product is deleted from the bucket after the product is saved, and
 * deleting a product deletes its photos. Only files in this bucket are ever deleted.
 *
 * The bucket and its access rules are created separately (supabase/drafts/
 * product_images_storage.sql, product_images_delete.sql). Until they exist, an upload or
 * delete fails with a clear message and the image address can still be typed in by hand.
 */

export const IMAGE_BUCKET = "product-images";
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_DIMENSION = 1600; // px, longest side
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // what is uploaded (the bucket's limit)
export const TARGET_UPLOAD_BYTES = 500 * 1024; // lower quality is tried until a photo is this small
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024; // what can be picked before shrinking
const UPLOAD_TIMEOUT_MS = 60000;

export type UploadResult = { ok: true; url: string; error?: undefined } | { ok: false; error: string; url?: undefined };

const failed = (error: string): UploadResult => ({ ok: false, error });

/** A problem with the picked file, or null when it can be used */
export const checkImageFile = (file: { type: string; size: number }): string | null => {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "Choose a JPEG, PNG or WebP photo.";
  if (file.size > MAX_SOURCE_BYTES) return "This photo is over 30 MB. Choose a smaller one.";
  if (file.size === 0) return "This file is empty.";
  return null;
};

/** Width and height scaled down (never up) so the longest side is at most `max` */
export const fitWithin = (width: number, height: number, max = MAX_IMAGE_DIMENSION) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
};

/** Where a product photo is stored: products/<id>/<time>-<random>.webp (a new name every time) */
export const productImagePath = (productId: string, now = Date.now(), random = Math.random().toString(36).slice(2, 10)) => {
  const id = productId.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 60) || "product";
  return `products/${id}/${now}-${random}.webp`;
};

/** Turns a Storage error reply into a message for the dashboard */
export const describeUploadError = (status: number, message: string): string => {
  const text = message.toLowerCase();
  if (text.includes("bucket not found")) {
    return "Photo uploads aren't set up yet (the product-images storage bucket doesn't exist). Paste an image address instead for now.";
  }
  // Storage labels an access-rule refusal "Unauthorized", so check the rules first
  if (status === 403 || text.includes("row-level security") || text.includes("permission")) {
    return "This account isn't allowed to upload photos (the storage access rules may not be set up yet).";
  }
  if (status === 401 || text.includes("jwt")) return "Your admin session has expired. Sign in again, then retry.";
  if (status === 413 || text.includes("maximum allowed size") || text.includes("too large")) return "The photo is still too large to upload.";
  if (text.includes("mime") || text.includes("invalid_mime_type")) return "The storage bucket doesn't accept this kind of file.";
  return "The photo couldn't be uploaded. Please try again.";
};

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));

/** Shrinks and converts the photo to WebP in the browser */
export async function compressImage(file: File): Promise<{ ok: true; blob: Blob; error?: undefined } | { ok: false; error: string; blob?: undefined }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, error: "This photo couldn't be read. Try saving it again as JPEG or PNG." };
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { ok: false, error: "This browser can't prepare photos. Paste an image address instead." };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blobs: Blob[] = [];
  for (const quality of [0.85, 0.78, 0.7, 0.6]) {
    const blob = await toBlob(canvas, quality);
    // Browsers without a WebP encoder silently return PNG instead
    if (!blob || blob.type !== "image/webp") {
      return { ok: false, error: "This browser can't save WebP photos. Use a recent Chrome, Edge, Firefox or Safari." };
    }
    blobs.push(blob);
    if (blob.size <= TARGET_UPLOAD_BYTES) break;
  }
  const blob = pickCompressed(blobs);
  return blob ? { ok: true, blob } : { ok: false, error: "This photo is still over 5 MB after shrinking. Choose a simpler or smaller photo." };
}

/**
 * Of the versions tried (best quality first), the first one at or under the target size;
 * otherwise the smallest that fits the bucket's limit, or null when none does
 */
export const pickCompressed = <T extends { size: number }>(versions: T[]): T | null => {
  const onTarget = versions.find((v) => v.size <= TARGET_UPLOAD_BYTES);
  if (onTarget) return onTarget;
  const fitting = versions.filter((v) => v.size <= MAX_UPLOAD_BYTES).sort((a, b) => a.size - b.size);
  return fitting[0] ?? null;
};

/**
 * The file path inside the bucket for a photo address uploaded here
 * (…/storage/v1/object/public/product-images/products/<id>/<name>.webp), or null for
 * anything else: other sites, site files, other buckets or odd paths are never deleted.
 */
export const storedImagePath = (url: string, base = import.meta.env?.VITE_SUPABASE_URL as string | undefined): string | null => {
  if (!base || !url) return null;
  const prefix = `${base.replace(/\/+$/, "")}/storage/v1/object/public/${IMAGE_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length).split(/[?#]/)[0];
  return /^products\/[a-z0-9_-]+\/[A-Za-z0-9_-]+\.webp$/.test(path) ? path : null;
};

/**
 * Photos to delete from the bucket after a save: those the product had or that were uploaded
 * in this form, and that the saved product no longer uses
 */
export const photosToDelete = (before: string[], uploaded: string[], kept: string[], base?: string): string[] => {
  const keep = new Set(kept);
  const paths = [...before, ...uploaded].filter((url) => !keep.has(url)).map((url) => storedImagePath(url, base));
  return Array.from(new Set(paths.filter((p): p is string => p !== null)));
};

export type DeleteResult = { ok: true; error?: undefined } | { ok: false; error: string };

/** Turns a refused or partial delete into a message for the dashboard */
export const describeDeleteProblem = (requested: number, deleted: number, errorText?: string): string | null => {
  const text = (errorText ?? "").toLowerCase();
  if (text.includes("jwt") || text.includes("expired")) return "Your admin session has expired, so old photos weren't deleted from storage. Sign in again.";
  if (errorText) return "Old photos couldn't be deleted from storage. Please try again later.";
  if (deleted < requested) {
    // Storage answers a delete its access rules don't allow with an empty list, not an error
    return `${requested - deleted} old photo${requested - deleted === 1 ? "" : "s"} couldn't be deleted from storage (the delete access rule may not be set up yet: product_images_delete.sql).`;
  }
  return null;
};

/** Deletes photos (bucket paths from storedImagePath) as the signed-in admin */
export async function deleteProductImages(paths: string[]): Promise<DeleteResult> {
  if (paths.length === 0) return { ok: true };
  try {
    const { supabase } = await import("../utils/supabase");
    const { data, error } = await supabase.storage.from(IMAGE_BUCKET).remove(paths);
    const problem = describeDeleteProblem(paths.length, data?.length ?? 0, error?.message);
    return problem ? { ok: false, error: problem } : { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the database, so old photos weren't deleted from storage." };
  }
}

/**
 * Uploads a prepared photo as the signed-in admin and returns its public address.
 * `onProgress` gets 0..1 as the upload goes.
 */
export async function uploadProductImage(productId: string, blob: Blob, onProgress: (fraction: number) => void): Promise<UploadResult> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!base || !key) return failed("Photo uploads need the database connection, which isn't set up for this site.");

  let token: string | undefined;
  try {
    const { supabase } = await import("../utils/supabase");
    token = (await supabase.auth.getSession()).data.session?.access_token;
  } catch {
    return failed("Couldn't reach the database. Check your connection and try again.");
  }
  if (!token) return failed("Your admin session has expired. Sign in again, then retry.");

  const path = productImagePath(productId);
  const endpoint = `${base.replace(/\/+$/, "")}/storage/v1/object/${IMAGE_BUCKET}/${path}`;

  return new Promise<UploadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("Content-Type", "image/webp");
    xhr.setRequestHeader("x-upsert", "false"); // never overwrite an existing photo
    xhr.setRequestHeader("cache-control", "max-age=31536000"); // names are unique, so cache for a year
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve({ ok: true, url: `${base.replace(/\/+$/, "")}/storage/v1/object/public/${IMAGE_BUCKET}/${path}` });
        return;
      }
      let message = xhr.responseText;
      try {
        const body = JSON.parse(xhr.responseText);
        message = `${body.error ?? ""} ${body.message ?? ""}`;
      } catch {
        // plain-text reply
      }
      resolve(failed(describeUploadError(xhr.status, message)));
    };
    xhr.onerror = () => resolve(failed("Couldn't reach the database, so the photo wasn't uploaded. Check your connection and try again."));
    xhr.ontimeout = () => resolve(failed("The upload took too long. Check your connection and try again."));
    xhr.send(blob);
  });
}
