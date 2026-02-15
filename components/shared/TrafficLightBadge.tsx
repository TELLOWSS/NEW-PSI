import React, { useState } from 'react';

export interface TrafficLightBadgeProps {
    confidence: number; // 0-1 range
    riskLevel: 'High' | 'Medium' | 'Low';
    onClick?: () => void;
}

export const TrafficLightBadge: React.FC<TrafficLightBadgeProps> = ({ 
    confidence, 
    riskLevel, 
    onClick 
}) => {
    const [isApproved, setIsApproved] = useState(false);

    // Determine color based on rules:
    // 🔴 Red: confidence < 0.7 OR riskLevel == 'High'
    // 🟡 Yellow: 0.7 <= confidence < 0.9
    // 🟢 Green: confidence >= 0.9 AND riskLevel != 'High'
    const getColor = (): { bg: string; border: string; text: string; label: string } => {
        if (isApproved) {
            return {
                bg: 'bg-green-100',
                border: 'border-green-500',
                text: 'text-green-800',
                label: 'Approved'
            };
        }

        if (confidence < 0.7 || riskLevel === 'High') {
            return {
                bg: 'bg-red-100',
                border: 'border-red-500',
                text: 'text-red-800',
                label: 'High Risk'
            };
        }
        
        if (confidence >= 0.7 && confidence < 0.9) {
            return {
                bg: 'bg-yellow-100',
                border: 'border-yellow-500',
                text: 'text-yellow-800',
                label: 'Caution'
            };
        }
        
        // confidence >= 0.9 AND riskLevel != 'High'
        return {
            bg: 'bg-green-100',
            border: 'border-green-500',
            text: 'text-green-800',
            label: 'Safe'
        };
    };

    const color = getColor();

    const handleClick = () => {
        setIsApproved(true);
        if (onClick) {
            onClick();
        }
    };

    return (
        <div 
            className={`inline-flex items-center gap-3 px-4 py-3 rounded-full border-2 ${color.bg} ${color.border} cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={handleClick}
            title="Click to approve"
        >
            {/* Circular traffic light indicator */}
            <div className={`w-6 h-6 rounded-full ${color.border.replace('border-', 'bg-')}`} />
            
            {/* Status text */}
            <div className="flex flex-col">
                <span className={`text-sm font-bold ${color.text}`}>
                    {color.label}
                </span>
                <span className={`text-xs ${color.text} opacity-75`}>
                    Confidence: {(confidence * 100).toFixed(0)}%
                </span>
            </div>
        </div>
    );
};
