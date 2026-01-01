import React from 'react';

interface StatCardProps {
    title: string;
    value: string;
    iconType?: 'users' | 'chart' | 'warning' | 'check';
    onClick?: () => void;
}

const Icon: React.FC<{type: string}> = ({type}) => {
    const icons: {[key:string]: React.ReactNode} = {
        users: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197m0 0A5.975 5.975 0 0112 13a5.975 5.975 0 01-3 5.197" /></svg>,
        chart: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
        warning: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
        check: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
    };
    const colors: {[key:string]: string} = {
        users: 'bg-blue-100 text-blue-600',
        chart: 'bg-indigo-100 text-indigo-600',
        warning: 'bg-yellow-100 text-yellow-600',
        check: 'bg-sky-100 text-sky-600'
    };

    return <div className={`p-3 rounded-full ${colors[type]}`}>{icons[type]}</div>
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, iconType, onClick }) => {
    const isClickable = !!onClick;
    return (
        <div 
            className={`bg-white p-5 rounded-lg shadow-lg flex items-center justify-between transition-all duration-300 ${isClickable ? 'cursor-pointer hover:shadow-xl hover:-translate-y-1' : ''}`}
            onClick={onClick}
        >
            <div>
                <p className="text-sm font-medium text-slate-500">{title}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
            </div>
            {iconType && <Icon type={iconType} />}
        </div>
    );
};