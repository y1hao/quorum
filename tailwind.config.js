/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        follower: "#3b82f6",
        candidate: "#fbbf24",
        leader: "#ef4444",
      },
    },
  },
  plugins: [],
};
