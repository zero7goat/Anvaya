/**
 * Filling the checkout address for the shopper:
 *  - from their location (only after the browser's own permission prompt): the position is
 *    looked up with OpenStreetMap's Nominatim service, which returns the PIN code, city and state;
 *  - from a typed PIN code: India Post's public PIN code service returns the district and state.
 * Both are free public services with no key. Neither result is ever required: a failure just
 * leaves the fields for the shopper to type. Nothing is stored.
 */

export type FoundAddress = { pincode?: string; city?: string; state?: string };

const PIN = /^[1-9][0-9]{5}$/;
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/** Reads Nominatim's reverse lookup reply (format=jsonv2, addressdetails=1) */
export function parseReverseGeocode(data: unknown): FoundAddress | null {
  if (typeof data !== "object" || data === null) return null;
  const address = (data as { address?: Record<string, unknown> }).address;
  if (!address || text(address.country_code)?.toLowerCase() !== "in") return null;
  const postcode = text(address.postcode)?.replace(/\s+/g, "");
  const found: FoundAddress = {
    pincode: postcode && PIN.test(postcode) ? postcode : undefined,
    city: text(address.city) ?? text(address.town) ?? text(address.village) ?? text(address.state_district) ?? text(address.county),
    state: text(address.state),
  };
  return found.pincode || found.city || found.state ? found : null;
}

/** Reads India Post's PIN code reply: [{ Status, PostOffice: [{ District, State }] }] */
export function parsePincodeReply(data: unknown): FoundAddress | null {
  const first = Array.isArray(data) ? data[0] : null;
  if (!first || first.Status !== "Success" || !Array.isArray(first.PostOffice) || first.PostOffice.length === 0) return null;
  const office = first.PostOffice[0] as Record<string, unknown>;
  const city = text(office.District);
  const state = text(office.State);
  return city || state ? { city, state } : null;
}

const fetchJson = async (url: string, timeoutMs: number): Promise<unknown> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

const pincodeCache = new Map<string, FoundAddress | null>();

/** City and state for a 6-digit PIN code, or null when unknown or the service can't be reached */
export async function lookupPincode(pincode: string): Promise<FoundAddress | null> {
  if (!PIN.test(pincode)) return null;
  if (pincodeCache.has(pincode)) return pincodeCache.get(pincode)!;
  try {
    const found = parsePincodeReply(await fetchJson(`https://api.postalpincode.in/pincode/${pincode}`, 6000));
    pincodeCache.set(pincode, found);
    return found;
  } catch {
    return null;
  }
}

export type LocateResult =
  | { ok: true; address: FoundAddress }
  | { ok: false; reason: "unsupported" | "denied" | "unavailable" | "not_found" };

/** Asks the browser for the shopper's position (it shows its own permission prompt), then looks up the address */
export async function locateAddress(): Promise<LocateResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return { ok: false, reason: "unsupported" };
  let position: GeolocationPosition;
  try {
    position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 })
    );
  } catch (error) {
    const code = (error as GeolocationPositionError)?.code;
    return { ok: false, reason: code === 1 ? "denied" : "unavailable" };
  }
  const { latitude, longitude } = position.coords;
  try {
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en" +
      `&lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}`;
    const address = parseReverseGeocode(await fetchJson(url, 8000));
    return address ? { ok: true, address } : { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Whether the browser has already been told yes / no about location ("prompt" when it will ask) */
export async function locationPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return status ? (status.state as "granted" | "denied" | "prompt") : "unknown";
  } catch {
    return "unknown";
  }
}
