import { useEffect, useRef, useState } from "react";
import { Icon } from "zmp-ui";
import brandGroupingUrl from "../assets/catalog/group-by-brand.png";
import categoryGroupingUrl from "../assets/catalog/group-by-category.png";
import alcoholIcon from "../assets/categories/icons/category-alcohol.png";
import bakeryIcon from "../assets/categories/icons/category-bakery.png";
import biscuitsIcon from "../assets/categories/icons/category-biscuits.png";
import bottledDrinksIcon from "../assets/categories/icons/category-bottled-drinks.png";
import candyIcon from "../assets/categories/icons/category-candy.png";
import dairyIcon from "../assets/categories/icons/category-dairy.png";
import deliIcon from "../assets/categories/icons/category-deli.png";
import electronicsIcon from "../assets/categories/icons/category-electronics.png";
import frozenIcon from "../assets/categories/icons/category-frozen.png";
import healthcareIcon from "../assets/categories/icons/category-healthcare.png";
import householdIcon from "../assets/categories/icons/category-household.png";
import instantNoodlesIcon from "../assets/categories/icons/category-instant-noodles.png";
import personalCareIcon from "../assets/categories/icons/category-personal-care.png";
import preparedMealIcon from "../assets/categories/icons/category-prepared-meal.png";
import produceIcon from "../assets/categories/icons/category-produce.png";
import promotionsIcon from "../assets/categories/icons/category-promotions.png";
import snacksIcon from "../assets/categories/icons/category-snacks.png";
import stationeryIcon from "../assets/categories/icons/category-stationery.png";
import tobaccoIcon from "../assets/categories/icons/category-tobacco.png";

const categoryIcons: Record<string, string> = {
  "Món ngon mỗi ngày": preparedMealIcon,
  "Đồ ăn vặt": snacksIcon,
  "Các loại bánh": bakeryIcon,
  "Các loại kẹo": candyIcon,
  "Bánh quy & bánh đóng gói": biscuitsIcon,
  "Đồ khô - Mì Gói": instantNoodlesIcon,
  "Đồ uống đóng chai": bottledDrinksIcon,
  "Sữa và các sản phẩm từ sữa": dairyIcon,
  "Kem & Đồ đông lạnh": frozenIcon,
  "Chăm sóc cá nhân": personalCareIcon,
  "Chăm sóc sức khoẻ": healthcareIcon,
  "Phụ kiện điện tử": electronicsIcon,
  "Rau củ & Trái cây tươi": produceIcon,
  "Xúc Xích & Thịt Nguội": deliIcon,
  "Đồ uống có cồn (18+)": alcoholIcon,
  "Thuốc lá (18+)": tobaccoIcon,
  "Gia dụng & Tiện ích": householdIcon,
  "Văn phòng phẩm": stationeryIcon,
  "Combo và ưu đãi": promotionsIcon,
};

export function categoryIconFor(name: string): string | undefined {
  return categoryIcons[name];
}

export interface CategoryTreeNode {
  name: string;
  path: string[];
  rank?: number | null;
  children: CategoryTreeNode[];
}

export interface CategorySelectorProps {
  groups: CategoryTreeNode[];
  availablePathKeys?: ReadonlySet<string>;
  brandOptionsByCategory?: ReadonlyMap<string, readonly (string | null)[]>;
  groupingMode?: "category" | "brand";
  selectedPath: string[];
  selectedBrand?: string | null;
  visible: boolean;
  onSelect: (path: string[]) => void;
  onSelectBrand?: (category: string, brand: string | null) => void;
  onToggleGroupingMode?: () => void;
  onClose: () => void;
}

export function CategorySelector({
  groups,
  availablePathKeys,
  brandOptionsByCategory,
  groupingMode = "category",
  selectedPath,
  selectedBrand = null,
  visible,
  onSelect,
  onSelectBrand,
  onToggleGroupingMode,
  onClose,
}: CategorySelectorProps) {
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const hasOpenedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const selectedNodeRef = useRef<HTMLButtonElement | null>(null);
  const shouldScrollSelectedRef = useRef(false);
  const selectedKey = selectedPath.join("\u0001");

  // Handle open/close animation lifecycle and prevent background page scroll
  useEffect(() => {
    if (visible) {
      setMounted(true);
      let frame = 0;
      if (hasOpenedRef.current) setShown(true);
      else frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          hasOpenedRef.current = true;
          setShown(true);
        });
      });
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        cancelAnimationFrame(frame);
        document.body.style.overflow = originalOverflow;
      };
    } else if (mounted) {
      hasOpenedRef.current = true;
      setShown(false);
      const timer = setTimeout(() => {
        hasOpenedRef.current = false;
        setMounted(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [visible, mounted]);

  useEffect(() => {
    if (!visible || !selectedKey) return;
    shouldScrollSelectedRef.current = true;
    if (!selectedKey.includes("\u0001")) return;
    const parentKeys = selectedKey.split("\u0001").slice(0, -1).map((_, index, paths) => paths.slice(0, index + 1).join("\u0001"));
    setExpandedPaths((current) => {
      const next = new Set(current);
      let changed = false;
      parentKeys.forEach((key) => {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [selectedKey, visible]);

  useEffect(() => {
    if (visible && shouldScrollSelectedRef.current && selectedNodeRef.current) {
      selectedNodeRef.current.scrollIntoView({ block: "center" });
      shouldScrollSelectedRef.current = false;
    }
  }, [expandedPaths, mounted, selectedKey, visible]);

  // Close on Escape key
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (touch) {
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dy) < 30) {
        if (dx < -50) onClose();
      }
    }
    touchStartRef.current = null;
  };

  if (!mounted) return null;

  const toggleExpanded = (path: string[]) => {
    const key = path.join("\u0001");
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderNode = (node: CategoryTreeNode) => {
    const key = node.path.join("\u0001");
    const brandOptions = groupingMode === "brand" && node.path.length === 1
      ? brandOptionsByCategory?.get(node.name)
      : undefined;
    const hasChildren = brandOptions ? brandOptions.length > 0 : node.children.length > 0;
    const expanded = expandedPaths.has(key);
    const icon = node.path.length === 1 ? categoryIconFor(node.name) : undefined;
    const available = availablePathKeys?.has(key) ?? true;
    return (
      <li key={key} className={`category-tree-node category-tree-level-${node.path.length}${available ? "" : " unavailable"}`} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
        <div className="category-tree-row">
          {hasChildren ? (
            <button
              type="button"
              className="category-tree-expand"
              aria-label={`${expanded ? "Thu gọn" : "Mở rộng"} ${node.name}`}
              disabled={!available}
              onClick={() => toggleExpanded(node.path)}
            >
              <Icon icon={expanded ? "zi-chevron-down" : "zi-chevron-right"} />
            </button>
          ) : <span className="category-tree-expand-spacer" aria-hidden="true" />}
          <button
            type="button"
            className={`category-tree-select${key === selectedKey ? " selected" : ""}`}
            aria-pressed={key === selectedKey}
            disabled={!available}
            onClick={() => onSelect(node.path)}
            ref={key === selectedKey ? selectedNodeRef : null}
          >
            {icon && <img className="category-tree-icon" src={icon} alt="" aria-hidden="true" />}
            <span>{node.name}</span>
          </button>
        </div>
        {hasChildren && expanded && <ul className="category-tree-children" role="group">{
          brandOptions
            ? brandOptions.map((brand) => {
              const brandKey = `${key}\u0001brand:${brand ?? "\u0000"}`;
              const selected = selectedPath[0] === node.name && selectedBrand === brand;
              return <li key={brandKey} className="category-tree-node category-tree-level-2" role="treeitem">
                <div className="category-tree-row">
                  <span className="category-tree-expand-spacer" aria-hidden="true" />
                  <button
                    type="button"
                    className={`category-tree-select${selected ? " selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => onSelectBrand?.(node.name, brand)}
                    ref={selected ? selectedNodeRef : null}
                  ><span>{brand ?? "Khác"}</span></button>
                </div>
              </li>;
            })
            : node.children.map(renderNode)
        }</ul>}
      </li>
    );
  };

  return (
    <div
      className={`category-drawer-root ${!visible ? "category-drawer--closing" : shown || hasOpenedRef.current ? "category-drawer--open" : "category-drawer--entering"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Chọn danh mục"
      aria-hidden={!visible || undefined}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
    >
      <div
        className="category-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="category-drawer-panel"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <header className="category-drawer-header">
          <div className="category-drawer-title-group">
            <Icon icon="zi-list-2" className="category-drawer-title-icon" />
            <h2 className="category-drawer-title">Chọn danh mục</h2>
          </div>
          {onToggleGroupingMode && <button
            type="button"
            className="category-drawer-grouping-btn"
            onClick={onToggleGroupingMode}
            aria-label={`Chuyển sang nhóm theo ${groupingMode === "category" ? "Thương hiệu" : "Danh mục"}`}
            aria-pressed={groupingMode === "brand"}
          ><img src={groupingMode === "category" ? categoryGroupingUrl : brandGroupingUrl} alt="" aria-hidden="true" /></button>}
        </header>
        <div
          className="category-sheet-content"
          aria-label="Danh sách danh mục"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className={`category-tree-all${selectedPath.length === 0 ? " selected" : ""}`}
            aria-label="Trang chủ"
            aria-pressed={selectedPath.length === 0}
            onClick={() => onSelect([])}
          ><Icon icon="zi-home" className="category-tree-home-icon" aria-hidden="true" /><span>Trang chủ</span></button>
          <ul className="category-tree" role="tree" aria-label="Cây danh mục">{groups.map(renderNode)}</ul>
        </div>
      </div>
    </div>
  );
}
