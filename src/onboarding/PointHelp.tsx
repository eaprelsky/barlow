// Режим «что это?»: курсор-справочник по интерфейсу. Наведение
// подсвечивает ближайший контрол с карточкой (реестр cards.ts), клик
// показывает карточку — сами контролы НЕ нажимаются: изучение не
// правит патч. Esc закрывает карточку, затем режим; из карточки можно прыгнуть
// в гид, где про этот контрол рассказывают по шагам.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HelpCard } from './cards';
import { resolveHelp, type HelpMatch } from './helpResolver';
import { createPortal } from 'react-dom';
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

function rectOf(el: Element): Rect {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function PointHelp({ onExit }: { onExit: () => void }) {
  const [hover, setHover] = useState<{ key: string; rect: Rect; element: Element; card: HelpCard } | null>(null);
  const [sel, setSel] = useState<{ key: string; rect: Rect; element: Element; card: HelpCard } | null>(null);
  const [host, setHost] = useState<Element>(document.querySelector('dialog[open]') ?? document.body);
  const focusBefore = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const previous = focusBefore.current;
    document.documentElement.classList.add('point-help-active');
    const observer = new MutationObserver(() => setHost([...document.querySelectorAll('dialog[open]')].at(-1) ?? document.body));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => { observer.disconnect(); document.documentElement.classList.remove('point-help-active'); if (previous?.isConnected) previous.focus(); };
  }, []);
  const selectMatch = useCallback((match: HelpMatch) => setSel({ ...match, rect: rectOf(match.element) }), []);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardSize, setCardSize] = useState<Rect>({ left: 0, top: 0, width: 360, height: 140 });



  // Наведение: подсвечиваем только контролы с карточкой — остальное
  // не реагирует, режим тихий.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const match = resolveHelp(e.target instanceof Element ? e.target : null);
      if (!match) { setHover(null); return; }
      setHover(prev => prev?.element === match.element ? prev : { ...match, rect: rectOf(match.element) });
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
    const inCard = (e: Event) => e.target instanceof Element && !!e.target.closest('.ph-card,.ph-badge,[data-help-toggle]');
    const onPointerDown = (e: PointerEvent) => {
      if (inCard(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const match = resolveHelp(e.target instanceof Element ? e.target : null);
      if (match) selectMatch(match);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (sel) setSel(null);
        else onExit();
        return;
      }
      if (inCard(e)) return;
      if (e.key === 'Tab') return;
      if (e.key === 'Enter' || e.key === ' ') {
        const match = resolveHelp(document.activeElement);
        if (match) selectMatch(match);
      }
      // Пока режим жив — кроме F1 (вход/выход), клавиши до контролов не идут
      if (e.key !== 'F1') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const swallow = (e: Event) => {
      if (inCard(e)) return;
      if (e.type === 'wheel' && !(e.target instanceof Element && e.target.closest('input,[role=slider]'))) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const events = ['beforeinput', 'paste', 'cut', 'drop', 'dragstart', 'pointermove', 'wheel', 'input', 'change', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'pointerup', 'touchstart', 'touchend'];
    document.addEventListener('pointerdown', onPointerDown, true);
    events.forEach((n) => document.addEventListener(n, swallow, { capture: true, passive: false }));
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      events.forEach((n) => document.removeEventListener(n, swallow, true));
      document.removeEventListener('keydown', onKey, true);
    };
  }, [onExit, sel, selectMatch]);

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
  }, [sel, cardSize.width, cardSize.height]);

  const showGuide = useCallback((card: HelpCard) => {
    if (!card.guide) return;
    const trackId = sel?.element.closest('[data-track-id]')?.getAttribute('data-track-id');
    launchGuide(card.guide.id, { step: card.guide.step, scope: sel?.element.closest('[data-guide-scope]')?.getAttribute('data-guide-scope') ?? (trackId ? `[data-track-id="${CSS.escape(trackId)}"]` : undefined) });
  }, [sel]);

  const card = sel?.card;
  const pos = sel ? cardPosition(sel.rect, cardSize, SIDES.bottom) : null;

  const selectedElement = sel?.element;
  useEffect(() => { if (selectedElement) cardRef.current?.focus(); }, [selectedElement]);

  return createPortal(
    <div className="ph-overlay">
      {hover && (
        <div
          className="ph-hole"
          style={{ left: hover.rect.left - 3, top: hover.rect.top - 3, width: hover.rect.width + 6, height: hover.rect.height + 6 }}
        />
      )}
      <div className="ph-badge"><span>Что это? Выбери элемент · Esc — выйти</span><button onClick={onExit} aria-label="Выйти из справки">✕</button></div>
      {sel && card && pos && (
        <div className="ob-card ph-card" role="dialog" aria-label={card.title} tabIndex={-1} ref={cardRef} style={{ left: pos.left, top: pos.top }}>
          <div className="ob-cap">
            <b>{card.title}</b>
            <button className="ob-x" title="Закрыть карточку (режим живёт)" onClick={() => setSel(null)}>
              ✕
            </button>
          </div>
          <p className="ob-say">{card.text}</p>
          {card.how && <p>{card.how}</p>}
          {card.example && <p className="ph-example"><b>Попробуй: </b>{card.example}</p>}
          <div className="ob-foot">
            {card.guide && host === document.body ? (
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
    </div>, host
  );
}
