import React from 'react';

interface CountryFlagProps {
    /** Language code (e.g., 'en-US', 'vi-VN') or Country code (e.g., 'us', 'vn') */
    code: string;
    /** Width of the flag image (default: 20) */
    width?: number;
    /** Extra class names for styling */
    className?: string;
    /** Optional fallback emoji */
    fallbackEmoji?: string;
}

/**
 * Extracts a 2-letter lowercase country code from a language code (e.g., 'en-US' -> 'us')
 */
export const getCountryCodeFromLanguage = (code: string): string => {
    if (!code || typeof code !== 'string') return '';
    const parts = code.trim().split('-');
    const lastPart = parts[parts.length - 1];
    
    // 특이 언어/국가 예외 처리
    const lp = lastPart.toLowerCase();
    if (lp === 'us') return 'us';
    if (lp === 'cn' || lp === 'cmn' || lp === 'zh') return 'cn';
    if (lp === 'vn') return 'vn';
    if (lp === 'kr') return 'kr';
    if (lp === 'jp') return 'jp';
    
    return lastPart.toLowerCase();
};

export function CountryFlag({
    code,
    width = 20,
    className = 'h-3.5 object-contain rounded shadow-sm inline-block mr-1.5',
    fallbackEmoji,
}: CountryFlagProps) {
    const country = getCountryCodeFromLanguage(code);

    if (!country) {
        return fallbackEmoji ? <span className="mr-1.5">{fallbackEmoji}</span> : null;
    }

    return (
        <img
            src={`https://flagcdn.com/w40/${country}.png`}
            srcSet={`https://flagcdn.com/w80/${country}.png 2x`}
            width={width}
            alt=""
            className={className}
            onError={(e) => {
                // CDN 로드 오류 시 fallback
                e.currentTarget.style.display = 'none';
            }}
        />
    );
}
