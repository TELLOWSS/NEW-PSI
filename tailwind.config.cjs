/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './index.html',
        './App.tsx',
        './components/**/*.{ts,tsx}',
        './contexts/**/*.{ts,tsx}',
        './hooks/**/*.{ts,tsx}',
        './pages/**/*.{ts,tsx}',
        './utils/**/*.{ts,tsx}',
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                indigo: {
                    50: '#f5f7ff',
                    600: '#4f46e5',
                    700: '#4338ca',
                    900: '#1e1b4b',
                },
            },
            animation: {
                blob: 'blob 7s infinite',
                float: 'float 6s ease-in-out infinite',
                shimmer: 'shimmer 1.5s infinite',
                'fade-in-up': 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                'pulse-gold': 'pulseGold 2s infinite',
            },
            keyframes: {
                blob: {
                    '0%': { transform: 'translate(0px, 0px) scale(1)' },
                    '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
                    '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
                    '100%': { transform: 'translate(0px, 0px) scale(1)' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-15px)' },
                },
                shimmer: { '100%': { transform: 'translateX(100%)' } },
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                pulseGold: {
                    '0%, 100%': { boxShadow: '0 0 0 0 rgba(245, 158, 11, 0.4)' },
                    '50%': { boxShadow: '0 0 20px 10px rgba(245, 158, 11, 0)' },
                },
            },
        },
    },
    plugins: [],
};
