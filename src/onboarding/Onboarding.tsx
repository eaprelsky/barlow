// Интерактивный онбординг: подсветка элемента + карточка «что делать».
// Шаг-действие (expect): гид ждёт клик по подсвеченному, клики мимо
// перехватывает (карточка встряхивается) — newbie физически не может
// пойти не туда. Шаг-чтение: листается «далее», клик мимо карточки —
// мгновенный выход. Esc и ✕ закрывают всегда.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GUIDES, guideById, isGuideSeen, launchGuide, markInvited } from './guides';
import type { Guide, GuideStart } from './guides';

export interface GuideRun {
  guideId: string;
  step: number;
  /** Селектор-зона («[data-track-id="t12"]») — цели ищутся внутри неё. */
  scope?: string;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const sameRect = (a: Rect | null, b: Rect): boolean =>
  !!a &&
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

function findTarget(run: GuideRun, target?: string): HTMLElement | null {
  if (!target) return null;
  if (run.scope) {
    const scoped = document.querySelector(`${run.scope} ${target}`);
    if (scoped) return scoped as HTMLElement;
  }
  return document.querySelector(target) as HTMLElement | null;
}

/** Карточка шага: где встать относительно подсвеченной цели.
 *  Пробуем стороны по порядку, берём первую, что влезла целиком;
 *  ни одна не влезла — прижимаем preferred к краям экрана. */
function cardPosition(hole: Rect, size: Rect, sides: string[]): { left: number; top: number } {
  const m = 10; // зазор до цели
  const edge = 12; // поля экрана
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = hole.left + hole.width / 2;
  const cy = hole.top + hole.height / 2;
  const rawOf = (side: string) =>
    side === 'top'
      ? { left: cx - size.width / 2, top: hole.top - size.height - m }
      : side === 'left'
        ? { left: hole.left - size.width - m, top: cy - size.height / 2 }
        : side === 'right'
          ? { left: hole.left + hole.width + m, top: cy - size.height / 2 }
          : { left: cx - size.width / 2, top: hole.top + hole.height + m };
  const fits = (p: { left: number; top: number }) =>
    p.left >= edge &&
    p.top >= edge &&
    p.left + size.width <= vw - edge &&
    p.top + size.height <= vh - edge;
  // Ни одна сторона не влезла — прижимаем предпочитаемую к краям экрана
  // (последняя пробная встала бы наперекос, накрыв цель).
  const fallback = rawOf(sides[0]);
  for (const side of sides) {
    const raw = rawOf(side);
    if (fits(raw)) return raw;
  }
  return {
    left: Math.max(edge, Math.min(fallback.left, vw - size.width - edge)),
    top: Math.max(edge, Math.min(fallback.top, vh - size.height - edge)),
  };
}

/** Порядок попыток: предпочитаемая сторона, потом остальные. */
const SIDES: Record<string, string[]> = {
  bottom: ['bottom', 'right', 'left', 'top'],
  top: ['top', 'right', 'left', 'bottom'],
  left: ['left', 'bottom', 'top', 'right'],
  right: ['right', 'bottom', 'top', 'left'],
};

export function Onboarding({
  run,
  onDone,
  onStep,
  onOpenPanel,
}: {
  run: GuideRun;
  onDone: () => void;
  /** delta: +1 вперёд, −1 назад. */
  onStep: (delta: number) => void;
  /** Раскрыть панель, спрятанную за кнопкой шапки (шаг.open). */
  onOpenPanel?: (what: string) => void;
}) {
  const guide = guideById(run.guideId);
  const step = guide?.steps[Math.min(run.step, guide.steps.length - 1)];
  const [hole, setHole] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<Rect>({ left: 0, top: 0, width: 380, height: 150 });
  const [, bumpSize] = useState(0);
  // Один шаг — одно завершение: mousedown и click не должны задвоить.
  const doneRef = useRef(false);
  const [shakeN, setShakeN] = useState(0);
  // Тряска живёт 400 мс: класс снимается, чтобы анимация могла повториться.
  useEffect(() => {
    if (shakeN === 0) return;
    const t = window.setTimeout(() => setShakeN(0), 400);
    return () => window.clearTimeout(t);
  }, [shakeN]);

  const place = useCallback(() => {
    if (!step) return;
    const el = findTarget(run, step.target);
    if (!el) {
      setMissing(true);
      setHole(null);
      return;
    }
    setMissing(false);
    const r = el.getBoundingClientRect();
    setHole((prev) => (sameRect(prev, r) ? prev : { left: r.left, top: r.top, width: r.width, height: r.height }));
  }, [run, step]);

  // Размер карточки нужен до позиционирования: замеряем каждый кадр рендера.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (sizeRef.current.width !== w || sizeRef.current.height !== h) {
      sizeRef.current = { left: 0, top: 0, width: w, height: h };
      bumpSize((v) => v + 1);
    }
  });

  // Замер цели: на входе в шаг, после scrollIntoView и по сдвигам вёрстки
  // (панели открываются, окна ресайзятся).
  useLayoutEffect(() => {
    if (!step) return;
    if (step.open) onOpenPanel?.(step.open);
    place();
    const el = findTarget(run, step.target);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const t1 = window.setTimeout(place, 80);
    const t2 = window.setTimeout(place, 260);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const iv = window.setInterval(place, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(iv);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place, run, step, onOpenPanel]);

  const finishStep = useCallback(() => {
    if (doneRef.current || !guide) return;
    doneRef.current = true;
    if (run.step >= guide.steps.length - 1) onDone();
    else onStep(1);
  }, [guide, onDone, onStep, run.step]);

  // Сердце интерактивности. Шаг-действие: пропускаем клики только по цели
  // (и по карточке), остальные перехватываем на capture — до React.
  // Шаг-чтение: слушаем ничего — человек волен походить по интерфейсу,
  // листается «далее». Выход всегда явный: Esc, ✕, «пропустить», «готово».
  // Цель скрыта (панель закрыта, трек свёрнут): блокировщики не ставим,
  // пользователь должен иметь возможность открыть панель — подсветка
  // появится сама.
  useEffect(() => {
    doneRef.current = false;
    if (!step || !step.expect || missing) return;
    const inCard = (e: Event) => !!cardRef.current && e.composedPath().includes(cardRef.current);
    const inTarget = (e: Event) => {
      const el = findTarget(run, step.target);
      return !!el && e.composedPath().includes(el);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (inCard(e)) return;
      if (step.expect === 'contextmenu' && e.button === 2 && inTarget(e)) return; // само завершит contextmenu
      if (step.expect === 'click' && e.button === 0 && inTarget(e)) {
        finishStep(); // событие проходит дальше — действие реально случится
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setShakeN((v) => v + 1);
    };
    const onContextMenu = (e: MouseEvent) => {
      if (inCard(e)) return;
      if (step.expect === 'contextmenu' && inTarget(e)) {
        finishStep();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!inTarget(e)) setShakeN((v) => v + 1);
    };
    const onAux = (e: MouseEvent) => {
      if (inCard(e) || inTarget(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return; // уйдёт в обычный обработчик — выход
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('auxclick', onAux, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('auxclick', onAux, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [run, step, onDone, finishStep, missing]);

  // Клавиши чтения: Esc — выйти, стрелки — шаги (на шагах-действиях
  // стрелки глушит блокировщик выше).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === 'Escape') {
        e.preventDefault();
        onDone();
      } else if (!typing && e.key === 'ArrowRight' && !step?.expect) {
        e.preventDefault();
        onStep(1);
      } else if (!typing && e.key === 'ArrowLeft' && !step?.expect) {
        e.preventDefault();
        onStep(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone, onStep, step?.expect]);

  if (!guide || !step) return null;
  const last = run.step >= guide.steps.length - 1;

  let cardPos: { left: number; top: number };
  if (missing || !hole) {
    cardPos = {
      left: Math.max(12, (window.innerWidth - sizeRef.current.width) / 2),
      top: Math.max(12, window.innerHeight * 0.32),
    };
  } else {
    cardPos = cardPosition(hole, sizeRef.current, SIDES[step.side ?? 'bottom']);
  }

  return (
    <div className="ob-overlay">
      {hole && !missing && (
        <div
          className={'ob-hole' + (step.expect ? ' waiting' : '')}
          style={{ left: hole.left - 4, top: hole.top - 4, width: hole.width + 8, height: hole.height + 8 }}
        />
      )}
      <div
        key={shakeN > 0 ? `shake-${shakeN}` : 'still'}
        className={'ob-card' + (shakeN > 0 ? ' shake' : '')}
        ref={cardRef}
        style={{ left: cardPos.left, top: cardPos.top }}
      >
        <div className="ob-cap">
          <span className="ob-num">
            {run.step + 1}/{guide.steps.length}
          </span>
          <b>{guide.title}</b>
          <button className="ob-x" title="Закончить гид (Esc)" onClick={onDone}>
            ✕
          </button>
        </div>
        <p className="ob-say">{step.say}</p>
        {step.hint && <p className="ob-sub">{step.hint}</p>}
        {missing && (
          <p className="ob-missing">
            {step.expect
              ? 'Панель этого шага скрыта — открой её, и подсветка появится. Или «пропустить».'
              : 'Панель этого шага сейчас скрыта — раскрой её и жми «далее».'}
          </p>
        )}
        <div className="ob-foot">
          {step.expect ? (
            <>
              <span className="ob-wait">▸ жми подсвеченное</span>
              <span className="spacer" />
              <button className="ob-skip" onClick={onDone}>
                пропустить
              </button>
            </>
          ) : (
            <>
              <span className="ob-esc">Esc — выйти</span>
              <span className="spacer" />
              <button disabled={run.step === 0} onClick={() => onStep(-1)}>
                ←
              </button>
              <button className="ob-next" onClick={() => (last ? onDone() : onStep(1))}>
                {step.nextLabel ?? (last ? 'готово' : 'далее →')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Кнопка-вопросик зоны: запускает гид сценария (можно с конкретного шага). */
export function HelpHint({
  guide,
  step,
  scope,
  label,
}: {
  guide: string;
  /** Начать не с первого шага (например, из модалки — сразу с её шага). */
  step?: number;
  scope?: string;
  label?: string;
}) {
  return (
    <button
      className="ob-hint"
      title={label ?? 'Интерактивный гид: что здесь можно сделать'}
      aria-label="гид"
      onClick={(e) => {
        e.stopPropagation();
        launchGuide(guide, { scope, step } satisfies GuideStart);
      }}
    >
      ?
    </button>
  );
}

/** Меню «?»: вводный гид + все гиды-сценарии + шпаргалка. */
export function HelpMenu({ onClose, onCheatSheet }: { onClose: () => void; onCheatSheet: () => void }) {
  useEffect(() => {
    markInvited();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Кнопка пункта меню гидов. */
  const item = (g: Guide) => (
    <button
      key={g.id}
      className="gm-item"
      onClick={() => {
        launchGuide(g.id);
        onClose();
      }}
    >
      <span className="gm-title">
        {isGuideSeen(g.id) ? '✓ ' : '· '}
        {g.title}
      </span>
      <span className="gm-goal">{g.goal}</span>
    </button>
  );

  return (
    <>
      <div className="hm-backdrop" onMouseDown={onClose} />
      <div className="menu-list help-menu">
        <button className="gm-item gm-main" onClick={() => { launchGuide('main'); onClose(); }}>
          <span className="gm-title">▶ вводный: собери первый бит</span>
          <span className="gm-goal">покажет за минуту — просто жми на подсвеченное</span>
        </button>
        <span className="hm-sep" />
        <span className="hm-cap">путь трека: от первого звука до сведения</span>
        {GUIDES.filter((g) => g.section === 'path').map(item)}
        <span className="hm-sep" />
        <span className="hm-cap">отдельные умения</span>
        {GUIDES.filter((g) => g.section === 'more').map(item)}
        <span className="hm-sep" />
        <button
          className="gm-item"
          onClick={() => {
            onCheatSheet();
            onClose();
          }}
        >
          <span className="gm-title">· шпаргалка</span>
          <span className="gm-goal">жесты стана, горячие клавиши, словарь терминов</span>
        </button>
      </div>
    </>
  );
}
