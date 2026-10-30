import { useEffect } from "react";
import { CollectionType } from "../types";
import { BOUTIQUE_CONFIG } from "../config";

interface NotFoundPageProps {
  id: string;
  eyebrow: string;
  title: string;
  message: string;
  // Browser tab title while shown; leave out when the page sets its own
  documentTitle?: string;
  onNavigateHome: () => void;
  onNavigateCollection: (collection: CollectionType) => void;
}

/**
 * "Not found" message with ways back into the shop. Used for unknown addresses and for
 * product links that no longer match a piece. Search engines are asked not to index it.
 */
export default function NotFoundPage({ id, eyebrow, title, message, documentTitle, onNavigateHome, onNavigateCollection }: NotFoundPageProps) {
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    const previousTitle = document.title;
    if (documentTitle) document.title = documentTitle;
    return () => {
      robots.remove();
      if (documentTitle) document.title = previousTitle;
    };
  }, [documentTitle]);

  return (
    <div className="bg-canvas min-h-[60vh] flex items-center justify-center px-4 py-24" id={id}>
      <div className="max-w-md text-center">
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="heading-title mb-3">{title}</h1>
        <p className="text-body mb-8">{message}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => onNavigateCollection("alankritha")} className="btn btn-primary">
            {BOUTIQUE_CONFIG.collections.alankritha.name} Kurtas
          </button>
          <button onClick={() => onNavigateCollection("ayanaa")} className="btn btn-primary">
            {BOUTIQUE_CONFIG.collections.ayanaa.name} Sarees
          </button>
          <button onClick={onNavigateHome} className="btn btn-secondary">
            Home
          </button>
        </div>
      </div>
    </div>
  );
}
