import React from 'react';

interface TableStateRowProps {
    colSpan: number;
    message: React.ReactNode;
    className?: string;
}

export const TableStateRow: React.FC<TableStateRowProps> = ({
    colSpan,
    message,
    className = 'px-4 py-6 text-center text-xs font-bold text-slate-500',
}) => {
    return (
        <tr>
            <td colSpan={colSpan} className={className}>
                {message}
            </td>
        </tr>
    );
};