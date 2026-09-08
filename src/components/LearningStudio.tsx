import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { beginLearning, compositionLessons, finishLearningReturn, resumeLearning, returnFromLearning, soundLessons } from '../music/learning';
import type { Patch } from '../types';

function useSessionValue<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } });
  useEffect(() => { try { sessionStorage.setItem(key,JSON.stringify(value)); } catch { /* A/B stays available until this window closes. */ } }, [key,value]);
  return [value,setValue] as const;
}
export function LearningStudio({ patch, onProject, onClose }: { patch: Patch; onProject: (p: Patch) => void; onClose: () => void }) {
  const [sound, setSound] = useSessionValue('barlow.lesson.sound',false), [index, setIndex] = useSessionValue('barlow.lesson.index',0), [error, setError] = useState('');
  const [done, setDone] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('barlow.learning.progress') ?? '[]'); } catch { return []; } });
  const [baseline, setBaseline] = useSessionValue<Patch | null>('barlow.lesson.a',null), [variant, setVariant] = useSessionValue<Patch | null>('barlow.lesson.b',null), [isBaseline, setIsBaseline] = useSessionValue('barlow.lesson.compare',false);
  const lessons = sound ? soundLessons : compositionLessons, lesson = lessons[Math.min(index,lessons.length-1)], id = `${sound ? 'sound' : 'idm'}:${index}`;
  const act = (fn: () => void) => { try { fn(); setError(''); } catch(e) { setError(String(e instanceof Error ? e.message : e)); } };
  return <Modal label="Учебная студия" className="learning-studio" onClose={onClose}><div data-help="learning-studio">
    <header className="studio-heading"><h3>Учебная студия</h3><button onClick={onClose} aria-label="Закрыть учебную студию">×</button></header>
    <div className="mseg-toolbar"><button aria-pressed={!sound} onClick={() => { setSound(false); setIndex(0); }}>IDM: история трека</button><button aria-pressed={sound} onClick={() => { setSound(true); setIndex(0); }}>Звуковой дизайн</button></div>
    <div className="learning-grid"><nav aria-label="Уроки">{lessons.map((l,i) => <button key={l.title} aria-current={i === index ? 'step' : undefined} onClick={() => setIndex(i)}>{done.includes(`${sound ? 'sound' : 'idm'}:${i}`) ? '✓' : i+1} · {l.title}</button>)}</nav>
    <article><h3>{lesson.title}</h3><p>{lesson.goal}</p><h4>Попробуй</h4><p>{lesson.action}</p><h4>Послушай</h4><p>{lesson.listen}</p><details><summary>Смысл приёма</summary><p>{lesson.term}</p></details>
    <div className="mseg-toolbar"><button onClick={() => act(() => { const ok = lesson.check(patch); setError(ok ? 'Нужные элементы в проекте есть. Результат оцени на слух; проверка не подтверждает выполнение каждого шага.' : 'Пока не найден нужный элемент проекта. Вернись к заданию и проверь настройки.'); })}>Проверить элементы</button><button onClick={() => act(() => { const next = done.includes(id) ? done.filter(x => x !== id) : [...done,id]; localStorage.setItem('barlow.learning.progress',JSON.stringify(next)); setDone(next); })}>{done.includes(id) ? 'Снять отметку' : 'Отметить выполненным'}</button></div>
    </article></div>
    <footer className="mseg-toolbar"><button onClick={() => act(() => { const p = beginLearning(patch,sound); setBaseline(p); setVariant(null); setIsBaseline(false); onProject(p); })}>Новая учебная копия</button><button onClick={() => act(() => { const p=resumeLearning(patch); if(p)onProject(p); else setError('Сохранённой учебной копии пока нет.'); })}>Продолжить копию</button><button onClick={() => act(() => { const p=returnFromLearning(patch); if(p){onProject(p);finishLearningReturn();}else setError('Исходный проект ещё не был отложен.'); })}>Вернуться к проекту</button></footer>
    <div className="mseg-toolbar" data-help="learning-compare"><button onClick={() => { setBaseline(structuredClone(patch)); setVariant(null); setIsBaseline(false); }}>Запомнить A</button><button disabled={!baseline} onClick={() => { if(!isBaseline){setVariant(structuredClone(patch));onProject(baseline!);}else if(variant)onProject(variant);setIsBaseline(!isBaseline); }}>{isBaseline ? 'Вернуть B' : 'Сравнить с A'}</button><button onClick={onClose}>К практике</button></div>
    {error && <p role="status">{error}</p>}
  </div></Modal>;
}
