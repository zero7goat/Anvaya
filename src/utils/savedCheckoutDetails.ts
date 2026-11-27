/**
 * Delivery details the shopper chose to keep for next time, in their own browser only.
 * Storage can be unavailable (private browsing); then nothing is kept and checkout still works.
 */

export type CheckoutDetails = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

const STORAGE_KEY = "anvaya_checkout_details";
const FIELDS: (keyof CheckoutDetails)[] = ["name", "phone", "email", "address", "city", "state", "pincode"];

export function loadCheckoutDetails(): CheckoutDetails | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return null;
    const details = Object.fromEntries(FIELDS.map((f) => [f, typeof raw[f] === "string" ? raw[f].slice(0, 300) : ""])) as CheckoutDetails;
    return details.name || details.phone || details.address ? details : null;
  } catch {
    return null;
  }
}

export function saveCheckoutDetails(details: CheckoutDetails): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    // Not saved; nothing else depends on it
  }
}

export function clearCheckoutDetails(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear
  }
}
