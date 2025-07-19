/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'stripe-blue': '#635BFF',
        'stripe-dark': '#0A2540',
        'stripe-light': '#F6F9FC',
        'stripe-error': '#DF1B41',
        'form-bg': '#FFFFFF',
        'form-border': '#E6E6E6',
        'form-focus': '#87BBFD',
        'form-placeholder': '#ADBDCC',
      },
      borderRadius: {
        'stripe': '4px',
      },
      boxShadow: {
        'stripe-input': '0px 1px 3px rgba(0, 0, 0, 0.1)',
        'stripe-input-focus': '0px 1px 3px rgba(50, 151, 211, 0.3), 0px 0px 0px 1px rgba(50, 151, 211, 0.5)',
        'stripe-card': '0 7px 14px 0 rgba(60, 66, 87, 0.08), 0 3px 6px 0 rgba(0, 0, 0, 0.12)',
      },
      fontSize: {
        'stripe-label': ['14px', '20px'],
        'stripe-input': ['16px', '24px'],
        'stripe-error': ['13px', '18px'],
      },
      spacing: {
        'stripe-input': '40px',
        'stripe-gap': '12px',
      },
    },
  },
  plugins: [],
}
