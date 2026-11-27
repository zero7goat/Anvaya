import { ReactNode } from "react";

/**
 * Shared homepage section heading: small eyebrow, serif title, and an optional
 * action (a "view all" link or carousel controls) aligned to the right.
 */
export default function SectionHeader({
  eyebrow,
  title,
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-7 sm:mb-9">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 id={id} className="heading-section">
          {title}
        </h2>
        <span className="section-rule" aria-hidden="true" />
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
