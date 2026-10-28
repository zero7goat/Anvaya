import { ReactNode } from "react";

/** Pieces shared by the customer sign-in page and the admin sign-in page. */

export const BOX_INPUT =
  "w-full min-w-0 bg-transparent text-base sm:text-lg text-ink placeholder:text-muted/50 outline-none py-0.5 disabled:opacity-60";

/**
 * White input box with its label inside, above the value. The border stays visible so
 * the box reads clearly against the cream page on small screens too.
 */
export function LabelledBox({
  label,
  htmlFor,
  action,
  children,
}: {
  label: string;
  htmlFor: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-h-[60px] bg-surface border border-line-strong px-4 sm:px-5 py-2.5 transition-colors focus-within:border-maroon-700">
      <div className="flex-1 min-w-0">
        <label htmlFor={htmlFor} className="block text-xs text-muted">
          {label}
        </label>
        {children}
      </div>
      {action}
    </div>
  );
}

/** Scalloped dome border for the bottom edge of a sign-in area (parent must be `relative`). */
export function DomeBorder({ patternId }: { patternId: string }) {
  return (
    <svg className="absolute bottom-0 left-0 w-full h-9 text-maroon-700" aria-hidden="true">
      <defs>
        <pattern id={patternId} width="44" height="36" patternUnits="userSpaceOnUse">
          <path d="M0 36 C8 36 9 26 15 21 C19 18 21 13 22 6 C23 13 25 18 29 21 C35 26 36 36 44 36 Z" fill="currentColor" />
          <circle cx="22" cy="4" r="2" className="fill-gold-500" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
