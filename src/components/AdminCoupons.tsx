import { FormEvent, useEffect, useState } from "react";
import { Edit2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { checkCouponForm, couponAdmin, type Coupon, type CouponForm, type CouponKind } from "../services/couponAdmin";
import { formatINR } from "../utils/productDisplay";

const EMPTY_FORM: CouponForm = { code: "", title: "", kind: "percent", value: "", minSpend: "", enabled: true };

const toForm = (c: Coupon): CouponForm => ({
  code: c.code,
  title: c.title,
  kind: c.kind,
  value: String(c.value),
  minSpend: c.min_spend ? String(c.min_spend) : "",
  enabled: c.enabled,
});

/**
 * Coupons section of the admin dashboard: everything here is saved straight to
 * public.offers, and checkout uses it from the next price check. The coupon box appears
 * in customers' bags only while at least one coupon is switched on.
 */
export default function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // null: form closed; "new": adding; a code: editing that coupon
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  // The coupon waiting for a second click to delete. Asked on the page, not with a browser
  // pop-up, because some browsers block pop-ups and the delete would silently do nothing.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const load = async () => {
    const result = await couponAdmin.list();
    if (result.ok) {
      setCoupons(result.coupons);
      setLoadError("");
    } else {
      setLoadError(result.error);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openForm = (coupon?: Coupon) => {
    setEditing(coupon ? coupon.code : "new");
    setForm(coupon ? toForm(coupon) : EMPTY_FORM);
    setFormError("");
    setNotice(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const checked = checkCouponForm(form);
    if (!checked.ok) {
      setFormError(checked.error);
      return;
    }
    setBusy(true);
    setFormError("");
    const result = editing === "new" ? await couponAdmin.create(checked.value) : await couponAdmin.update(checked.value);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setEditing(null);
    setNotice({ kind: "success", text: `Saved coupon ${checked.value.code}.` });
    await load();
  };

  const handleToggle = async (coupon: Coupon) => {
    if (busy) return;
    setBusy(true);
    const result = await couponAdmin.update({ ...coupon, enabled: !coupon.enabled });
    setBusy(false);
    setNotice(
      result.ok
        ? { kind: "success", text: `${coupon.code} is now ${coupon.enabled ? "off" : "on"}.` }
        : { kind: "error", text: result.error }
    );
    await load();
  };

  const handleDelete = async (coupon: Coupon) => {
    if (busy) return;
    setBusy(true);
    const result = await couponAdmin.remove(coupon.code);
    setBusy(false);
    setConfirmingDelete(null);
    setNotice(result.ok ? { kind: "success", text: `Deleted coupon ${coupon.code}.` } : { kind: "error", text: result.error });
    await load();
  };

  const set = (changes: Partial<CouponForm>) => setForm((prev) => ({ ...prev, ...changes }));

  return (
    <div className="space-y-6" id="admin-coupons">
      <div className="panel p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="heading-card">Coupons</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Customers see the coupon box in their bag only while at least one coupon is on.
          </p>
        </div>
        <button type="button" onClick={() => openForm()} className="btn btn-primary btn-sm shrink-0">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Coupon</span>
        </button>
      </div>

      {notice && (
        <div className={`status-note status-note-${notice.kind === "error" ? "danger" : "success"}`} role={notice.kind === "error" ? "alert" : "status"}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="btn-icon btn-icon-sm" aria-label="Dismiss message">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSave} className="panel p-5 space-y-4" id="admin-coupon-form">
          <h3 className="heading-label">{editing === "new" ? "Add coupon" : `Edit ${editing}`}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="coupon-code" className="field-label">Code</label>
              <input
                id="coupon-code"
                type="text"
                value={form.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                readOnly={editing !== "new"}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="field uppercase"
                aria-describedby="coupon-code-help"
              />
              <p id="coupon-code-help" className="field-help">
                {editing === "new" ? "3 to 30 letters or numbers." : "A code can't be changed. Delete it and add a new one instead."}
              </p>
            </div>
            <div>
              <label htmlFor="coupon-title" className="field-label">Description (admin only)</label>
              <input id="coupon-title" type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} className="field" />
            </div>
            <div>
              <label htmlFor="coupon-kind" className="field-label">Discount type</label>
              <select id="coupon-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value as CouponKind })} className="field">
                <option value="percent">Percentage off</option>
                <option value="flat">Fixed amount off (₹)</option>
              </select>
            </div>
            <div>
              <label htmlFor="coupon-value" className="field-label">{form.kind === "percent" ? "Discount (%)" : "Discount (₹)"}</label>
              <input id="coupon-value" type="number" min="1" step="1" inputMode="numeric" value={form.value} onChange={(e) => set({ value: e.target.value })} className="field" />
            </div>
            <div>
              <label htmlFor="coupon-min" className="field-label">Minimum spend (₹)</label>
              <input id="coupon-min" type="number" min="0" step="1" inputMode="numeric" value={form.minSpend} onChange={(e) => set({ minSpend: e.target.value })} className="field" placeholder="No minimum" />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink sm:self-end sm:pb-2 cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="checkbox" />
              <span>Coupon is on</span>
            </label>
          </div>
          {formError && <p className="field-error" role="alert">{formError}</p>}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} disabled={busy} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-primary">{busy ? "Saving…" : "Save Coupon"}</button>
          </div>
        </form>
      )}

      {confirmingDelete && (
        <div className="status-note status-note-danger" role="alert" id="admin-coupon-delete-confirm">
          <span className="flex-1">Delete coupon {confirmingDelete}? Past orders keep their discount. This can't be undone.</span>
          <button type="button" onClick={() => setConfirmingDelete(null)} disabled={busy} className="btn btn-secondary btn-sm">Keep</button>
          <button
            type="button"
            onClick={() => {
              const coupon = coupons?.find((c) => c.code === confirmingDelete);
              if (coupon) void handleDelete(coupon);
            }}
            disabled={busy}
            aria-busy={busy}
            className="btn btn-primary btn-sm"
          >
            {busy ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      )}

      {loadError ? (
        <div className="status-note status-note-danger" role="alert">
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={() => void load()} className="btn btn-secondary btn-sm">Retry</button>
        </div>
      ) : coupons === null ? (
        <div className="panel p-8 text-center text-sm text-muted" role="status">
          <RefreshCw className="w-4 h-4 animate-spin inline-block mr-2" aria-hidden="true" />
          Loading coupons…
        </div>
      ) : coupons.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted">No coupons yet.</div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ds-table ds-table-stack">
              <thead>
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Minimum Spend</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {coupons.map((c) => (
                  <tr key={c.code}>
                    <td data-label="" className="py-3 px-4">
                      <div className="font-semibold text-neutral-900">{c.code}</div>
                      {c.title && <div className="text-xs text-neutral-400">{c.title}</div>}
                    </td>
                    <td data-label="Discount" className="py-3 px-4 tabular-nums">
                      {c.kind === "percent" ? `${c.value}% off` : `${formatINR(c.value)} off`}
                    </td>
                    <td data-label="Minimum Spend" className="py-3 px-4 tabular-nums">
                      {c.min_spend ? formatINR(c.min_spend) : "None"}
                    </td>
                    <td data-label="Status" className="py-3 px-4">
                      <span className={`badge ${c.enabled ? "badge-success" : "badge-neutral"}`}>{c.enabled ? "On" : "Off"}</span>
                    </td>
                    <td data-label="Actions" className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => void handleToggle(c)} disabled={busy} className="btn btn-secondary btn-sm">
                          {c.enabled ? "Turn Off" : "Turn On"}
                        </button>
                        <button type="button" onClick={() => openForm(c)} disabled={busy} className="btn-icon btn-icon-sm" aria-label={`Edit coupon ${c.code}`} title="Edit coupon">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => setConfirmingDelete(c.code)} disabled={busy} className="btn-icon btn-icon-sm" aria-label={`Delete coupon ${c.code}`} title="Delete coupon">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
