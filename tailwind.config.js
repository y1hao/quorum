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
      keyframes: {
        "fade-out": {
          "0%": { opacity: "1", backgroundColor: "rgba(16, 185, 129, 0.3)" },
          "100%": { opacity: "1", backgroundColor: "transparent" },
        },
      },
      animation: {
        "fade-out": "fade-out 2s ease-out forwards",
      },
    },
  },
  plugins: [],
};
