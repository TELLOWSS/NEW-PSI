import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/** Print only the currently rendered evidence; restore the user's disclosure state afterward. */
export function usePrintableEvidence() {
    const ref = useRef<HTMLElement>(null);
    const [printing,setPrinting]=useState(false);
    useEffect(() => {
        let closed: HTMLDetailsElement[] = [];
        let active=false;
        const expand = () => {
            if (active) return;
            active=true;
            flushSync(()=>setPrinting(true));
            closed = Array.from(ref.current?.querySelectorAll<HTMLDetailsElement>('details:not([open])') || []);
            closed.forEach(details => { details.open = true; });
        };
        const restore = () => {
            if (!active) return;
            closed.forEach(details => { details.open = false; });
            closed = [];
            active=false;
            flushSync(()=>setPrinting(false));
        };
        window.addEventListener('beforeprint', expand);
        window.addEventListener('afterprint', restore);
        return () => {
            closed.forEach(details => { details.open = false; });
            window.removeEventListener('beforeprint', expand);
            window.removeEventListener('afterprint', restore);
        };
    }, []);
    return {ref,printing};
}
