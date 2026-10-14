import { useEffect, useRef, useState } from "react";

import type { CatalogCampaign } from "../api.js";
import { usePresence } from "../usePresence.js";

type Slot = "header" | "popup";

function campaignImage(campaign: CatalogCampaign, slot: Slot) {
  return slot === "header" ? campaign.images.headerUrl : campaign.images.popupUrl;
}

function CampaignSlides({ campaigns, slot, paused = false, onSelect }: {
  campaigns: CatalogCampaign[];
  slot: Slot;
  paused?: boolean;
  onSelect: (campaign: CatalogCampaign) => void;
}) {
  const [index, setIndex] = useState(0);
  const [holding, setHolding] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const startX = useRef<number | null>(null);
  const currentIndex = Math.min(index, Math.max(0, campaigns.length - 1));
  const current = campaigns[currentIndex];

  useEffect(() => setIndex((value) => Math.min(value, Math.max(0, campaigns.length - 1))), [campaigns.length]);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    setReducedMotion(media.matches);
    const update = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    if (campaigns.length < 2 || paused || holding || focused || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") setIndex((value) => (value + 1) % campaigns.length);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [campaigns.length, focused, holding, paused, reducedMotion]);

  if (!current) return null;
  return <div
    className={`campaign-slides campaign-slides-${slot}`}
    role="region"
    aria-label={slot === "header" ? "Banner khuyến mại" : "Popup khuyến mại"}
    data-swipe-back-ignore
    onPointerDown={() => setHolding(true)}
    onPointerUp={() => setHolding(false)}
    onPointerCancel={() => setHolding(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onTouchStart={(event) => { startX.current = event.touches[0]?.clientX ?? null; }}
    onTouchEnd={(event) => {
      const endX = event.changedTouches[0]?.clientX;
      const distance = startX.current !== null && endX !== undefined ? endX - startX.current : 0;
      startX.current = null;
      if (Math.abs(distance) >= 40 && campaigns.length > 1)
        setIndex((value) => (value + (distance < 0 ? 1 : -1) + campaigns.length) % campaigns.length);
    }}
  >
    {campaigns.map((campaign, slideIndex) => {
      const active = slideIndex === currentIndex;
      const className = `campaign-slide${active ? " active" : ""}`;
      const slide = <img src={campaignImage(campaign, slot)!} alt={campaign.title} />;
      return campaign.productIds.length
        ? <button key={campaign.id} type="button" className={className} aria-label={campaign.title} aria-hidden={!active} tabIndex={active ? 0 : -1} onClick={() => onSelect(campaign)}>{slide}</button>
        : <div key={campaign.id} className={className} aria-label={campaign.title} aria-hidden={!active}>{slide}</div>;
    })}
    {campaigns.length > 1 && <div className="campaign-dots" aria-label="Chọn banner">
      {campaigns.map((campaign, dotIndex) => <button
        key={campaign.id}
        type="button"
        className={dotIndex === currentIndex ? "active" : ""}
        aria-label={`Banner ${dotIndex + 1}: ${campaign.title}`}
        aria-current={dotIndex === currentIndex ? "true" : undefined}
        onClick={() => setIndex(dotIndex)}
      />)}
    </div>}
  </div>;
}

export function HomeCampaignBanners({ campaigns, paused, onSelect }: {
  campaigns: CatalogCampaign[];
  paused?: boolean;
  onSelect: (campaign: CatalogCampaign) => void;
}) {
  const slides = campaigns.filter((campaign) => campaign.images.headerUrl);
  return slides.length ? <section className="home-campaign-banners"><CampaignSlides campaigns={slides} slot="header" {...(paused === undefined ? {} : { paused })} onSelect={onSelect} /></section> : null;
}

export function CampaignIcons({ campaigns, onSelect }: {
  campaigns: CatalogCampaign[];
  onSelect: (campaign: CatalogCampaign) => void;
}) {
  const icons = campaigns.filter((campaign) => campaign.images.iconUrl && campaign.productIds.length);
  if (!icons.length) return null;
  return <nav className="campaign-icons" aria-label="Danh mục campaign">
    {icons.map((campaign) => <button type="button" key={campaign.id} onClick={() => onSelect(campaign)}>
      <img src={campaign.images.iconUrl} alt="" />
      <span>{campaign.title}</span>
    </button>)}
  </nav>;
}

export function CampaignPopup({ campaigns, visible = true, onClose, onSelect }: {
  campaigns: CatalogCampaign[];
  visible?: boolean;
  onClose: () => void;
  onSelect: (campaign: CatalogCampaign) => void;
}) {
  const slides = campaigns.filter((campaign) => campaign.images.popupUrl);
  const presence = usePresence(visible && slides.length > 0, 200);
  if (!presence.mounted) return null;
  return <div className={`campaign-popup-backdrop${presence.active && visible ? " motion-visible" : ""}`} role="presentation" aria-hidden={!visible} ref={(node) => { if (node) node.inert = !visible; }} data-swipe-back-ignore onPointerDown={(event) => { if (visible && event.target === event.currentTarget) onClose(); }}>
    <section className="campaign-popup" role="dialog" aria-modal="true" aria-label="Khuyến mại">
      <button type="button" className="campaign-popup-close" aria-label="Đóng popup" onClick={onClose}>×</button>
      <CampaignSlides campaigns={slides} slot="popup" onSelect={onSelect} />
    </section>
  </div>;
}
