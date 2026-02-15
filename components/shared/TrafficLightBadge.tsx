import React, { useState } from 'react';

export type RiskLevel = 'High' | 'Medium' | 'Low';

export interface TrafficLightBadgeProps {
    confidence: number; // 0-1 range
    riskLevel: RiskLevel;
    onClick?: () => void;
    onApprovalChange?: (approved: boolean) => void;
}

type BadgeState = 'red' | 'yellow' | 'green';

/**
 * TrafficLightBadge Component
 * 
 * Displays a traffic light style badge based on confidence and risk level.
 * 
 * Color Logic:
 * - 🔴 Red (Review Required): confidence < 0.7 OR riskLevel == 'High'
 * - 🟡 Yellow (Check Needed): 0.7 <= confidence < 0.9
 * - 🟢 Green (Pass): confidence >= 0.9 AND riskLevel != 'High'
 */
export const TrafficLightBadge: React.FC<TrafficLightBadgeProps> = ({ 
    confidence, 
    riskLevel, 
    onClick,
    onApprovalChange
}) => {
    const [isForceApproved, setIsForceApproved] = useState(false);

    const calculateState = (): BadgeState => {
        // If manually approved, always show green
        if (isForceApproved) return 'green';

        // Red: confidence < 0.7 OR riskLevel == 'High'
        if (confidence < 0.7 || riskLevel === 'High') {
            return 'red';
        }

        // Yellow: 0.7 <= confidence < 0.9
        if (confidence >= 0.7 && confidence < 0.9) {
            return 'yellow';
        }

        // Green: confidence >= 0.9 AND riskLevel != 'High'
        return 'green';
    };

    const state = calculateState();

    const getStateConfig = () => {
        switch (state) {
            case 'red':
                return {
                    bgColor: 'bg-red-100',
                    borderColor: 'border-red-500',
                    iconColor: 'bg-red-500',
                    textColor: 'text-red-700',
                    label: '검토 필수',
                    icon: '🔴'
                };
            case 'yellow':
                return {
                    bgColor: 'bg-yellow-100',
                    borderColor: 'border-yellow-500',
                    iconColor: 'bg-yellow-500',
                    textColor: 'text-yellow-700',
                    label: '확인 필요',
                    icon: '🟡'
                };
            case 'green':
                return {
                    bgColor: 'bg-green-100',
                    borderColor: 'border-green-500',
                    iconColor: 'bg-green-500',
                    textColor: 'text-green-700',
                    label: isForceApproved ? '승인됨' : '통과',
                    icon: '🟢'
                };
        }
    };

    const config = getStateConfig();

    const handleClick = () => {
        if (onClick) {
            onClick();
        }
        // Force approve on click (one-way action per requirements)
        // Note: Once approved, the badge remains green. This is intentional
        // to prevent accidental un-approval of reviewed items.
        setIsForceApproved(true);
        
        // Notify parent of approval change
        if (onApprovalChange) {
            onApprovalChange(true);
        }
    };

    // Get focus ring color based on state
    const getFocusRingColor = () => {
        switch (state) {
            case 'red': return 'focus:ring-red-500';
            case 'yellow': return 'focus:ring-yellow-500';
            case 'green': return 'focus:ring-green-500';
        }
    };

    return (
        <button
            onClick={handleClick}
            className={`
                inline-flex items-center gap-2 px-4 py-2 rounded-full border-2
                ${config.bgColor} ${config.borderColor}
                transition-all duration-200 hover:shadow-md hover:scale-105
                cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${getFocusRingColor()}
            `}
            title="클릭하여 승인"
        >
            {/* Circular Traffic Light Icon */}
            <div className={`w-6 h-6 rounded-full ${config.iconColor} flex items-center justify-center text-xs`}>
                {config.icon}
            </div>
            
            {/* Status Text */}
            <span className={`font-semibold ${config.textColor}`}>
                {config.label}
            </span>
            
            {/* Confidence Badge */}
            <span className={`text-xs ${config.textColor} opacity-75`}>
                ({Math.round(confidence * 100)}%)
            </span>
        </button>
    );
};

export default TrafficLightBadge;
