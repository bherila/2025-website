export default {
  content: [
    './resources/views/**/*.blade.php',
    './resources/js/**/*.{ts,tsx,js,jsx}',
    './resources/css/**/*.css',
  ],
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
};
