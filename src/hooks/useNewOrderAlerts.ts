import { useEffect, useRef, useState } from "react";
import { FreshOrderTracker, newestCreatedAt, titleWithCount, unseenOrders, type AlertableOrder } from "../services/orderAlerts";
import { formatINR } from "../utils/productDisplay";

// Remembered in this browser only (per admin device)
const SEEN_KEY = "anvaya_admin_orders_seen_at";
const SOUND_KEY = "anvaya_admin_order_sound";
const NOTIFY_KEY = "anvaya_admin_order_notifications";

const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};
const write = (key: string, value: string | undefined) => {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: the setting lasts for this visit
  }
};

export type NotificationState = "unsupported" | "off" | "on" | "blocked";

const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;

/**
 * Badge, tab title, sound and browser notifications for orders placed while the admin
 * dashboard is open (see services/orderAlerts.ts).
 *
 * - `orders` is the list the dashboard last read; `ready` is false until the first read
 *   after signing in.
 * - `watching` is true while the admin is looking at the Orders section with the page
 *   visible: new orders then count as seen straight away.
 * - `signedIn`: each sign-in starts over, so the first list read after it is only the
 *   starting point. Orders already there (even ones placed while signed out) never chime;
 *   ones placed since the admin last looked show in the badge instead.
 * - Sound and notifications start only after the admin turns them on (a click), as
 *   browsers require; the choice is remembered on this device.
 */
export function useNewOrderAlerts(orders: AlertableOrder[], ready: boolean, watching: boolean, signedIn: boolean) {
  const [seenAt, setSeenAt] = useState<string | undefined>(() => read(SEEN_KEY));
  const [soundOn, setSoundOn] = useState(() => read(SOUND_KEY) === "on");
  const [notifyWanted, setNotifyWanted] = useState(() => read(NOTIFY_KEY) === "on");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    notificationsSupported() ? Notification.permission : "unsupported"
  );
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const tracker = useRef(new FreshOrderTracker());
  const audio = useRef<AudioContext | null>(null);

  const markSeen = () => {
    const newest = newestCreatedAt(orders);
    if (!newest) return;
    setSeenAt(newest);
    write(SEEN_KEY, newest);
  };

  // First ever visit on this device: what is there already is not "new"
  useEffect(() => {
    if (ready && !seenAt) markSeen();
  }, [ready, seenAt, orders]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Looking at the Orders section: everything listed is seen
  useEffect(() => {
    if (ready && watching && pageVisible) markSeen();
  }, [ready, watching, pageVisible, orders]);

  const unseen = unseenOrders(orders, seenAt);

  // Tab title shows the count while there are unseen orders; restored when leaving
  const baseTitle = useRef("");
  useEffect(() => {
    baseTitle.current = document.title;
    return () => {
      document.title = baseTitle.current;
    };
  }, []);
  useEffect(() => {
    document.title = titleWithCount(baseTitle.current, unseen.length);
  }, [unseen.length]);

  // Browsers only allow sound after a click on the page: a remembered "on" waits for one
  useEffect(() => {
    if (!soundOn || audio.current) return;
    const unlock = () => void startAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [soundOn]);

  const startAudio = async () => {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
    } catch {
      audio.current = null; // no Web Audio: alerts stay silent
    }
  };

  const chime = () => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    // Two short soft tones
    [0, 0.22].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.22);
    });
  };

  const notify = (fresh: AlertableOrder[]) => {
    if (!notifyWanted || permission !== "granted") return;
    const title = fresh.length === 1 ? `New order ${fresh[0].reference}` : `${fresh.length} new orders`;
    const body = fresh.length === 1 ? `${formatINR(fresh[0].total)} · Cash on Delivery` : fresh.map((o) => o.reference).join(", ");
    try {
      const n = new Notification(title, { body, tag: "anvaya-new-orders", icon: "/images/logo-144.png" });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      // Some phones only allow notifications from an installed app: the badge still shows
      setPermission("unsupported");
    }
  };

  // A new sign-in starts from scratch (see signedIn above)
  useEffect(() => {
    if (!signedIn) tracker.current = new FreshOrderTracker();
  }, [signedIn]);

  // Each read of the orders: announce the ones that were not there last time, once
  useEffect(() => {
    if (!ready || !signedIn) return;
    const fresh = tracker.current.next(orders);
    if (fresh.length === 0) return;
    if (soundOn) chime();
    notify(fresh);
  }, [orders, ready]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    write(SOUND_KEY, next ? "on" : undefined);
    if (next) void startAudio().then(chime); // a sample, so the admin hears what to expect
  };

  // Asks the browser for permission only here, after the admin clicks
  const toggleNotifications = async () => {
    if (!notificationsSupported()) return;
    if (notifyWanted && permission === "granted") {
      setNotifyWanted(false);
      write(NOTIFY_KEY, undefined);
      return;
    }
    const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPermission(result);
    const on = result === "granted";
    setNotifyWanted(on);
    write(NOTIFY_KEY, on ? "on" : undefined);
  };

  const notificationState: NotificationState =
    permission === "unsupported" ? "unsupported" : permission === "denied" ? "blocked" : notifyWanted && permission === "granted" ? "on" : "off";

  return { unseenCount: unseen.length, markSeen, soundOn, toggleSound, notificationState, toggleNotifications };
}
