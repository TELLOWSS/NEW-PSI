import React from 'react';
import type { Page } from '../../types';
import {
    buildOperationsDecisionFocus,
    type OperationsDecisionFocusInput,
} from '../../utils/operationsDecisionFocus';

interface OperationsDecisionFocusProps extends OperationsDecisionFocusInput {
    periodLabel: string;
    tradeLabel: string;
    latestRecordLabel: string;
    onNavigate: (page: Page) => void;
}

/** One decision-oriented summary of the ALREADY filtered operational records.
 * It never independently reads worker data, calls APIs or determines work safety.
 */
export const OperationsDecisionFocus: React.FC<OperationsDecisionFocusProps> = ({
    periodLabel,
    tradeLabel,
    latestRecordLabel,
    onNavigate,
    ...counts
}) => {
    const model = buildOperationsDecisionFocus(counts);
    return (
        <section
            className={`psi-living-decision-focus psi-living-decision-focus--${model.tone}`}
            aria-labelledby="psi-living-decision-focus-title"
            data-psi-decision-focus={model.tone}
        >
            <div className="psi-living-decision-focus__content">
                <div className="psi-living-decision-focus__top">
                    <span className="psi-living-decision-focus__eyebrow">선택 범위에 따른 확인 안내</span>
                    <span className="psi-living-decision-focus__status">{model.status}</span>
                </div>
                <h2 id="psi-living-decision-focus-title">{model.headline}</h2>
                <p className="psi-living-decision-focus__guidance">{model.guidance}</p>
                <dl className="psi-living-decision-focus__evidence" aria-label="안내에 사용한 기록 기준">
                    <div><dt>기간</dt><dd>{periodLabel}</dd></div>
                    <div><dt>공종</dt><dd>{tradeLabel}</dd></div>
                    <div><dt>조회 기록</dt><dd>{counts.selectedCount}건</dd></div>
                    <div><dt>원문 확인 신호</dt><dd>{counts.sourceReviewCount}건</dd></div>
                    <div><dt>최근 기록일</dt><dd>{latestRecordLabel}</dd></div>
                </dl>
            </div>
            <div className="psi-living-decision-focus__actions">
                <button
                    type="button"
                    className="psi-living-decision-focus__button"
                    onClick={() => onNavigate(model.actionPage)}
                    aria-label={`${model.actionLabel} 화면으로 이동`}
                >
                    {model.actionLabel}
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                        <path d="M4 10h12m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
                    </svg>
                </button>
                <small>해당 기록의 분류 상태이며 현장 위험 해소 판정이 아닙니다.</small>
            </div>
        </section>
    );
};
