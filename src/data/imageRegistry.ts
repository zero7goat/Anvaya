import { CollectionType, Product } from "../types";

/**
 * ANVAYA IMAGE REGISTRY: the one place that decides which image a product shows.
 *
 * ADDING YOUR OWN PRODUCT PHOTOS
 * 1. Put the files in   public/images/products/
 *    e.g. public/images/products/alk-001-front.jpg
 * 2. Map the product id to its files below (first entry = main image, the rest
 *    appear as gallery thumbnails on the product page):
 *      "alk-001": ["/images/products/alk-001-front.jpg", "/images/products/alk-001-back.jpg"],
 * 3. That's it: cards, quick view, product page, cart, checkout and admin all
 *    read from here. A mapped product ignores the image URL stored on its record.
 *
 * Products with no image (or whose image fails to load) show a deliberate
 * "Image coming soon" placeholder instead of a broken image.
 */
export const LOCAL_PRODUCT_IMAGES: Record<string, string[]> = {
  // "alk-001": ["/images/products/alk-001-front.jpg"],
};

export interface HeroSlide {
  id: string;
  kind: "banner" | "panel";
  // CSS object-position for the crop
  position: string;
  image: string;
  alt: string;
}

/**
 * Non-product imagery (homepage banners, collection covers). Empty string = no
 * image yet; those spots show their designed fallback instead.
 */
export const SITE_IMAGES = {
  // Hero slides, in display order. "banner" = landscape artwork with its own printed text,
  // shown full width; "panel" = portrait photo, shown side by side with any other panels
  heroSlides: [
    // All five are about 2:1 campaign banners with their own printed headline and button
    {
      id: "hero-1",
      kind: "banner",
      position: "center",
      image: "https://www.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Library-Sites-BibaSharedLibrary/en_IN/dwb5fc97d2/A-A-AW26/web.jpg",
      alt: "This Karwa Chauth, redefine royalty: festive red kurta sets",
    },
    {
      id: "hero-2",
      kind: "banner",
      position: "center",
      image: "https://www.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Library-Sites-BibaSharedLibrary/en_IN/dw53877d07/A-A-AW26/diwali-web.jpg",
      alt: "This Diwali, celebrate festivity in style",
    },
    {
      id: "hero-3",
      kind: "banner",
      position: "center",
      image: "https://www.rangriti.com/on/demandware.static/-/Library-Sites-RangritiSharedLibrary/en_IN/dw13703199/A-A-AW26/casual-web.jpg",
      alt: "New looks for easy days: printed kurta sets",
    },
    {
      id: "hero-4",
      kind: "banner",
      position: "center",
      image: "https://www.rangriti.com/on/demandware.static/-/Library-Sites-RangritiSharedLibrary/en_IN/dw3e2de32b/A-A-AW26/karwa-web.jpg",
      alt: "This Karwa Chauth: the new festive collection",
    },
    {
      id: "hero-5",
      kind: "banner",
      // Wider than 2:1; anchored left so the headline stays in frame and clear of the arrow
      position: "left center",
      image: "https://shopforaurelia.com/cdn/shop/files/Aurelia-Diwali-Ready-Slider-Desktop.jpg?v=1793096257&width=2136",
      alt: "Diwali ready: festive fits for every dinner, ritual and gathering",
    },
  ] as HeroSlide[],
  // Phone-width hero (portrait 3:4 banners with their own printed text), in display order.
  // Shown instead of heroSlides below tablet width.
  mobileHeroSlides: [
    {
      id: "m-hero-1",
      kind: "banner",
      position: "center",
      image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/Hero_Banner_-_01_1.jpg?v=1792479111&width=1080",
      alt: "Diwali waali deal: festive kurta sets and sarees",
    },
    {
      id: "m-hero-2",
      kind: "banner",
      position: "center",
      image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/the_new_festive_edit_3.jpg?v=1792048357&width=1080",
      alt: "The new festive edit",
    },
    {
      id: "m-hero-3",
      kind: "banner",
      position: "center",
      image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/APP_exclusive_1.jpg?v=1781256270&width=1080",
      alt: "Exclusive festive offer",
    },
    {
      id: "m-hero-4",
      kind: "banner",
      position: "center",
      image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/the_festive_fav.jpg?v=1792048357&width=1080",
      alt: "The festive favourites",
    },
  ] as HeroSlide[],
  // Arched "Our Collections" cards and collection metadata
  collectionCovers: {
    alankritha: "https://www.lakshita.com/cdn/shop/files/Artboard_6.jpg_1.jpg?v=1785838580&width=700",
    // Royal Mayura Banarasi saree (alk-005) photo
    ayanaa: "https://cdn.shopify.com/s/files/1/0049/3649/9315/products/koskii-maroon-zariwork-banarasi-designer-saree-saus0018941_maroon_6_800x800.jpg?v=1748424817&width=480",
  },
  // Homepage collection spotlights: large campaign images (portrait, about 4:5).
  // Empty = each collection uses one of its own catalogue photos (see CollectionSpotlight).
  editorial: {
    alankritha: "",
    ayanaa: "",
  } as Record<CollectionType, string>,
  // Homepage "Shop by style" card images (portrait, 3:4), by style name.
  // Empty = the first product photo in that style, else the neutral placeholder.
  styleCovers: {
    "Straight Fit": "",
    "A-Line": "",
    Anarkali: "",
    "Banarasi Silk": "",
    Organza: "",
    "Katan Silk": "",
  } as Record<string, string>,
  // Homepage "Best Prices" card backgrounds, by card id (section currently not shown)
  bestPrices: {
    "bp-1": "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dw6099e30b/images/ss26/skdasrt32196ss26grn_1.jpg?sw=650&sh=975&q=100&strip=false",
    "bp-2": "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dw5b4f815f/images/aw25/skdasrt30604aw25rust_1.jpg?sw=650&sh=975&q=100&strip=false",
    // Previous Unsplash image returned 404 (verified); awaiting an ANVAYA photo
    "bp-3": "",
  } as Record<string, string>,
};

/**
 * All images for a product, main image first, without duplicates or blanks.
 * Local files from LOCAL_PRODUCT_IMAGES take precedence over the record's URLs.
 */
export function getProductImages(product: Pick<Product, "id" | "image" | "additionalImages">): string[] {
  const local = LOCAL_PRODUCT_IMAGES[product.id];
  const sources = local && local.length > 0 ? local : [product.image, ...(product.additionalImages || [])];
  return Array.from(new Set(sources.filter((src): src is string => typeof src === "string" && src.trim() !== "")));
}

/** Main image for a product, or "" when it has none (render the placeholder). */
export function getProductImage(product: Pick<Product, "id" | "image" | "additionalImages">): string {
  return getProductImages(product)[0] || "";
}
