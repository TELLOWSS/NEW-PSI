/**
 * Conservative text-only redaction for an INTERNAL review copy.
 * No NLP identity assurance. Images/PDFs, unrecognized names, descriptions,
 * contextual re-identification and metadata require separate human review.
 */
export const PSI_REDACTION_PLACEHOLDER = '[비공개]';

const sensitiveKeys = /^(?:id|worker(?:Name|Uuid|Id|_uuid|_id)?|name|(?:original)?FileName|actor|owner|approvedBy|reviewer|reviewedBy|verifiedBy|createdBy|decidedBy|receivedBy|userId|employeeId|caseId|recordId|author|authorName|phone|mobile|email|address|passport|nationalId|resident(?:Registration)?Number|birth(?:Date)?|visaNumber|contact(?:Name|Phone)?|witness(?:Name)?|identity|socialSecurityNumber|ssn)$/i;

const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const koreanPhone = /(?<!\d)(?:\+?82[-\s]?)?(?:0?1[016789]|0[2-6][0-9])[-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/g;
const koreanRegistration = /(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)/g;
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const embeddedImage = /data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\r\n]+/gi;

const escapeRegex = (term: string) => term.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');

export const normalizePsiPrivacyTerms = (raw: readonly string[]): string[] => {
    if (!Array.isArray(raw) || raw.length > 30) {
        throw new Error('직접 가릴 이름·식별정보는 최대 30개까지 등록할 수 있습니다.');
    }
    const result = [...new Set(raw.map(term => String(term).trim()).filter(Boolean))];
    if (result.some(term => term.length < 2 || term.length > 100)) {
        throw new Error('직접 가릴 문구는 2~100자로 지정해야 합니다.');
    }
    return result;
};

export interface PsiTextPrivacyRedaction {
    text: string;
    replacedSensitiveFields: number;
    knownTermCount: number;
    disclaimer: 'MANUAL_REVIEW_REQUIRED';
}

export const redactPsiTextContent = (
    input: string,
    format: 'json' | 'txt',
    manualTerms: readonly string[],
): PsiTextPrivacyRedaction => {
    if (input.length > 4 * 1024 * 1024) throw new Error('4MB 초과 텍스트는 별도 검토가 필요합니다.');
    const terms = normalizePsiPrivacyTerms(manualTerms);
    let fields = 0;
    const mask = (value: string): string => {
        let text = value;
        text = text.replace(embeddedImage, PSI_REDACTION_PLACEHOLDER);
        text = text.replace(koreanRegistration, PSI_REDACTION_PLACEHOLDER);
        text = text.replace(koreanPhone, PSI_REDACTION_PLACEHOLDER);
        text = text.replace(email, PSI_REDACTION_PLACEHOLDER);
        text = text.replace(uuid, PSI_REDACTION_PLACEHOLDER);
        for (const term of terms) {
            text = text.replace(new RegExp(escapeRegex(term), 'g'), PSI_REDACTION_PLACEHOLDER);
        }
        return text;
    };
    const walk = (data: unknown): unknown => {
        if (Array.isArray(data)) return data.map(walk);
        if (data && typeof data === 'object') {
            return Object.fromEntries(Object.entries(data).map(([key, value]) => {
                if (sensitiveKeys.test(key) && value != null && value !== '') {
                    fields++;
                    return [key, PSI_REDACTION_PLACEHOLDER];
                }
                return [key, walk(value)];
            }));
        }
        if (typeof data === 'string') return mask(data);
        return data;
    };

    let output = '';
    if (format === 'json') {
        let parsed: unknown;
        try { parsed = JSON.parse(input); } catch {
            throw new Error('JSON 원문을 해석할 수 없어 개인정보 가림 사본을 만들지 않았습니다.');
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('원본 JSON 구조를 확인할 수 없습니다.');
        }
        output = JSON.stringify(walk(parsed), null, 2) + '\n';
    } else if (format === 'txt') {
        output = mask(input);
    } else {
        throw new Error('허용된 JSON/TXT 원문만 가림 처리할 수 있습니다.');
    }
    if ([koreanRegistration,koreanPhone,email,uuid,embeddedImage].some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(output);
    }) || terms.some(term => output.includes(term))) {
        throw new Error('가림 후에도 알려진 식별정보가 남아 있습니다. 별도 검토하세요.');
    }
    return {
        text: output,
        replacedSensitiveFields: fields,
        knownTermCount: terms.length,
        disclaimer: 'MANUAL_REVIEW_REQUIRED',
    };
};
