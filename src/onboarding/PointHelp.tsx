// Режим «что это?»: курсор-справочник по интерфейсу. Наведение
// подсвечивает ближайший контрол с карточкой (реестр cards.ts), клик
// показывает карточку — сами контролы НЕ нажимаются: изучение не
// правит патч. Esc или клик мимо — выход; из карточки можно прыгнуть
// в гид, где про этот контрол рассказывают по шагам.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HelpCard } from './cards';
import { cardOf } from './cards';
import { cardPosition } from './Onboarding';
import { launchGuide } from './guides';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SIDES: Record<string, string[]> = {
  bottom: ['bottom', 'right', 'left', 'top'],
  top: ['top', 'right', 'left', 'bottom'],
};

/** Inner guide anchors may have no card; use the nearest documented control. */
function helpTarget(target: Element | null): Element | null {
  let element = target?.closest('[data-ob]');
  while (element) {
    if (cardOf(element.getAttribute('data-ob'))) return element;
    element = element.parentElement?.closest('[data-ob]');
  }
  return null;
}

export function PointHelp({ onExit }: { onExit: () => void }) {
  const [hover, setHover] = useState<{ key: string; rect: Rect; element: Element } | null>(null);
  const [sel, setSel] = useState<{ key: string; rect: Rect; element: Element } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState<Rect>({ left: 0, top: 0, width: 360, height: 140 });

  const rectOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };

  // Наведение: подсвечиваем только контролы с карточкой — остальное
  // не реагирует, режим тихий.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = helpTarget(e.target instanceof Element ? e.target : null);
      const key = el?.getAttribute('data-ob') ?? null;
      const card = cardOf(key);
      if (!el || !card) {
        setHover(null);
        return;
      }
      setHover((prev) => {
        const rect = rectOf(el);
        return prev && prev.element === el ? prev : { key: key as string, rect, element: el };
      });
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // Клик: глушим АКТИВАЦИЮ контролов на capture (до React) — mousedown
  // один не годится: React-обработчики сидят на click/pointer-событиях.
  // Логика (карточка/выход) — на pointerdown: preventDefault на нём
  // подавляет совместимые mouse-события, так что это единственная
  // точка, где клик виден целиком. Остальное — чистый swallow.
  useEffect(() => {
    const inCard = (e: Event) => !!cardRef.current && e.composedPath().includes(cardRef.current);
    const onPointerDown = (e: PointerEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (inCard(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = helpTarget(e.target instanceof Element ? e.target : null);
      const key = el?.getAttribute('data-ob') ?? null;
      if (el && cardOf(key)) {
        setSel({ key: key as string, rect: rectOf(el), element: el });
      } else {
        onExit();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (sel) setSel(null);
        else onExit();
        return;
      }
      // Пока режим жив — кроме F1 (вход/выход), клавиши до контролов не идут
      if (e.key !== 'F1') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const swallow = (e: Event) => {
      if (document.querySelector('dialog[open]')) return;
      if (inCard(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const events = ['mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'pointerup', 'touchstart', 'touchend'];
    document.addEventListener('pointerdown', onPointerDown, true);
    events.forEach((n) => document.addEventListener(n, swallow, true));
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      events.forEach((n) => document.removeEventListener(n, swallow, true));
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onExit, sel]);

  // Подсветка ездит за вёрсткой (скролл, панели).
  useEffect(() => {
    const place = () => {
      setHover((h) => {
        if (!h) return h;
        const el = h.element.isConnected ? h.element : null;
        return el ? { ...h, rect: rectOf(el) } : null;
      });
      setSel((s) => {
        if (!s) return s;
        const el = s.element.isConnected ? s.element : null;
        return el ? { ...s, rect: rectOf(el) } : null;
      });
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const iv = window.setInterval(place, 400);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.clearInterval(iv);
    };
  }, []);

  // Размер карточки нужен до позиционирования.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el && (el.offsetWidth !== cardSize.width || el.offsetHeight !== cardSize.height)) {
      setCardSize({ left: 0, top: 0, width: el.offsetWidth, height: el.offsetHeight });
    }
  });

  const showGuide = useCallback((card: HelpCard) => {
    if (!card.guide) return;
    const trackId = sel?.element.closest('[data-track-id]')?.getAttribute('data-track-id');
    launchGuide(card.guide.id, { step: card.guide.step, scope: trackId ? `[data-track-id="${CSS.escape(trackId)}"]` : undefined });
  }, [sel]);

  const card = sel ? cardOf(sel.key) : null;
  const pos = sel ? cardPosition(sel.rect, cardSize, SIDES.bottom) : null;

  return (
    <div className="ph-overlay">
      {hover && (
        <div
          className="ph-hole"
          style={{ left: hover.rect.left - 3, top: hover.rect.top - 3, width: hover.rect.width + 6, height: hover.rect.height + 6 }}
        />
      )}
      <div className="ph-badge">режим «что это?» — тыкни в контрол · Esc — выйти</div>
      {sel && card && pos && (
        <div className="ob-card ph-card" ref={cardRef} style={{ left: pos.left, top: pos.top }}>
          <div className="ob-cap">
            <b>{card.title}</b>
            <button className="ob-x" title="Закрыть карточку (режим живёт)" onClick={() => setSel(null)}>
              ✕
            </button>
          </div>
          <p className="ob-say">{card.text}</p>
          <div className="ob-foot">
            {card.guide ? (
              <button className="ob-next" onClick={() => showGuide(card)}>
                показать в гиде ▸
              </button>
            ) : (
              <span className="ob-esc">Esc — закрыть</span>
            )}
            <span className="spacer" />
            <button className="ob-skip" onClick={onExit}>
              выйти из режима
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
