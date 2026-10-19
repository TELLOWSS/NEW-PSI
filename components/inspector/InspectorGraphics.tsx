import React from 'react';
export type InspectorIconName='camera'|'check'|'shield'|'arrow'|'document'|'search'|'alert'|'layers'|'clock'|'upload'|'close'|'expand';
const paths:Record<InspectorIconName,React.ReactNode>={
 camera:<><path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/></>,
 check:<path d="m5 12 4 4L19 6"/>,shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/></>,
 arrow:<path d="M4 12h15m-6-6 6 6-6 6"/>,document:<><path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h6"/></>,
 search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,alert:<><path d="m12 3 10 18H2zM12 9v5"/><path d="M12 17h.01"/></>,
 layers:<><path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/></>,
 clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
 upload:<><path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/></>,close:<path d="m6 6 12 12M6 18 18 6"/>,
 expand:<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
};
export function InspectorIcon({name,className=''}:{name:InspectorIconName;className?:string}) {
 return <svg className={`si-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
/** Decorative construction sketch; contains no inspection findings or simulated scores. */
export function InspectorScene({large=false}:{large?:boolean}) {
 return <svg viewBox="0 0 400 240" className={`si-scene ${large?'si-scene-large':''}`} aria-hidden="true" fill="none">
  <path d="M18 194h366M65 194V65h167v129M70 109h157M70 151h157M112 67v126M167 67v126M222 67v126" stroke="currentColor" strokeWidth="1.2" opacity=".24"/>
  <path d="M35 194V38h11v156M39 38h287M40 38l27-20h134l35 20M204 39v51M197 91h15v12h-15zM14 194h57M287 38v27" stroke="currentColor" strokeWidth="1.5" opacity=".4"/>
  <rect x="144" y="76" width="201" height="139" rx="15" fill="var(--si-scene-fill,#19394b)" stroke="currentColor" strokeOpacity=".55"/>
  <path d="M165 101v-8h13M311 93h13v8M165 185v8h13M311 193h13v-8" stroke="currentColor" strokeWidth="2"/>
  <path d="M182 172v-48h38v48M220 111h48v61M269 136h35v36M194 135h14M194 145h14M233 125h22M233 138h22M233 151h22M280 148h13M280 159h13M177 173h132" stroke="currentColor" strokeWidth="1.4" opacity=".65"/>
  <circle cx="243" cy="144" r="25" stroke="currentColor" strokeOpacity=".25"/><circle cx="243" cy="144" r="5" fill="currentColor" fillOpacity=".7"/>
  <path d="M243 111v12M243 165v12M211 144h12M263 144h12" stroke="currentColor" opacity=".6"/>
  <rect x="292" y="57" width="69" height="35" rx="9" fill="var(--si-scene-tag,#d8f3e6)"/><path d="M307 75h9m-4-5 5 5-5 5M326 70h21M326 76h16M326 82h11" stroke="#1b5552" strokeWidth="1.5"/>
  <path d="M107 216h17M113 210v12M363 122h12M369 116v12" stroke="currentColor" opacity=".4"/>
 </svg>;
}
