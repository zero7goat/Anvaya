/**
 * Responsive image URLs built on each image host's own resizing, so small cards
 * download small files. No third-party optimisation service is involved.
 *
 * Supported (verified):
 *  - Salesforce Commerce "dw/image/v2" URLs (rangriti.com, biba.in): ?sw=<width>&sh=<height>&q=<quality>.
 *    Plain "/on/demandware.static/" library files on those hosts are served through the
 *    same image service, which returns the identical artwork at the requested width.
 *  - Shopify store-domain "/cdn/shop/" URLs: ?width=<width>.
 *  - cdn.shopify.com "/s/files/" uploads without a size suffix (e.g. the mobile hero
 *    banners): ?width=<width>. Files already named at a fixed size ("_800x800.jpg",
 *    the saree photos) ignore width requests, so they are left alone.
 * Anything else (local files) is returned unchanged with no srcset.
 */

const DW_HOSTS = ["www.rangriti.com", "www.biba.in", "images.biba.in"];
const DW_QUALITY = 80;

type Resizer = (width: number) => string;

function getResizer(url: string): Resizer | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null; // relative / local path
  }

  if (DW_HOSTS.includes(parsed.hostname) && parsed.pathname.includes("/on/demandware.static/")) {
    const path = parsed.pathname.startsWith("/dw/image/v2/")
      ? parsed.pathname
      : `/dw/image/v2/BKQK_PRD${parsed.pathname}`;
    const sw = Number(parsed.searchParams.get("sw"));
    const sh = Number(parsed.searchParams.get("sh"));
    const ratio = sw && sh ? sh / sw : 0;
    return (width) => {
      const params = new URLSearchParams({ sw: String(width) });
      if (ratio) params.set("sh", String(Math.round(width * ratio)));
      params.set("q", String(DW_QUALITY));
      params.set("strip", "false");
      return `${parsed.origin}${path}?${params}`;
    };
  }

  const resizableShopifyFile =
    parsed.hostname === "cdn.shopify.com" &&
    parsed.pathname.startsWith("/s/files/") &&
    !/_\d+x\d+\.\w+$/.test(parsed.pathname);
  if (parsed.pathname.startsWith("/cdn/shop/") || resizableShopifyFile) {
    return (width) => {
      const next = new URL(parsed.toString());
      next.searchParams.set("width", String(width));
      return next.toString();
    };
  }

  return null;
}

/** A single resized URL (or the original when the host cannot resize). */
export function imageAtWidth(url: string, width: number): string {
  const resize = url ? getResizer(url) : null;
  return resize ? resize(width) : url;
}

/**
 * `src` + `srcSet` for an <img>. `src` is the middle width, used by browsers that
 * ignore srcset; `srcSet` is undefined when the host cannot resize.
 */
export function responsiveImage(url: string, widths: number[]): { src: string; srcSet?: string } {
  const resize = url ? getResizer(url) : null;
  if (!resize) return { src: url };
  return {
    src: resize(widths[Math.floor(widths.length / 2)]),
    srcSet: widths.map((w) => `${resize(w)} ${w}w`).join(", "),
  };
}

// Width sets per use
export const IMAGE_WIDTHS = {
  // Portrait product photos (source images are 900px wide)
  product: [360, 540, 720, 900],
  // Full-width hero banners
  hero: [768, 1280, 1920],
  // Portrait mobile hero banners (source images are 750px wide)
  mobileHero: [420, 600, 750],
};
