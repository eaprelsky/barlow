import { t as msg, useLocale } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { searchHelp, type HelpEntry } from './helpSearchIndex';
import { launchGuide } from './guides';

export function HelpSearch({onClose,onNavigate,tracks,initialTrack}: {onClose:()=>void;onNavigate:(entry:HelpEntry,trackId:string)=>string | undefined;tracks:{id:string;name:string}[];initialTrack:string}) {
  const locale = useLocale();
  const [query,setQuery]=useState(''),[selected,setSelected]=useState(0),[trackId,setTrackId]=useState(initialTrack);
  const [navigationError,setNavigationError]=useState('');
  const results=useMemo(()=>searchHelp(query),[query,locale]),index=Math.min(selected,results.length-1),entry=results[index];
  useEffect(()=>{document.querySelector<HTMLElement>('.help-search nav button[aria-pressed="true"]')?.scrollIntoView({block:'nearest'});},[index,query]);
  return <Modal label={msg("helpSearch.searchHelp")} className="help-search" onClose={onClose}>
    <header><h2>{msg("helpSearch.searchHelp")}</h2><button data-help="help-search-close" aria-label={msg("helpSearch.closeHelpSearch")} onClick={onClose}>×</button></header>
    <input data-initial-focus data-help="help-search-query" type="search" aria-label={msg("helpSearch.searchHelp3")} placeholder={msg("helpSearch.aTermOrTaskEGPortamento")} value={query} maxLength={160} onChange={e=>{setQuery(e.target.value);setSelected(0);}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSelected(Math.max(0,Math.min(results.length-1,index+(e.key==='ArrowDown'?1:-1))));}if(e.key==='Enter'){e.preventDefault();document.querySelector<HTMLElement>('.help-search-article h3')?.focus();}}} />
    <div className="help-search-body">
      <nav aria-label={msg("helpSearch.searchResults")} data-help="help-search-results">{results.map((r,i)=><button key={r.id} aria-pressed={i===index} onClick={()=>setSelected(i)}>{r.card.title}</button>)}{!results.length&&<p role="status">{msg("helpSearch.noResultsTryFewerOrDifferentWords")}</p>}</nav>
      {entry&&<article className="help-search-article" data-help="help-search-article"><h3 tabIndex={-1}>{entry.card.title}</h3><p>{entry.card.text}</p>{entry.card.how&&<p>{entry.card.how}</p>}{entry.card.example&&<p className="help-search-example">{entry.card.example}</p>}
        {entry.location&&<><p className="help-search-path">{entry.location.path}</p><div className="help-search-actions">{['track','snd','env','timbre'].includes(entry.location.panel)&&<select data-help="help-search-track" aria-label={msg("helpSearch.trackToNavigateTo")} value={trackId} onChange={e=>setTrackId(e.target.value)}>{tracks.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
        <button data-help="help-search-show" disabled={!trackId&&['track','snd','env','timbre'].includes(entry.location.panel)} onClick={()=>setNavigationError(onNavigate(entry,trackId)??'')}>{msg("helpSearch.showInInterface")}</button></div></>}
        {navigationError&&<p role="status">{navigationError}</p>}
        {(entry.guideId||entry.card.guide)&&<button data-help="help-search-guide" onClick={()=>{onClose();launchGuide(entry.guideId??entry.card.guide!.id,{step:entry.card.guide?.step,scope:trackId?`[data-track-id="${trackId}"]`:undefined});}}>{msg("helpSearch.openGuide")}</button>}
      </article>}
    </div>
  </Modal>;
}
