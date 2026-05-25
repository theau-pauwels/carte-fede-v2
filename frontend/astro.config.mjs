import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
    sitemap(),
    robotsTxt(),
  ],
  site: "https://carte-test.fede.fpms.ac.be",
  output: "static",
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  serverOptions: {
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self';",
    },
  },
  vite: {
     server: {
       host: true,
       port: 3000,
       allowedHosts: [
         'frontend',
         'localhost',
         '127.0.0.1',
         '::1',
         '100.95.195.59',
         'carte-test.fede.fpms.ac.be',
         'carte.fede.fpms.ac.be',
         'fede.fpms.ac.be',
       ],
       hmr: {
         protocol: 'wss',
         clientPort: 443,
         overlay: false,
      },
    },
  },
});
