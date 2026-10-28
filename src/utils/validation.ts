// Checkout field rules, kept free of imports so they can be unit tested directly

// Indian mobile number: 10 digits starting 6-9, allowing a +91 / 0 prefix and spaces or
// dashes. Returns the bare 10-digit number, or null when it is not valid.
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

// 6-digit Indian PIN code (never starts with 0)
export const isValidPincode = (input: string) => /^[1-9]\d{5}$/.test(input.trim());

export const isValidEmail = (input: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
