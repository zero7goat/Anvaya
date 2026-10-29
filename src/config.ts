/**
 * Central Configuration for ANVAYA Boutique Website
 * 
 * Brand Hierarchy:
 * - ANVAYA: The primary brand for handcrafted Indian ethnic wear.
 * - ALANKRITHA: Dedicated collection of exclusively women's kurtas.
 * - AYANAA: Dedicated collection of exclusively women's handwoven & festive sarees.
 * 
 * Keep WhatsApp number, brand metadata, and future integration settings
 * in one central place so that no hardcoded values are scattered throughout the UI.
 */

import { SITE_IMAGES } from "./data/imageRegistry";

export const BOUTIQUE_CONFIG = {
  brandName: "ANVAYA",
  brandTagline: "Handcrafted Indian Ethnic Wear",
  brandSubtitle: "Curated collections celebrating timeless Indian craftsmanship",
  establishedYear: 2026,

  // Two Signature Collections
  collections: {
    alankritha: {
      id: "alankritha" as const,
      name: "Alankritha",
      byline: "By Anvaya",
      category: "Kurtas" as const,
      tagline: "Exclusively Women's Kurtas",
      description: "Graceful silhouettes, hand-block prints, and intricate zari detailing tailored for modern celebrations.",
      path: "/collection/alankritha",
      hash: "#/collection/alankritha",
      coverImage: SITE_IMAGES.collectionCovers.alankritha,
    },
    ayanaa: {
      id: "ayanaa" as const,
      name: "Ayanaa",
      byline: "By Anvaya",
      category: "Sarees" as const,
      tagline: "Exclusively Women's Sarees",
      description: "Pure Katan silks, hand-painted organzas, and heirloom Banarasi weaves crafted for timeless elegance.",
      path: "/collection/ayanaa",
      hash: "#/collection/ayanaa",
      coverImage: SITE_IMAGES.collectionCovers.ayanaa,
    },
  },

  // WhatsApp Integration:
  // Preserved business WhatsApp phone number with country code without '+' or special characters.
  whatsappNumber: "919620828013",

  // Customer Support Contact Details
  // OWNER TO SUPPLY: the real ANVAYA support email address. Left empty on purpose (the
  // old care@alankrita.com belonged to the previous brand); while it is empty the site
  // hides every email link and offers phone and WhatsApp instead.
  supportEmail: "" as string,
  supportPhone: "+91 9620828013",
  supportHours: "10:00 AM - 8:00 PM IST",
  storeLocation: "Ballari, Karnataka, India",

  // Shipping & Pricing Rules
  currencySymbol: "₹",
  freeShippingThreshold: 1999, // Free shipping on orders >= ₹1,999
  standardShippingFee: 99,     // Shipping fee below threshold

  // Payment Options Supported in Frontend Phase
  paymentMethods: [
    {
      id: "cod",
      label: "Cash on Delivery (COD)",
      description: "Pay with cash or UPI upon home delivery",
      isDefault: true,
      enabled: true,
    },
  ],
  // Hosting: static site on Cloudflare Pages; products, stock and orders live in Supabase.
};
