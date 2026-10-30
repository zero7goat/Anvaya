/**
 * PRODUCT PHOTO UPLOADS (Supabase Storage)
 *
 * The admin picks a JPEG, PNG or WebP photo; the browser shrinks it to at most 1600px on
 * its longest side and saves it as WebP under 5 MB, then uploads it to the public
 * "product-images" bucket. The photo's public address goes into the product's image
 * field and is saved with the product as before. Replaced photos are never deleted.
 *
 * The bucket and its access rules are created separately (supabase/drafts/
 * product_images_storage.sql). Until they exist, an upload fails with a clear message
 * and the image address can still be typed in by hand.
 */

export const IMAGE_BUCKET = "product-images";
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_DIMENSION = 1600; // px, longest side
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // what is uploaded (the bucket's limit)
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
  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const blob = await toBlob(canvas, quality);
    // Browsers without a WebP encoder silently return PNG instead
    if (!blob || blob.type !== "image/webp") {
      return { ok: false, error: "This browser can't save WebP photos. Use a recent Chrome, Edge, Firefox or Safari." };
    }
    if (blob.size <= MAX_UPLOAD_BYTES) return { ok: true, blob };
  }
  return { ok: false, error: "This photo is still over 5 MB after shrinking. Choose a simpler or smaller photo." };
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
