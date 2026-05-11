import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-router")) return "vendor-router";
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
          if (id.includes("react-bootstrap")) return "vendor-react-bootstrap";
          if (id.includes("bootstrap")) return "vendor-bootstrap";
          if (id.includes("@dnd-kit")) return "vendor-dnd";
          if (id.includes("@fullcalendar")) return "vendor-calendar";
          if (id.includes("recharts")) return "vendor-charts-recharts";
          if (id.includes("apexcharts") || id.includes("react-apexcharts")) return "vendor-charts-apex";
          if (id.includes("lodash")) return "vendor-lodash";
          if (id.includes("axios")) return "vendor-http";
          if (id.includes("dompurify")) return "vendor-sanitize";
          return "vendor-misc";
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
      },
    },
  },
});
