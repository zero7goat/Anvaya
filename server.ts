import express from "express";
import path from "path";
import fs from "fs";
import { timingSafeEqual } from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { Product, Order, Review, Category, OfflineSale, Offer, AnalyticsData } from "./src/types.js";

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: any = null;

if (geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY" && geminiApiKey.trim() !== "") {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini client successfully initialized.");
  } catch (err) {
    console.error("Error setting up Gemini Client:", err);
  }
} else {
  console.log("No valid GEMINI_API_KEY environment variable detected. Fallback boutique templates will be used.");
}

const app = express();
// Small JSON bodies only: nothing this API accepts needs more
app.use(express.json({ limit: "100kb" }));

// Admin and customer-data endpoints need ADMIN_API_TOKEN, sent as
// "Authorization: Bearer <token>". Without that variable set they stay locked, so a
// deployment never exposes orders, customer details or catalogue edits by accident.
// (The storefront itself does not call these endpoints; it runs on in-browser data.)
const ADMIN_API_TOKEN = (process.env.ADMIN_API_TOKEN || "").trim();
const requireAdmin: express.RequestHandler = (req, res, next) => {
  const header = req.get("authorization") || "";
  const supplied = Buffer.from(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const expected = Buffer.from(ADMIN_API_TOKEN);
  if (!ADMIN_API_TOKEN || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ error: "Not authorised." });
  }
  next();
};

const isPositiveInt = (value: unknown, max: number) =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;
const isShortText = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

const PORT = 3000;
const DB_FILE_PATH = path.join(process.cwd(), "db_backup.json");

// ====================================================
// INITIAL SEED DATA DEFINITIONS
// ====================================================

const INITIAL_CATEGORIES: Category[] = [
  { id: "cat-1", name: "Kurtas", subcategories: ["Straight Fit", "A-Line", "Anarkali"] },
  { id: "cat-2", name: "Sarees", subcategories: ["Banarasi Silk", "Organza", "Katan Silk"] }
];

const INITIAL_PRODUCTS: Product[] = [
  {
    id: "best-1",
    name: "Turquoise Cotton Floral Printed Straight Kurta",
    description: "An elegant turquoise straight-cut kurta adorned with traditional hand-blocked floral patterns, fine thread work at the yoke, and side slits.",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 3599.00,
    salePrice: 2519.00,
    image: "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dwde10fa80/images/ss26/skdasrt32417ss26tur_1.jpg?sw=650&sh=975&q=100&strip=false",
    sizeStock: { "S": 5, "M": 6, "L": 8, "XL": 4 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled"
  },
  {
    id: "best-2",
    name: "Rust Printed Straight Kurta",
    description: "Sophisticated rust orange straight-line silhouette kurta with abstract artisanal print detailing, three-quarter sleeves, and a gorgeous patterned border.",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 3999.00,
    salePrice: 2000.00,
    image: "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dw5b4f815f/images/aw25/skdasrt30604aw25rust_1.jpg?sw=650&sh=975&q=100&strip=false",
    sizeStock: { "S": 3, "M": 4, "L": 5, "XL": 2 },
    reviews: [],
    isFeatured: true,
    isNewArrival: false,
    status: "enabled"
  },
  {
    id: "best-3",
    name: "Red Embroidered Art Silk Straight Kurta",
    description: "Indulge in festive luxury with this vibrant red art-silk kurta. Features rich, golden brocade hand embroideries on the collar neckline and sleeves.",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 5995.00,
    salePrice: 3597.00,
    image: "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dwfe4e0739/images/aw25/skdutsv31130aw25red_1.jpg?sw=650&sh=975&q=100&strip=false",
    sizeStock: { "S": 2, "M": 3, "L": 4, "XL": 1 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled"
  },
  {
    id: "best-4",
    name: "Green Cotton Floral & Chevron Printed Straight Kurta",
    description: "A delightful amalgamation of floral prints and geometric chevrons in a rich pine-green shade. Soft breathable cotton fabric perfect for hot Indian summers.",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 2599.00,
    salePrice: 2079.00,
    image: "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dw6099e30b/images/ss26/skdasrt32196ss26grn_1.jpg?sw=650&sh=975&q=100&strip=false",
    sizeStock: { "S": 6, "M": 8, "L": 5, "XL": 3 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled"
  },
  {
    id: "best-5",
    name: "Purple Rayon Printed Straight Kurta",
    description: "Chic daily wear purple rayon comfort kurta with micro floral prints and round neckline with button accents.",
    category: "Kurtas",
    subcategory: "Straight Fit",
    price: 2999.00,
    salePrice: 2399.00,
    image: "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dw4e627810/images/ss26/skdasrt9709ess26pur_1.jpg?sw=650&sh=975&q=100&strip=false",
    sizeStock: { "S": 4, "M": 5, "L": 6, "XL": 2 },
    reviews: [],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled"
  },
  {
    id: "prod-2",
    name: "Mayura Banarasi Silk Saree",
    description: "Handloomed with golden Zari work, this traditional Banarasi Silk Saree features peacock motifs and an ornate floral pallu in deep royal indigo and crimson.",
    category: "Sarees",
    subcategory: "Banarasi Silk",
    price: 8999.00,
    salePrice: 7999.00,
    image: "https://images.unsplash.com/photo-1610030470298-40b355e5a7b3?w=800&auto=format&fit=crop&q=80",
    sizeStock: { "FS": 12 }, // FS for Free Size / One Size Fits All
    reviews: [
      {
        id: "rev-2",
        author: "Anjali G.",
        rating: 5,
        comment: "The zari work is incredibly detailed and heavy. The drape is elegant and has a majestic sheen.",
        date: "2026-08-12",
        verified: true,
        brandReply: "Thank you Anjali! Each saree is woven by our master artisans to bring out that royal sheen."
      }
    ],
    isFeatured: true,
    isNewArrival: false,
    status: "enabled"
  },
  {
    id: "prod-3",
    name: "Katan Silk Handwoven Brocade Saree",
    description: "An opulent pure Katan silk saree woven in Varanasi featuring exquisite kadwa floral jaal in antique gold zari and a contrast scalloped pallu.",
    category: "Sarees",
    subcategory: "Katan Silk",
    price: 7499.00,
    salePrice: 6299.00,
    image: "https://www.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Library-Sites-BibaSharedLibrary/en_IN/dw3975fe0f/A-A-SS26/Silk.png",
    sizeStock: { "FS": 6 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled"
  },
  {
    id: "prod-4",
    name: "Mustard Silk Chanderi A-Line Kurta",
    description: "Luminous turmeric mustard festive kurta crafted from genuine Chanderi silk with delicate mirror embroidery on the yoke and soft zari borders.",
    category: "Kurtas",
    subcategory: "A-Line",
    price: 4299.00,
    salePrice: 3499.00,
    image: "https://www.lakshita.com/cdn/shop/files/Artboard_6.jpg_1.jpg?v=1785838580&width=700",
    sizeStock: { "S": 3, "M": 4, "L": 2, "XL": 1 },
    reviews: [
      {
        id: "rev-3",
        author: "Meera R.",
        rating: 5,
        comment: "Beautiful hand embroidery and very comfortable for hot climates. The A-line silhouette drapes elegantly!",
        date: "2026-08-14",
        verified: true,
        brandReply: "Dhanyawaad Meera! We are delighted that you cherish the handcrafted Chanderi weave."
      }
    ],
    isFeatured: true,
    isNewArrival: true,
    status: "enabled"
  },
  {
    id: "prod-5",
    name: "Meera Pastel Organza Saree",
    description: "A dreamy, lightweight pastel sage green Organza Saree finished with hand-painted floral vignettes and delicate scalloped embroidery on the borders.",
    category: "Sarees",
    subcategory: "Organza",
    price: 4899.00,
    salePrice: 3999.00,
    image: "https://images.unsplash.com/photo-1583391265517-35bbadd01209?w=800&auto=format&fit=crop&q=80",
    sizeStock: { "FS": 5 },
    reviews: [],
    isFeatured: false,
    isNewArrival: true,
    status: "enabled"
  }
];

const INITIAL_OFFERS: Offer[] = [
  { id: "off-1", title: "Inaugural Store Discount", code: "ALANKRITHA10", discountValue: 10, type: "percent", enabled: true, minSpend: 1500 },
  { id: "off-2", title: "Festive Flat Discount", code: "FESTIVE500", discountValue: 500, type: "flat", enabled: true, minSpend: 4000 }
];

const INITIAL_ANALYTICS: AnalyticsData = {
  visitors: 482,
  pageViews: 1284,
  productViews: 642,
  popularProducts: { "prod-2": 92, "prod-4": 84, "prod-5": 58 },
  trafficSources: { "Instagram": 284, "Direct": 121, "WhatsApp": 54, "Google": 23 },
  devices: { "Mobile": 381, "Desktop": 101 }
};

// ====================================================
// PERSISTENT DATABASE MANAGEMENT FUNCTIONS
// ====================================================

interface AppDatabase {
  products: Product[];
  categories: Category[];
  orders: Order[];
  offlineSales: OfflineSale[];
  offers: Offer[];
  analytics: AnalyticsData;
}

function loadDB(): AppDatabase {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const data = fs.readFileSync(DB_FILE_PATH, "utf8");
      const parsed = JSON.parse(data);
      
      // Merge with initial categories and products if any are missing
      if (!parsed.products || parsed.products.length === 0) parsed.products = INITIAL_PRODUCTS;
      if (!parsed.categories || parsed.categories.length === 0) parsed.categories = INITIAL_CATEGORIES;
      if (!parsed.orders) parsed.orders = [];
      if (!parsed.offlineSales) parsed.offlineSales = [];
      if (!parsed.offers) parsed.offers = INITIAL_OFFERS;
      if (!parsed.analytics) parsed.analytics = INITIAL_ANALYTICS;

      return parsed;
    }
  } catch (err) {
    console.error("Error reading database file, loading seed defaults:", err);
  }

  // Create file with seeds
  const initialDB: AppDatabase = {
    products: INITIAL_PRODUCTS,
    categories: INITIAL_CATEGORIES,
    orders: [],
    offlineSales: [],
    offers: INITIAL_OFFERS,
    analytics: INITIAL_ANALYTICS
  };
  saveDB(initialDB);
  return initialDB;
}

function saveDB(db: AppDatabase) {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing database file:", err);
  }
}

// Global active in-memory database reference (loaded from persistent file)
let dbState = loadDB();

// ====================================================
// BRAND NOTIFICATION LOGIC (GEMINI & FALLBACKS)
// ====================================================

async function generateAIReviewsReply(productName: string, reviewer: string, comment: string, rating: number): Promise<string> {
  if (!ai) {
    return `Namaste ${reviewer}! Thank you for giving us ${rating} stars for the ${productName}. We are glad you enjoyed our handcrafted pieces.`;
  }

  try {
    const prompt = `You are the boutique director of ANVAYA, a high-end, family-owned Indian clothing label presenting two signature collections: Alankritha (exclusively women's kurtas) and Ayanaa (exclusively women's sarees). 
    A customer named "${reviewer}" left a ${rating}-star review for the "${productName}" with the comment: "${comment}". 
    Write a warm, polite, and brief (2-3 sentences) response thanking them. Integrate Indian warmth (using words like 'Namaste' or 'Dhanyawaad') and offer custom styling tips for this garment. Do not use generic corporate language.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text.trim();
  } catch (err) {
    console.error("Gemini reviews reply failed, using fallback:", err);
    return `Namaste ${reviewer}! Thank you for choosing ALANKRITHA. We are glad you loved the ${productName}. We craft each piece with utmost care and heritage weaves.`;
  }
}

async function generateCheckoutNotifications(order: Order): Promise<{ email: string; whatsapp: string }> {
  const itemSummary = order.items.map(it => `• ${it.name} (${it.selectedSize}) x ${it.quantity} @ ₹${it.price}`).join('\n');
  
  const fallbackEmail = `
# ALANKRITHA — Order Confirmed
## Namaste ${order.customerName},

Thank you for supporting our home-grown brand! We have received your order and reserved your inventory. 

### Order Reference: #${order.id}
### Date: ${order.date}

---

### Order Summary:
${itemSummary}

**Total Amount Due:** ₹${order.total.toFixed(2)}
**Payment Method:** ${order.paymentMethod}
**Delivery Destination:**
${order.address}, ${order.city}, ${order.state} - ${order.pincode}

---

### Delivery Guidelines:
We hand-pack each outfit with protective organic muslin. Your parcel will be shipped within 2-3 business days. We will share tracking details shortly via WhatsApp.

Warm regards,
**The ALANKRITHA Family Team**
`.trim();

  const fallbackWhatsApp = `Namaste ${order.customerName}! Thank you for shopping with ALANKRITHA. We've confirmed your order #${order.id} (Total: ₹${order.total.toFixed(2)}). We are hand-packing your items and will share the courier tracking details with you shortly. Contact us at +91 98765 43210 for any modifications!`.trim();

  if (!ai) {
    return { email: fallbackEmail, whatsapp: fallbackWhatsApp };
  }

  try {
    const emailPrompt = `You are the head of Client Services at ALANKRITHA, an Indian home-based boutique. 
    Write a beautiful, personalized, and structured HTML/Markdown order confirmation email for customer "${order.customerName}" who just purchased:
    ${itemSummary}
    The grand total is ₹${order.total.toFixed(2)} via payment method "${order.paymentMethod}". 
    The shipping address is "${order.address}, ${order.city}, ${order.state} - ${order.pincode}".
    Include warm Indian greetings (Namaste), praise their fashion taste, give a short styling recommendation for their items, and assure them of handcrafted quality care. Ensure it is written in gorgeous clean formatting.`;

    const waPrompt = `Write a friendly, highly concise WhatsApp message (under 300 characters) to "${order.customerName}" from ALANKRITHA confirming order #${order.id} of total ₹${order.total}. Keep it warm, elegant, with emojis appropriate for Indian ethnic fashion, and ask them to reply for any personalization requests.`;

    const [emailRes, waRes] = await Promise.all([
      ai.models.generateContent({ model: "gemini-2.5-flash", contents: emailPrompt }),
      ai.models.generateContent({ model: "gemini-2.5-flash", contents: waPrompt })
    ]);

    return {
      email: emailRes.text.trim(),
      whatsapp: waRes.text.trim()
    };
  } catch (err) {
    console.error("Gemini notifications generation failed, using fallbacks:", err);
    return { email: fallbackEmail, whatsapp: fallbackWhatsApp };
  }
}

// ====================================================
// REST API ROUTING
// ====================================================

// 1. PRODUCTS ENDPOINTS
app.get("/api/products", (req, res) => {
  const includeDisabled = req.query.all === "true";
  if (includeDisabled) {
    return requireAdmin(req, res, () => res.json(dbState.products));
  } else {
    // Only return enabled products for client storefront
    const activeProducts = dbState.products.filter(p => p.status !== "disabled");
    res.json(activeProducts);
  }
});

app.post("/api/products", requireAdmin, (req, res) => {
  const { name, description, category, subcategory, price, salePrice, image, sizeStock, isFeatured, isNewArrival } = req.body;
  if (!name || !description || !category || !price || !sizeStock) {
    return res.status(400).json({ error: "Missing required product metadata" });
  }

  const newProduct: Product = {
    id: `prod-${Date.now()}`,
    name,
    description,
    category,
    subcategory: subcategory || "",
    price: Number(price),
    salePrice: salePrice ? Number(salePrice) : undefined,
    image: image || "https://images.biba.in/dw/image/v2/BKQK_PRD/on/demandware.static/-/Sites-biba-product-catalog/default/dwde10fa80/images/ss26/skdasrt32417ss26tur_1.jpg?sw=650&sh=975&q=100&strip=false",
    sizeStock: sizeStock || {},
    reviews: [],
    isFeatured: !!isFeatured,
    isNewArrival: !!isNewArrival,
    status: "enabled"
  };

  dbState.products.push(newProduct);
  saveDB(dbState);
  res.status(201).json({ message: "Product created successfully", product: newProduct, products: dbState.products });
});

app.put("/api/products/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = dbState.products.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  const { name, description, category, subcategory, price, salePrice, image, sizeStock, isFeatured, isNewArrival, status } = req.body;
  
  dbState.products[index] = {
    ...dbState.products[index],
    name: name !== undefined ? name : dbState.products[index].name,
    description: description !== undefined ? description : dbState.products[index].description,
    category: category !== undefined ? category : dbState.products[index].category,
    subcategory: subcategory !== undefined ? subcategory : dbState.products[index].subcategory,
    price: price !== undefined ? Number(price) : dbState.products[index].price,
    salePrice: salePrice !== undefined ? (salePrice ? Number(salePrice) : undefined) : dbState.products[index].salePrice,
    image: image !== undefined ? image : dbState.products[index].image,
    sizeStock: sizeStock !== undefined ? sizeStock : dbState.products[index].sizeStock,
    isFeatured: isFeatured !== undefined ? !!isFeatured : dbState.products[index].isFeatured,
    isNewArrival: isNewArrival !== undefined ? !!isNewArrival : dbState.products[index].isNewArrival,
    status: status !== undefined ? status : dbState.products[index].status,
  };

  saveDB(dbState);
  res.json({ message: "Product updated successfully", product: dbState.products[index], products: dbState.products });
});

app.delete("/api/products/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const filtered = dbState.products.filter(p => p.id !== id);
  if (filtered.length === dbState.products.length) {
    return res.status(404).json({ error: "Product not found" });
  }
  dbState.products = filtered;
  saveDB(dbState);
  res.json({ message: "Product deleted successfully", products: dbState.products });
});

// 2. CATEGORIES ENDPOINTS
app.get("/api/categories", (req, res) => {
  res.json(dbState.categories);
});

app.post("/api/categories", requireAdmin, (req, res) => {
  const { name, subcategories } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Category name is required" });
  }

  const exists = dbState.categories.some(c => c.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: "Category already exists" });
  }

  const newCategory: Category = {
    id: `cat-${Date.now()}`,
    name,
    subcategories: subcategories || []
  };

  dbState.categories.push(newCategory);
  saveDB(dbState);
  res.status(201).json({ message: "Category created successfully", category: newCategory, categories: dbState.categories });
});

app.put("/api/categories/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = dbState.categories.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Category not found" });
  }

  const { name, subcategories } = req.body;
  if (name !== undefined) dbState.categories[index].name = name;
  if (subcategories !== undefined) dbState.categories[index].subcategories = subcategories;

  saveDB(dbState);
  res.json({ message: "Category updated successfully", category: dbState.categories[index], categories: dbState.categories });
});

app.delete("/api/categories/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const filtered = dbState.categories.filter(c => c.id !== id);
  if (filtered.length === dbState.categories.length) {
    return res.status(404).json({ error: "Category not found" });
  }
  dbState.categories = filtered;
  saveDB(dbState);
  res.json({ message: "Category deleted successfully", categories: dbState.categories });
});

// 3. PRODUCT REVIEWS (WITH AUTO AI REPLY GENERATOR)
app.post("/api/products/:id/review", async (req, res) => {
  const { id } = req.params;
  const { author, rating, comment } = req.body;

  if (!isShortText(author, 80) || !isPositiveInt(Number(rating), 5) || !isShortText(comment, 2000)) {
    return res.status(400).json({ error: "Author name, rating (1-5), and comment are required." });
  }

  const product = dbState.products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Generate automated AI boutique response
  const brandReply = await generateAIReviewsReply(product.name, author, comment, Number(rating));

  const newReview: Review = {
    id: `rev-${Date.now()}`,
    author,
    rating: Number(rating),
    comment,
    date: new Date().toISOString().split("T")[0],
    verified: true,
    brandReply
  };

  product.reviews = [newReview, ...product.reviews];
  saveDB(dbState);

  res.status(201).json({
    message: "Review submitted",
    product,
    brandReply
  });
});

// 4. ATOMIC CHECKOUT & STOCK BOOKER (PREVENTS OVERSELLING)
app.post("/api/checkout", async (req, res) => {
  const { items, customerName, customerPhone, customerEmail, address, city, state, pincode, paymentMethod } = req.body;

  if (!Array.isArray(items) || items.length === 0 || items.length > 50 || !customerName || !customerPhone || !customerEmail || !address || !city || !state || !pincode) {
    return res.status(400).json({ error: "Missing vital billing or delivery credentials." });
  }
  for (const item of items) {
    if (!item || typeof item.productId !== "string" || typeof item.selectedSize !== "string" || !isPositiveInt(item.quantity, 20)) {
      return res.status(400).json({ error: "Each item needs a product, a size and a quantity from 1 to 20." });
    }
  }

  // Validate quantities and lock stocks in an atomic check
  for (const item of items) {
    const product = dbState.products.find(p => p.id === item.productId);
    if (!product) {
      return res.status(404).json({ error: `Outfit with ID ${item.productId} is no longer in catalogue.` });
    }

    const availableStock = product.sizeStock[item.selectedSize] || 0;
    if (availableStock < item.quantity) {
      return res.status(400).json({
        error: `Insufficient stock for "${product.name}" in size "${item.selectedSize}". Only ${availableStock} left.`
      });
    }
  }

  // Stock depletion is safe now
  const checkoutItems = items.map((item: any) => {
    const product = dbState.products.find(p => p.id === item.productId)!;
    product.sizeStock[item.selectedSize] -= item.quantity; // Deplete size-specific stock
    return {
      productId: item.productId,
      name: product.name,
      price: product.salePrice || product.price,
      quantity: item.quantity,
      selectedSize: item.selectedSize
    };
  });

  const subtotal = checkoutItems.reduce((sum: number, it: any) => sum + it.price * it.quantity, 0);
  const shippingFee = subtotal >= 1999 ? 0 : 99; // Standard domestic shipping threshold
  const totalAmount = subtotal + shippingFee;

  const orderId = `ALK-${Math.floor(100000 + Math.random() * 900000)}`;
  const orderDate = new Date().toISOString().split("T")[0];
  const orderTime = new Date().toLocaleTimeString("en-US", { hour12: false, hour: '2-digit', minute:'2-digit' });

  const newOrder: Order = {
    id: orderId,
    items: checkoutItems,
    customerName,
    customerPhone,
    customerEmail,
    address,
    city,
    state,
    pincode,
    total: totalAmount,
    date: orderDate,
    time: orderTime,
    paymentMethod: paymentMethod || "COD",
    paymentStatus: paymentMethod === "COD" ? "COD - Due" : "Paid",
    status: "Pending"
  };

  // Generate automated styled notifications
  const notifications = await generateCheckoutNotifications(newOrder);
  newOrder.emailContent = notifications.email;
  newOrder.whatsappContent = notifications.whatsapp;

  dbState.orders.push(newOrder);
  
  // Track order in popular products analytics
  checkoutItems.forEach((it: any) => {
    dbState.analytics.popularProducts[it.productId] = (dbState.analytics.popularProducts[it.productId] || 0) + it.quantity;
  });

  saveDB(dbState);

  res.status(201).json({
    message: "Order placed securely",
    order: newOrder,
    products: dbState.products
  });
});

// 5. MANUAL OFFLINE / INSTAGRAM SALE RECORDER
app.post("/api/sales/offline", requireAdmin, (req, res) => {
  const { productId, size, quantity, salePrice, date } = req.body;

  if (!productId || !size || !quantity) {
    return res.status(400).json({ error: "Product ID, size, and quantity are required." });
  }

  const product = dbState.products.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const stockAvailable = product.sizeStock[size] || 0;
  const numQty = Number(quantity);

  if (stockAvailable < numQty) {
    return res.status(400).json({ error: `Insufficient stock for offline sale. Only ${stockAvailable} items of size ${size} are left.` });
  }

  // Deduct inventory from unified stock
  product.sizeStock[size] -= numQty;

  const actualPrice = salePrice ? Number(salePrice) : (product.salePrice || product.price);
  
  const newSale: OfflineSale = {
    id: `off-${Date.now()}`,
    productId,
    productName: product.name,
    size,
    quantity: numQty,
    price: actualPrice,
    date: date || new Date().toISOString().split("T")[0]
  };

  dbState.offlineSales.push(newSale);
  
  // Track order in analytics
  dbState.analytics.popularProducts[productId] = (dbState.analytics.popularProducts[productId] || 0) + numQty;

  saveDB(dbState);

  res.status(201).json({
    message: "Offline/Instagram sale recorded successfully.",
    sale: newSale,
    products: dbState.products,
    offlineSales: dbState.offlineSales
  });
});

app.get("/api/sales/offline", requireAdmin, (req, res) => {
  res.json(dbState.offlineSales);
});

// 6. ORDER SHIPMENT & STATUS MANAGEMENT
app.get("/api/orders", requireAdmin, (req, res) => {
  res.json(dbState.orders);
});

app.post("/api/orders/:id/status", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = dbState.orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  order.status = status;
  if (status === "Delivered") {
    order.paymentStatus = "Paid";
  }

  // Regenerate dynamic email for updated logistical status
  const itemSummary = order.items.map(it => `• ${it.name} (${it.selectedSize}) x ${it.quantity}`).join('\n');
  const fallbackEmail = `
# ALANKRITHA — Parcel Status Updated: ${status}
## Namaste ${order.customerName},

We are excited to share a logistical update regarding your wardrobe choice!

### Order Reference: #${order.id}
### Current Status: **${status}**

We appreciate your patronage. Enjoy styling your handcrafted garments!
`.trim();

  let updatedEmail = fallbackEmail;
  if (ai) {
    try {
      const prompt = `You are the lead boutique director of ALANKRITHA. Write a highly professional and warm update notification email to the customer "${order.customerName}" inform them that their order #${order.id} consisting of:\n${itemSummary}\nis now "${status}". Draft dynamic styling tips or care guides appropriate for this milestone and sign off with Indian family boutique warmth.`;
      const aiRes = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
      updatedEmail = aiRes.text.trim();
    } catch (err) {
      console.error("Gemini status update email draft failed, using fallback:", err);
    }
  }

  order.emailContent = updatedEmail;
  saveDB(dbState);

  res.json({ message: `Order status advanced to ${status}`, order, orders: dbState.orders });
});

// 7. OFFERS ENDPOINTS
app.get("/api/offers", (req, res) => {
  res.json(dbState.offers);
});

app.post("/api/offers", requireAdmin, (req, res) => {
  const { title, code, discountValue, type, minSpend, enabled } = req.body;
  if (!title || !code || !discountValue || !type) {
    return res.status(400).json({ error: "Missing required offer fields" });
  }

  const newOffer: Offer = {
    id: `off-${Date.now()}`,
    title,
    code: code.toUpperCase(),
    discountValue: Number(discountValue),
    type,
    minSpend: minSpend ? Number(minSpend) : undefined,
    enabled: enabled !== undefined ? !!enabled : true
  };

  dbState.offers.push(newOffer);
  saveDB(dbState);
  res.status(201).json({ message: "Offer created successfully", offer: newOffer, offers: dbState.offers });
});

app.put("/api/offers/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = dbState.offers.findIndex(o => o.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Offer not found" });
  }

  const { title, code, discountValue, type, minSpend, enabled } = req.body;
  dbState.offers[index] = {
    ...dbState.offers[index],
    title: title !== undefined ? title : dbState.offers[index].title,
    code: code !== undefined ? code.toUpperCase() : dbState.offers[index].code,
    discountValue: discountValue !== undefined ? Number(discountValue) : dbState.offers[index].discountValue,
    type: type !== undefined ? type : dbState.offers[index].type,
    minSpend: minSpend !== undefined ? (minSpend ? Number(minSpend) : undefined) : dbState.offers[index].minSpend,
    enabled: enabled !== undefined ? !!enabled : dbState.offers[index].enabled
  };

  saveDB(dbState);
  res.json({ message: "Offer updated successfully", offer: dbState.offers[index], offers: dbState.offers });
});

app.delete("/api/offers/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const filtered = dbState.offers.filter(o => o.id !== id);
  if (filtered.length === dbState.offers.length) {
    return res.status(404).json({ error: "Offer not found" });
  }
  dbState.offers = filtered;
  saveDB(dbState);
  res.json({ message: "Offer deleted successfully", offers: dbState.offers });
});

// 8. REAL-TIME RESTOCK WAREHOUSE ENDPOINT
app.post("/api/inventory/restock", requireAdmin, (req, res) => {
  const { productId, size, quantity } = req.body;
  if (!productId || !size || !quantity) {
    return res.status(400).json({ error: "Product ID, size, and quantity are required." });
  }

  const product = dbState.products.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Refill size-specific stock
  product.sizeStock[size] = (product.sizeStock[size] || 0) + Number(quantity);
  saveDB(dbState);

  res.json({
    message: "Restock processed successfully",
    product,
    products: dbState.products
  });
});

// 9. WEB ANALYTICS & TRAFFIC TRACKER
app.get("/api/analytics", requireAdmin, (req, res) => {
  res.json(dbState.analytics);
});

app.post("/api/analytics/track", (req, res) => {
  const { type, payload } = req.body;

  if (type === "pageView") {
    dbState.analytics.pageViews += 1;
  } else if (type === "visitor") {
    dbState.analytics.visitors += 1;
  } else if (type === "productView" && payload?.productId) {
    dbState.analytics.productViews += 1;
    // Log individual product view counts
    dbState.analytics.popularProducts[payload.productId] = (dbState.analytics.popularProducts[payload.productId] || 0) + 1;
  }

  if (payload?.source) {
    dbState.analytics.trafficSources[payload.source] = (dbState.analytics.trafficSources[payload.source] || 0) + 1;
  }
  if (payload?.device) {
    const dev = payload.device;
    dbState.analytics.devices[dev] = (dbState.analytics.devices[dev] || 0) + 1;
  }

  saveDB(dbState);
  res.json({ success: true });
});

// Serve static files from images directory
app.use("/images", express.static(path.join(process.cwd(), "images")));

// ====================================================
// VITE AND DEVELOPMENT DEV SERVER SETUP
// ====================================================

if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then((vite) => {
    app.use(vite.middlewares);
    
    // Fallback index.html loading for client router in dev
    app.use("*", (req, res, next) => {
      const htmlFile = path.join(process.cwd(), "index.html");
      fs.readFile(htmlFile, "utf-8", (err, content) => {
        if (err) return next(err);
        vite.transformIndexHtml(req.originalUrl, content).then((transformed) => {
          res.send(transformed);
        }).catch(next);
      });
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Boutique full-stack server running on http://localhost:${PORT}`);
    });
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Production full-stack server running on port ${PORT}`);
  });
}
