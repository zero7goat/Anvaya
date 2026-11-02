import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { Minus, Plus } from "lucide-react";
import { PHOTO_ASPECT, type CropArea } from "../services/imageUpload";

/**
 * Chooses the part of a photo to keep, in the 3:4 frame product photos are shown in.
 * Drag to move, pinch or use the slider to zoom. The frame always stays inside the photo,
 * so the saved photo has no empty bands.
 */
export default function PhotoCropper({
  file,
  position,
  onConfirm,
  onSkip,
}: {
  file: File;
  /** e.g. "Photo 2 of 3", when several were picked */
  position?: string;
  onConfirm: (area: CropArea) => void;
  onSkip: () => void;
}) {
  const [src, setSrc] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);

  // The photo is shown from a temporary browser address, released when this photo is done
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const zoomBy = (step: number) => setZoom((z) => Math.min(4, Math.max(1, Math.round((z + step) * 10) / 10)));

  // Rendered at the end of the page, outside the product form and its scrolling panel, so
  // dragging the photo can't scroll the form and nothing around it clips or moves it
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4 bg-ink/70" id="admin-photo-cropper">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-cropper-title"
        className="dialog-panel bg-surface w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[94vh] flex flex-col overflow-hidden rounded-none sm:rounded-xs"
      >
        <div className="px-4 sm:px-5 py-3 border-b border-line">
          <h3 id="photo-cropper-title" className="heading-card text-base">
            Choose the part to show{position ? ` · ${position}` : ""}
          </h3>
          <p className="text-xs text-muted">
            Drag to move, pinch or use the slider to zoom. Product photos are shown in this 3:4 shape on every device.
          </p>
        </div>

        {/* Phones: fills the space between header and controls. Wider: a fixed height, as
            the panel's own height comes from its content (a flex-1 area would collapse to 0) */}
        <div className="relative flex-1 min-h-[50vh] sm:flex-none sm:min-h-0 sm:h-[min(60vh,36rem)] bg-ink">

          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={4}
              aspect={PHOTO_ASPECT}
              objectFit="contain"
              showGrid
              zoomWithScroll
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          )}
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-line space-y-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => zoomBy(-0.2)} className="btn-icon" aria-label="Zoom out">
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="flex-1 accent-[var(--color-maroon-600)]"
            />
            <button type="button" onClick={() => zoomBy(0.2)} className="btn-icon" aria-label="Zoom in">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onSkip} className="btn btn-secondary">
              Skip photo
            </button>
            <button
              type="button"
              onClick={() => area && onConfirm({ x: area.x, y: area.y, width: area.width, height: area.height })}
              disabled={!area}
              className="btn btn-primary"
            >
              Use this part
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
