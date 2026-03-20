import React, { useState } from 'react';

interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    isOpen?: boolean;
    onToggle?: () => void;
    summary?: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false, isOpen: controlledIsOpen, onToggle, summary }) => {
    const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
    const isControlled = typeof controlledIsOpen === 'boolean';
    const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

    const handleToggle = () => {
        if (onToggle) {
            onToggle();
            return;
        }
        setInternalIsOpen(!internalIsOpen);
    };

    return (
        <div className="border border-slate-200 rounded-lg">
            <h3 className="w-full">
                <button
                    type="button"
                    className="flex items-center justify-between w-full p-4 font-semibold text-left text-slate-800 hover:bg-slate-50"
                    onClick={handleToggle}
                    aria-expanded={isOpen}
                >
                    <span>{title}</span>
                    <span className="flex items-center gap-2">
                        {summary ? <span>{summary}</span> : null}
                        <svg className={`w-5 h-5 transform transition-transform text-slate-500 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                </button>
            </h3>
            {isOpen && (
                <div className="p-4 border-t border-slate-200">
                    {children}
                </div>
            )}
        </div>
    );
};