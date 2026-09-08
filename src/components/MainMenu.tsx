import { useEffect, useLayoutEffect, useRef, useState } from 'react';
export interface MenuCommand {label:string; action:()=>void; help:string; disabled?:boolean; checked?:boolean; shortcut?:string; separator?:boolean}
export interface AppMenu {label:string; help:string; anchor?:string; items:MenuCommand[]}
export function MainMenu({menus}:{menus:AppMenu[]}) {
 const [open,setOpen]=useState<number|null>(null),[active,setActive]=useState(0);
 const root=useRef<HTMLElement>(null),triggers=useRef<(HTMLButtonElement|null)[]>([]);
 const close=(restore=false)=>{if(restore&&open!==null)triggers.current[open]?.focus();setOpen(null);};
 const focusLast=useRef(false);
 const focusItem=(index:number)=>{const items=root.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)');((focusLast.current?items?.[items.length-1]:items?.[0])??triggers.current[index])?.focus();};
 const show=(index:number,last=false)=>{focusLast.current=last;setActive(index);if(open===index)focusItem(index);else setOpen(index);};
 useLayoutEffect(()=>{if(open!==null){const items=root.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)');((focusLast.current?items?.[items.length-1]:items?.[0])??triggers.current[open])?.focus();}},[open]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(null);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 return <nav data-help="main-menu" className="main-menu" aria-label="Главное меню" ref={root} onKeyDown={e=>{
   if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(e.key))e.stopPropagation();
   const inPopup=!!(e.target as Element).closest('[role="menu"]');
   if(e.key==='Escape'&&open!==null){e.preventDefault();e.stopPropagation();close(true);return;}
   if(e.key==='Tab'){if(open!==null){triggers.current[open]?.focus();setOpen(null);}return;}
   if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const i=((open??active)+(e.key==='ArrowRight'?1:-1)+menus.length)%menus.length;if(inPopup||open!==null)show(i);else{setActive(i);triggers.current[i]?.focus();}return;}
   if(!inPopup){if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();show(active,e.key==='ArrowUp');}else if(e.key==='Home'||e.key==='End'){e.preventDefault();const i=e.key==='Home'?0:menus.length-1;setActive(i);triggers.current[i]?.focus();}return;}
   const buttons=Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menu"] button:not(:disabled)')??[]),i=buttons.indexOf(e.target as HTMLButtonElement);
   let next=-1;if(e.key==='ArrowDown')next=(i+1)%buttons.length;if(e.key==='ArrowUp')next=(i-1+buttons.length)%buttons.length;if(e.key==='Home')next=0;if(e.key==='End')next=buttons.length-1;
   if(e.key.length===1&&!e.ctrlKey&&!e.altKey&&e.key!==' '){const ordered=[...buttons.slice(i+1),...buttons.slice(0,i+1)];const match=ordered.find(b=>(b.dataset.label??'').toLocaleLowerCase('ru').startsWith(e.key.toLocaleLowerCase('ru')));if(match){e.preventDefault();match.focus();}}
   if(next>=0){e.preventDefault();buttons[next]?.focus();}
 }}><span className="main-brand">barlow</span><div role="menubar" aria-label="Команды приложения">{menus.map((m,i)=><div className="main-menu-group" key={m.label}><button role="menuitem" aria-haspopup="menu" aria-expanded={open===i} aria-controls={`main-menu-${i}`} data-help={m.help} data-ob={m.anchor} ref={el=>{triggers.current[i]=el;}} tabIndex={active===i?0:-1} onFocus={()=>setActive(i)} onClick={()=>open===i?close():show(i)}>{m.label}</button>{open===i&&<div role="menu" id={`main-menu-${i}`} aria-label={m.label}>{m.items.map((item,j)=><button key={j} tabIndex={-1} role={item.checked===undefined?'menuitem':'menuitemcheckbox'} aria-checked={item.checked} data-label={item.label} data-help={item.help} className={item.separator?'menu-separator':''} disabled={item.disabled} onClick={()=>{close(true);item.action();}}><span className="menu-check" aria-hidden="true">{item.checked?'✓':''}</span><span>{item.label}</span><span className="menu-shortcut">{item.shortcut}</span></button>)}</div>}</div>)}</div></nav>;
}
