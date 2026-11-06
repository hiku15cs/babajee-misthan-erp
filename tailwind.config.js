/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          crimson: "#E51A1A",
          gold: "#F3A806",
          coral: "#F06E78",
          cream: "#FFFDF9",
          charcoal: "#141212",
        },
        surface: {
          light: "#FFFDF9",
          dark: "#141212",
          "elevated-light": "#FFFFFF",
          "elevated-dark": "#211D1D",
        },
        content: {
          light: "#141212",
          dark: "#FFFDF9",
          "muted-light": "#6B625E",
          "muted-dark": "#C9BFBA",
        },
        border: {
          light: "#E8DED7",
          dark: "#403734",
        },
        status: {
          success: "#217A45",
          warning: "#A86400",
          danger: "#C62828",
        },
      },
    },
  },
  plugins: [],
};
