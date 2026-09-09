import { t as msg, useLocale } from '../i18n';
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { beginLearning, learningAction, compositionLessons, finishLearningReturn, resumeLearning, returnFromLearning, soundLessons } from '../music/learning';
import type { Patch } from '../types';

function useSessionValue<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => { try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; } });
  useEffect(() => { try { sessionStorage.setItem(key,JSON.stringify(value)); } catch { /* A/B stays available until this window closes. */ } }, [key,value]);
  return [value,setValue] as const;
}
export function LearningStudio({ patch, onProject, onClose }: { patch: Patch; onProject: (p: Patch) => void; onClose: () => void }) {
  useLocale();
  const [sound, setSound] = useSessionValue('barlow.lesson.sound',false), [index, setIndex] = useSessionValue('barlow.lesson.index',0), [error, setError] = useState('');
  const [done, setDone] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('barlow.learning.progress') ?? '[]'); } catch { return []; } });
  const [baseline, setBaseline] = useSessionValue<Patch | null>('barlow.lesson.a',null), [variant, setVariant] = useSessionValue<Patch | null>('barlow.lesson.b',null), [isBaseline, setIsBaseline] = useSessionValue('barlow.lesson.compare',false);
  const lessons = sound ? soundLessons : compositionLessons, lesson = lessons[Math.min(index,lessons.length-1)], id = `${sound ? 'sound' : 'idm'}:${index}`;
  const act = (fn: () => void) => { try { fn(); setError(''); } catch(e) { setError(String(e instanceof Error ? e.message : e)); } };
  return <Modal label={msg("learningStudio.learningStudio")} className="learning-studio" onClose={onClose}><div data-help="learning-studio">
    <header className="studio-heading"><h3>{msg("learningStudio.learningStudio")}</h3><button onClick={onClose} aria-label={msg("learningStudio.closeLearningStudio")}>×</button></header>
    <div className="mseg-toolbar"><button aria-pressed={!sound} onClick={() => { setSound(false); setIndex(0); }}>{msg("learningStudio.idmATrackSStory")}</button><button aria-pressed={sound} onClick={() => { setSound(true); setIndex(0); }}>{msg("learningStudio.soundDesign")}</button></div>
    <div className="learning-grid"><nav aria-label={msg("learningStudio.lessons")}>{lessons.map((l,i) => <button key={l.title} aria-current={i === index ? 'step' : undefined} onClick={() => setIndex(i)}>{done.includes(`${sound ? 'sound' : 'idm'}:${i}`) ? '✓' : i+1} · {l.title}</button>)}</nav>
    <article><h3>{lesson.title}</h3><p>{lesson.goal}</p><h4>{msg("learningStudio.try")}</h4><p>{learningAction(lesson.action,patch)}</p><h4>{msg("learningStudio.listen")}</h4><p>{lesson.listen}</p><details><summary>{msg("learningStudio.whyItWorks")}</summary><p>{lesson.term}</p></details>
    <div className="mseg-toolbar"><button onClick={() => act(() => { const ok = lesson.check(patch); setError(ok ? msg("learningStudio.theRequiredProjectElementsArePresentJudge") : msg("learningStudio.aRequiredProjectElementIsMissingReturn")); })}>{msg("learningStudio.checkElements")}</button><button onClick={() => act(() => { const next = done.includes(id) ? done.filter(x => x !== id) : [...done,id]; localStorage.setItem('barlow.learning.progress',JSON.stringify(next)); setDone(next); })}>{done.includes(id) ? msg("learningStudio.unmark") : msg("learningStudio.markComplete")}</button></div>
    </article></div>
    <footer className="mseg-toolbar"><button onClick={() => act(() => { const p = beginLearning(patch,sound); setBaseline(p); setVariant(null); setIsBaseline(false); onProject(p); })}>{msg("learningStudio.newLearningCopy")}</button><button onClick={() => act(() => { const p=resumeLearning(patch); if(p)onProject(p); else setError(msg("learningStudio.noSavedLearningCopyYet")); })}>{msg("learningStudio.resumeCopy")}</button><button onClick={() => act(() => { const p=returnFromLearning(patch); if(p){onProject(p);finishLearningReturn();}else setError(msg("learningStudio.noOriginalProjectHasBeenSetAside")); })}>{msg("learningStudio.returnToProject")}</button></footer>
    <div className="mseg-toolbar" data-help="learning-compare"><button onClick={() => { setBaseline(structuredClone(patch)); setVariant(null); setIsBaseline(false); }}>{msg("learningStudio.rememberA")}</button><button disabled={!baseline} onClick={() => { if(!isBaseline){setVariant(structuredClone(patch));onProject(baseline!);}else if(variant)onProject(variant);setIsBaseline(!isBaseline); }}>{isBaseline ? msg("learningStudio.returnToB") : msg("learningStudio.compareWithA")}</button><button onClick={onClose}>{msg("learningStudio.startPracticing")}</button></div>
    {error && <p role="status">{error}</p>}
  </div></Modal>;
}
