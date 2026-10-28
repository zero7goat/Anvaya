import { MouseEvent } from "react";
import { Eye } from "lucide-react";

interface QuickViewButtonProps {
  productName: string;
  onQuickView: () => void;
  className?: string;
}

/**
 * Small eye button placed on a product image to open the quick-view popup.
 * It never triggers the surrounding card's navigation.
 */
export default function QuickViewButton({ productName, onQuickView, className = "" }: QuickViewButtonProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onQuickView();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Quick preview: ${productName}`}
      title="Quick preview"
      className={`z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/85 text-ink shadow-sm backdrop-blur-sm cursor-pointer opacity-85 transition-[opacity,background-color,color,box-shadow] duration-300 hover:opacity-100 hover:bg-white hover:text-black hover:shadow-md group-hover:opacity-100 focus-visible:opacity-100 ${className}`}
    >
      <Eye className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
