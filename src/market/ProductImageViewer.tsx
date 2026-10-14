import { useEffect, useState } from "react";
import { Icon } from "zmp-ui";

interface ProductImageViewerProps {
  visible: boolean;
  images: Array<{ url: string } | string>;
  fallbackImage?: string | null;
  productName: string;
  initialIndex?: number;
  onClose: () => void;
}

export function ProductImageViewer({
  visible,
  images,
  fallbackImage,
  productName,
  initialIndex = 0,
  onClose,
}: ProductImageViewerProps) {
  const imageUrls: string[] = images.length > 0
    ? images.map((img) => (typeof img === "string" ? img : img.url)).filter(Boolean)
    : fallbackImage
      ? [fallbackImage]
      : [];

  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(Math.min(initialIndex, Math.max(0, imageUrls.length - 1)));
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [visible, initialIndex, imageUrls.length]);

  if (!visible || imageUrls.length === 0) return null;

  const currentUrl = imageUrls[currentIndex] ?? imageUrls[0];
  const hasMultiple = imageUrls.length > 1;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      className="product-image-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Xem ảnh ${productName}`}
      onClick={onClose}
    >
      <div className="product-image-viewer-header" onClick={(e) => e.stopPropagation()}>
        <div className="product-image-viewer-title">
          <h3>{productName}</h3>
          {hasMultiple && (
            <span className="product-image-viewer-counter">
              {currentIndex + 1} / {imageUrls.length}
            </span>
          )}
        </div>
      </div>

      <div className="product-image-viewer-body" onClick={(e) => e.stopPropagation()}>
        {hasMultiple && (
          <button
            className="product-image-viewer-nav prev"
            onClick={handlePrev}
            aria-label="Ảnh trước"
          >
            <Icon icon="zi-chevron-left" />
          </button>
        )}

        <div className="product-image-viewer-content" onClick={onClose}>
          <img
            src={currentUrl}
            alt={`${productName} - ảnh ${currentIndex + 1}`}
            className="product-image-viewer-img"
          />
        </div>

        {hasMultiple && (
          <button
            className="product-image-viewer-nav next"
            onClick={handleNext}
            aria-label="Ảnh tiếp theo"
          >
            <Icon icon="zi-chevron-right" />
          </button>
        )}
      </div>

      {hasMultiple && (
        <div className="product-image-viewer-dots" onClick={(e) => e.stopPropagation()}>
          {imageUrls.map((_, idx) => (
            <button
              key={idx}
              className={`product-image-viewer-dot${idx === currentIndex ? " active" : ""}`}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Chuyển tới ảnh ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
