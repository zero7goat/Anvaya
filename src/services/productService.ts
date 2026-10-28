import { Product, CollectionType, Review } from "../types";
import { getSizeOptionsFor } from "../utils/sizes";
import { isSupabaseConfigured } from "../utils/supabaseConfig";

/**
 * SAMPLE PRODUCT CATALOGUE FOR ANVAYA
 * 
 * Exclusively two distinct collections:
 * 1. ALANKRITHA - Exclusively Women's Kurtas
 * 2. AYANAA - Exclusively Women's Handwoven & Festive Sarees
 */
export const INITIAL_SAMPLE_PRODUCTS: Product[] = [
  {
    id: "alk-001",
    name: "Turquoise Cotton Floral Printed Straight Kurta",
    description: "An exquisite straight-cut cotton kurta adorned with traditional hand-block floral motifs, subtle gold Zari detailing on the neckline yoke, and fine side-slit tailoring.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 3599,
    salePrice: 2519,
    // Supplied kurta image 10 (aqua print), closest match to Turquoise
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw45884c06/images/ss26/rrtroz26228ss26aqa_1.jpg?sw=900&sh=1350&q=100&strip=false",
    additionalImages: [],
    sizeStock: { "S": 4, "M": 6, "L": 8, "XL": 2, "XXL": 0 },
    reviews: [
      {
        id: "rev-01",
        author: "Meenakshi K.",
        rating: 5,
        comment: "The fabric is so soft and breathable for everyday celebrations. Perfectly stitched!",
        date: "2026-09-12",
        verified: true,
        brandReply: "Namaste Meenakshi! Thank you for trusting Alankritha for your ethnic wardrobe."
      }
    ],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-10-20T14:30:00Z"
  },
  {
    id: "alk-002",
    name: "Rust Printed Straight Kurta",
    description: "Sophisticated rust orange straight-line silhouette kurta with artisanal print borders, three-quarter sleeves, and intricate geometric yoke prints.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 3999,
    salePrice: 2000,
    // Supplied kurta image 8 (rust)
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dwa0a99ed8/images/ss26/ertnmoz22535ss26rus_1.jpg?sw=900&sh=1350&q=100&strip=false",
    additionalImages: [],
    sizeStock: { "S": 3, "M": 5, "L": 0, "XL": 2, "XXL": 0 }, // Size L out of stock
    reviews: [],
    isFeatured: true,
    isNewArrival: false,
    status: "enabled",
    createdAt: "2026-08-05T12:00:00Z",
    updatedAt: "2026-10-22T09:15:00Z"
  },
  {
    id: "alk-003",
    name: "Red Embroidered Art Silk Festive Kurta",
    description: "Luxurious festive art silk kurta featuring rich resham and zari brocade embroidery around the mandarin collar and cuffs, crafted for regal celebrations.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 5995,
    salePrice: 3597,
    // Supplied kurta image 6 (red embroidered)
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw96a3de73/images/aw26/fstgm25559aw26red_1.jpg?sw=900&sh=1350&q=100&strip=false",
    additionalImages: [],
    sizeStock: { "S": 2, "M": 3, "L": 4, "XL": 1, "XXL": 0 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-08-10T14:00:00Z",
    updatedAt: "2026-10-24T16:45:00Z"
  },
  {
    id: "alk-004",
    name: "Emerald Pine Cotton Chevron Printed Kurta",
    description: "A fresh combination of micro-florals and heritage chevron geometry in deep pine green. Tailored from premium 60-count combed cotton with mother-of-pearl buttons.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 2599,
    salePrice: 2079,
    // Supplied kurta image 3 (green print)
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw429fd652/images/aw26/wnt22718aw26grn_1.jpg?sw=900&sh=1350&q=100&strip=false",
    sizeStock: { "S": 5, "M": 7, "L": 4, "XL": 3, "XXL": 0 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-08-15T09:30:00Z",
    updatedAt: "2026-10-25T11:00:00Z"
  },
  {
    id: "alk-005",
    name: "Royal Mayura Banarasi Katan Silk Saree",
    description: "Handcrafted master weave in rich royal purple and gold. Woven with authentic floral konia corners, antique Kadwa brocade work, and an ornate peacock-motif pallu.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Banarasi Silk",
    price: 8999,
    salePrice: 7499,
    // Supplied saree image 4 (maroon Banarasi)
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/products/koskii-maroon-zariwork-banarasi-designer-saree-saus0018941_maroon_6_800x800.jpg?v=1748424817&width=480",
    sizeStock: { "Free Size": 8 },
    reviews: [
      {
        id: "rev-02",
        author: "Sunita Verma",
        rating: 5,
        comment: "Breathtaking sheen! Draped like a dream at my daughter's engagement.",
        date: "2026-09-18",
        verified: true,
        brandReply: "Dhanyawaad Sunita ji! We feel honoured to be a part of your family milestone."
      }
    ],
    isFeatured: true,
    isNewArrival: false,
    status: "enabled",
    createdAt: "2026-08-02T11:20:00Z",
    updatedAt: "2026-10-18T18:00:00Z"
  },
  {
    id: "alk-006",
    name: "Pastel Sage Green Hand-Painted Organza Saree",
    description: "Whisper-soft translucent organza saree hand-painted in blush floral bouquets with intricate scalloped cut-work embroidery along the entire drape.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Organza",
    price: 4899,
    salePrice: 3999,
    // Supplied saree image (onion pink tissue): closest sheer pastel drape; not sage green
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/koskii-onionpink-zariwork-tissue-designer-saree-saus0038515_onionpink_1_1_800x800.jpg?v=1767951906&width=480",
    sizeStock: { "Free Size": 4 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-08-20T15:00:00Z",
    updatedAt: "2026-10-21T10:10:00Z"
  },
  {
    id: "alk-007",
    name: "Mustard Yellow Silk Chanderi Embroidered Kurta",
    description: "Luminous turmeric mustard festive kurta crafted from genuine Chanderi silk with delicate mirror embroidery on the yoke and soft zari borders.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "A-Line",
    price: 4299,
    salePrice: 3499,
    // Supplied kurta image (rust and maroon print): closest warm tone; no mustard kurta was supplied
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw231372d9/images/aw26/fstgm26325aw26org_1.jpg?sw=900&sh=1350&q=100&strip=false",
    sizeStock: { "S": 4, "M": 6, "L": 3, "XL": 2, "XXL": 0 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-08-25T13:40:00Z",
    updatedAt: "2026-10-19T17:25:00Z"
  },
  {
    id: "alk-008",
    name: "Midnight Indigo Kanjeevaram Soft Zari Saree",
    description: "Heirloom midnight indigo drape woven with intricate floral jaal in antique molten gold zari, accompanied by an ornate contrast brocade blouse piece.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Katan Silk",
    price: 7499,
    salePrice: 5999,
    // Supplied saree image (copper zari silk): closest woven zari drape; not indigo
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/koskii-copper-zariwork-softsilk-designer-saree-saus0039230_copper_1_6_800x800.jpg?v=1748424967&width=480",
    sizeStock: { "Free Size": 5 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-09-01T08:00:00Z",
    updatedAt: "2026-10-23T14:00:00Z"
  },
  // NEW LISTINGS (added 2026-10-28) for the remaining supplied photos. Names and descriptions
  // describe what the photo shows; prices and stock are starting values to review in the admin.
  {
    id: "alk-009",
    name: "Coral Red Embroidered Flared Kurta",
    description: "Flowing coral red kurta with a flared silhouette, an embroidered yoke and a sheer matching dupatta with a delicate edge.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Anarkali",
    price: 5499,
    salePrice: 4399,
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dwa57d0d53/images/aw26/fstgm25514aw26red_1.jpg?sw=900&sh=1350&q=100&strip=false",
    sizeStock: { "S": 3, "M": 4, "L": 3, "XL": 2, "XXL": 0 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-10T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-010",
    name: "Powder Blue Printed Short Kurta",
    description: "Easy powder blue kurta with an ornamental medallion print, a V-neckline and three-quarter sleeves, cut to a shorter length for everyday wear.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "A-Line",
    price: 2299,
    salePrice: 1839,
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw88c7fe02/images/ss26/ind22529ss26blu_1.jpg?sw=900&sh=1350&q=100&strip=false",
    sizeStock: { "S": 5, "M": 6, "L": 4, "XL": 3, "XXL": 0 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-11T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-011",
    name: "Wine Printed Straight Kurta with Embroidered Yoke",
    description: "Deep wine straight kurta with an all-over buta print, a contrast embroidered yoke and a teal-toned printed hem border.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 3299,
    salePrice: 2639,
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw86f6e1d2/images/aw26/fstgm28068aw26pnk_1.jpg?sw=900&sh=1350&q=100&strip=false",
    sizeStock: { "S": 4, "M": 5, "L": 4, "XL": 2, "XXL": 0 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-12T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-012",
    name: "Crimson Striped Kurta with Dupatta",
    description: "Festive crimson kurta in tonal stripes with sparkle embroidery on the V-neck yoke, paired with a sheer flowing dupatta.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 4699,
    salePrice: 3759,
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw2b492855/images/aw26/fstgm25476aw26fus_1.jpg?sw=900&sh=1350&q=100&strip=false",
    sizeStock: { "S": 3, "M": 4, "L": 3, "XL": 2, "XXL": 0 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-13T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-013",
    name: "Navy Paisley Printed Straight Kurta",
    description: "Navy straight kurta with a large paisley and lotus print in soft gold tones, a notched collar and side slits.",
    collection: "alankritha",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 2999,
    salePrice: 2399,
    image: "https://www.rangriti.com/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-rangriti-product-catalog/default/dw05005b15/images/aw26/rrtroz28080aw26blu_1.jpg?sw=900&sh=1350&q=100&strip=false",
    sizeStock: { "S": 4, "M": 6, "L": 5, "XL": 3, "XXL": 0 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-14T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-014",
    name: "Rani Pink Ombré Bandhani Saree",
    description: "Sheer saree shading from soft pink to rani pink, with an all-over bandhani print, a scalloped embellished border and a matching blouse piece.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Organza",
    price: 4499,
    salePrice: 3599,
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/SAUS0050080_PINK__1_800x800.jpg?v=1781788984&width=480",
    sizeStock: { "Free Size": 5 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-15T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-015",
    name: "Violet Ombré Bandhani Saree",
    description: "Sheer violet saree shading from lilac to deep purple, with a bandhani print, a scalloped embellished border and a matching blouse piece.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Organza",
    price: 4499,
    salePrice: 3599,
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/SAUS0050082_PURPLE__1_800x800.jpg?v=1781788863&width=480",
    sizeStock: { "Free Size": 4 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-16T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-016",
    name: "Tangerine and Red Ombré Bandhani Saree",
    description: "Sheer saree shading from tangerine to red, with a bandhani print, a scalloped embellished border and a matching blouse piece.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Organza",
    price: 4499,
    salePrice: 3599,
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/SAUS0050082_ORANGE__1_800x800.jpg?v=1781788701&width=480",
    sizeStock: { "Free Size": 4 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-17T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-017",
    name: "Mustard Patola Print Silk Saree",
    description: "Bright mustard silk saree with a patola-style geometric print, contrast rani pink borders and a printed pink blouse piece.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Katan Silk",
    price: 5999,
    salePrice: 4799,
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/koskii-mustard-printed-silk-designer-saree-saus0042393_mustard_rani_pink_1_4_800x800.jpg?v=1748425141&width=480",
    sizeStock: { "Free Size": 4 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-18T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  },
  {
    id: "alk-018",
    name: "Rani Pink Embroidered Silk Saree",
    description: "Rich rani pink silk saree scattered with small gold motifs and finished with a wide embroidered border along the pallu and hem.",
    collection: "ayanaa",
    category: "Sarees",
    subcategory: "Katan Silk",
    price: 6499,
    salePrice: 5199,
    image: "https://cdn.shopify.com/s/files/1/0049/3649/9315/files/koskii-maroon-zariwork-softsilk-designer-saree-saus0040043_rani_pink_1_2_800x800.jpg?v=1770705548&width=480",
    sizeStock: { "Free Size": 3 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled",
    createdAt: "2026-10-19T10:00:00Z",
    updatedAt: "2026-10-28T10:00:00Z"
  }
];

export interface ProductFilterOptions {
  collection?: "alankritha" | "ayanaa" | "All";
  category?: string;
  subcategory?: string;
  searchQuery?: string;
  inStockOnly?: boolean;
  selectedSize?: string;
  minPrice?: number;
  maxPrice?: number;
  includeDisabled?: boolean; // For Admin view: true; For customer view: false
  sortBy?: "newest" | "price-asc" | "price-desc" | "name";
}

export type CatalogueSource = "supabase" | "built-in";

// Longest wait for Supabase before the site opens with the built-in catalogue
const CATALOGUE_TIMEOUT_MS = 5000;

/**
 * IN-MEMORY PRODUCT REPOSITORY SERVICE LAYER
 */
class ProductService {
  private products: Product[];

  private catalogueLoad: Promise<CatalogueSource> | null = null;

  constructor() {
    this.products = [...INITIAL_SAMPLE_PRODUCTS];
  }

  /**
   * True when Supabase is configured, so the catalogue is read from it at startup
   */
  public usesRemoteCatalogue(): boolean {
    return isSupabaseConfigured();
  }

  /**
   * Replace the built-in sample catalogue with the one in Supabase (read-only).
   * Keeps the built-in catalogue when Supabase is not configured, fails, is slow,
   * or has no products yet. Safe to call more than once: it loads only once.
   */
  public loadCatalogue(): Promise<CatalogueSource> {
    this.catalogueLoad ??= this.loadRemoteCatalogue();
    return this.catalogueLoad;
  }

  private async loadRemoteCatalogue(): Promise<CatalogueSource> {
    if (!this.usesRemoteCatalogue()) return "built-in";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CATALOGUE_TIMEOUT_MS);
    try {
      const { fetchSupabaseCatalogue } = await import("./supabaseCatalogue");
      const products = await fetchSupabaseCatalogue(controller.signal);
      if (controller.signal.aborted) throw new Error("timed out");
      if (products.length === 0) {
        console.warn("[catalogue] Supabase has no products yet, using the built-in catalogue.");
        return "built-in";
      }
      this.products = products;
      return "supabase";
    } catch (error) {
      console.warn("[catalogue] Could not load products from Supabase, using the built-in catalogue.", error);
      return "built-in";
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Calculate total stock across all variant sizes for a product
   */
  public getTotalStock(product: Product): number {
    if (!product.sizeStock) return 0;
    return Object.values(product.sizeStock).reduce((sum, count) => sum + (Number(count) || 0), 0);
  }

  /**
   * Check if a product is considered in stock (has at least 1 item in any size)
   */
  public isInStock(product: Product): boolean {
    return this.getTotalStock(product) > 0;
  }

  /**
   * Check if a specific size is available for a product
   */
  public isSizeAvailable(product: Product, size: string): boolean {
    if (!product.sizeStock) return false;
    return (product.sizeStock[size] || 0) > 0;
  }

  /**
   * Retrieve all products matching filter criteria
   */
  public getProducts(options: ProductFilterOptions = {}): Product[] {
    let result = [...this.products];

    // Status filter: Public customers only see published ('enabled') products
    if (!options.includeDisabled) {
      result = result.filter(p => p.status === "enabled");
    }

    // Collection filter (Alankritha or Ayanaa)
    if (options.collection && options.collection !== "All") {
      result = result.filter(p => p.collection === options.collection);
    }

    // Category filter
    if (options.category && options.category !== "All") {
      if (options.category === "New Arrivals") {
        result = result.filter(p => p.isNewArrival);
      } else if (options.category === "Best Sellers") {
        result = result.filter(p => p.isFeatured);
      } else if (options.category === "Special Offers") {
        result = result.filter(p => p.salePrice !== undefined && p.salePrice < p.price);
      } else if (options.category === "Kurtas") {
        result = result.filter(p => p.category === "Kurtas");
      } else if (options.category === "Sarees") {
        result = result.filter(p => p.category === "Sarees");
      } else {
        result = result.filter(p => p.category.toLowerCase() === options.category!.toLowerCase());
      }
    }

    // Subcategory filter
    if (options.subcategory && options.subcategory !== "All") {
      result = result.filter(p => p.subcategory?.toLowerCase() === options.subcategory!.toLowerCase());
    }

    // Search query filter (matches name, description, category, subcategory)
    if (options.searchQuery && options.searchQuery.trim() !== "") {
      const q = options.searchQuery.trim().toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.subcategory && p.subcategory.toLowerCase().includes(q))
      );
    }

    // Stock availability filter
    if (options.inStockOnly) {
      result = result.filter(p => this.isInStock(p));
    }

    // Specific size availability filter
    if (options.selectedSize && options.selectedSize !== "All") {
      result = result.filter(p => this.isSizeAvailable(p, options.selectedSize!));
    }

    // Price range filters
    if (options.minPrice !== undefined) {
      result = result.filter(p => (p.salePrice || p.price) >= options.minPrice!);
    }
    if (options.maxPrice !== undefined) {
      result = result.filter(p => (p.salePrice || p.price) <= options.maxPrice!);
    }

    // Sorting
    if (options.sortBy) {
      switch (options.sortBy) {
        case "price-asc":
          result.sort((a, b) => (a.salePrice || a.price) - (b.salePrice || b.price));
          break;
        case "price-desc":
          result.sort((a, b) => (b.salePrice || b.price) - (a.salePrice || a.price));
          break;
        case "name":
          result.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case "newest":
        default:
          result.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
          });
          break;
      }
    }

    return result;
  }

  /**
   * Get single product by ID
   */
  public getProductById(id: string): Product | null {
    const found = this.products.find(p => p.id === id);
    return found ? { ...found } : null;
  }

  /**
   * Published products from the same collection, most related first:
   * same style (subcategory) before other styles, in-stock before sold out.
   */
  public getSimilarProducts(product: Product, limit: number = 4): Product[] {
    const collection: CollectionType = product.collection || (product.category === "Sarees" ? "ayanaa" : "alankritha");
    const relevance = (p: Product) =>
      (p.subcategory && p.subcategory === product.subcategory ? 2 : 0) + (this.isInStock(p) ? 1 : 0);

    return this.getProducts({ collection, includeDisabled: false })
      .filter(p => p.id !== product.id)
      .sort((a, b) => relevance(b) - relevance(a))
      .slice(0, limit);
  }

  /**
   * Create a new product (Admin)
   */
  public createProduct(data: Omit<Product, "id" | "reviews" | "createdAt" | "updatedAt">): Product {
    // Automatically correlate collection based on category if not explicitly given
    const collection: CollectionType = data.collection || (data.category === "Sarees" ? "ayanaa" : "alankritha");
    const newProduct: Product = {
      ...data,
      collection,
      id: `anv-${Date.now()}`,
      reviews: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: data.status || "enabled"
    };
    this.products = [newProduct, ...this.products];
    return { ...newProduct };
  }

  /**
   * Update an existing product (Admin)
   */
  public updateProduct(id: string, updates: Partial<Product>): Product | null {
    const index = this.products.findIndex(p => p.id === id);
    if (index === -1) return null;

    // Maintain category -> collection consistency
    let collection = updates.collection || this.products[index].collection;
    if (updates.category) {
      collection = updates.category === "Sarees" ? "ayanaa" : "alankritha";
    }

    const updated: Product = {
      ...this.products[index],
      ...updates,
      collection,
      updatedAt: new Date().toISOString()
    };
    this.products = [
      ...this.products.slice(0, index),
      updated,
      ...this.products.slice(index + 1)
    ];
    return { ...updated };
  }

  /**
   * Delete product by ID (Admin)
   */
  public deleteProduct(id: string): boolean {
    const prevCount = this.products.length;
    this.products = this.products.filter(p => p.id !== id);
    return this.products.length < prevCount;
  }

  /**
   * Toggle published / unpublished status (Admin)
   */
  public toggleProductStatus(id: string): Product | null {
    const product = this.getProductById(id);
    if (!product) return null;
    const newStatus: "enabled" | "disabled" = product.status === "enabled" ? "disabled" : "enabled";
    return this.updateProduct(id, { status: newStatus });
  }

  /**
   * Update specific size inventory count (Admin / Inventory Manager)
   */
  public updateSizeStock(id: string, size: string, count: number): Product | null {
    const product = this.getProductById(id);
    if (!product) return null;
    const updatedStock = {
      ...(product.sizeStock || {}),
      [size]: Math.max(0, count)
    };
    return this.updateProduct(id, { sizeStock: updatedStock });
  }

  /**
   * Mark product completely out of stock by setting all sizes to 0
   */
  public markOutOfStock(id: string): Product | null {
    const product = this.getProductById(id);
    if (!product) return null;
    const zeroedStock: Record<string, number> = {};
    Object.keys(product.sizeStock || {}).forEach(size => {
      zeroedStock[size] = 0;
    });
    return this.updateProduct(id, { sizeStock: zeroedStock });
  }

  /**
   * Restock product with default or specified quantities
   */
  public restockProduct(id: string, quantityPerSize: number = 5): Product | null {
    const product = this.getProductById(id);
    if (!product) return null;
    const restocked: Record<string, number> = {};
    // Every size this kind of product is sold in (kurtas S to XXL, sarees Free Size)
    const defaultSizes = getSizeOptionsFor(product.category);
    
    defaultSizes.forEach(size => {
      restocked[size] = quantityPerSize;
    });
    return this.updateProduct(id, { sizeStock: restocked });
  }

  /**
   * Add a customer review with a templated brand reply (no AI or network calls)
   */
  public addReview(id: string, review: { author: string; rating: number; comment: string }): Product | null {
    const product = this.getProductById(id);
    if (!product) return null;

    const newReview: Review = {
      id: `rev-${Date.now()}`,
      author: review.author,
      rating: review.rating,
      comment: review.comment,
      date: new Date().toISOString().split("T")[0],
      verified: true,
      brandReply: `Namaste ${review.author}! Thank you for giving us ${review.rating} stars for the ${product.name}. We are glad you enjoyed our handcrafted pieces.`
    };

    return this.updateProduct(id, { reviews: [newReview, ...(product.reviews || [])] });
  }

  /**
   * Atomically reduce size stock when customer checkout completes
   */
  public depleteStock(items: { productId: string; selectedSize: string; quantity: number }[]): boolean {
    for (const item of items) {
      const prod = this.getProductById(item.productId);
      if (!prod) return false;
      const currentStock = prod.sizeStock?.[item.selectedSize] || 0;
      if (currentStock < item.quantity) {
        return false;
      }
    }
    for (const item of items) {
      const prod = this.getProductById(item.productId)!;
      const newCount = (prod.sizeStock[item.selectedSize] || 0) - item.quantity;
      this.updateSizeStock(item.productId, item.selectedSize, newCount);
    }
    return true;
  }
}

export const productService = new ProductService();
