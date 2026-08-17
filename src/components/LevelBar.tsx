// Живая индикация уровня дорожки (тумбометр). Обновляется напрямую через
// rAF и style.transform, минуя ре-рендер React: карточки треков
// мемоизированы и не должны просыпаться 60 раз в секунду.

import { useEffect, useRef } from 'react';

interface Props {
  read: () => number;
  vertical?: boolean;
  className?: string;
}

export function LevelBar({ read, vertical, className }: Props) {
  const fill = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = -1;
    const loop = () => {
      const v = Math.min(1, Math.max(0, read()));
      if (Math.abs(v - last) > 0.003 && fill.current) {
        last = v;
        fill.current.style.transform = vertical ? `scaleY(${v.toFixed(3)})` : `scaleX(${v.toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [read, vertical]);

  return (
    <div
      className={'level-bar' + (vertical ? ' vertical' : '') + (className ? ` ${className}` : '')}
      aria-hidden="true"
    >
      <div ref={fill} className="level-fill" />
    </div>
  );
}
