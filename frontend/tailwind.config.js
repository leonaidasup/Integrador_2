/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg_title_user: "#090A0C",
        bg_title_admin: "#090A0C",
        bg_page_user: "#020203",
        bg_page_admin: "#020203",
        bg_frame: "#08090B",
        cl_border: "#1F2227",

        bg_input: "#101214",
        bg_input_hover: "#1F2227",
        bg_list: "#0F92F7",
        bg_tables: "#08090B",
        bg_tables_selector: "#081017",

        bg_button_primary: "#0F92F7",
        bg_button_secondary: "#1F2227",

        cl_font_primary: "#FFFFFF",
        cl_font_secondary: "#8F8F8F",

        cl_red: "#D40924",
        cl_green: "#008D00",
        cl_yellow: "#CE9200",
        cl_blue: "#0F92F7",

        bg_red: "#300910",
        bg_green: "#062309",
        bg_yellow: "#2F2409",
        bg_blue: "#09243A",
      },
      fontFamily: {
        sans: ["Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
