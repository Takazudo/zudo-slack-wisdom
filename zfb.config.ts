import { defineConfig } from "zfb/config";
import { zudoDoc } from "@takazudo/zudo-doc/config";

export default defineConfig(
  zudoDoc({
    siteName: "zudo-slack-wisdom",
    siteDescription: "Slack developer knowledge base with a Cloudflare Worker backend editorial stance, for me and AI agents",
    // siteUrl host MUST match the wrangler.toml custom-domain route (added in
    // the deploy-config sub-issue).
    siteUrl: "https://zudo-slack-wisdom.takazudomodular.com",
    locales: {
      ja: {
        label: "JA",
        dir: "src/content/docs-ja",
      },
    },
    githubUrl: "https://github.com/Takazudo/zudo-slack-wisdom",
    metaTags: {
      description: true,
      keywords: "slack, api",
      ogImage: "/img/ogp.png",
      ogSiteName: true,
      twitterCard: false,
    },
    // Noto Sans JP webfont for JA + Latin body text. Emitted as real <head>
    // links (preconnect + async stylesheet); never load the font via CSS
    // @import — Tailwind v4 bundling can push it past the first style rule and
    // the browser silently drops it.
    head: {
      preconnect: [
        { href: "https://fonts.googleapis.com" },
        { href: "https://fonts.gstatic.com", crossorigin: "anonymous" },
      ],
      stylesheets: [
        {
          href: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap",
          async: true,
        },
      ],
    },
    // Cloudflare Workers adapter — required so `pnpm build` emits
    // dist/_worker.js; the default is a pure static build that would break
    // `wrangler deploy`.
    adapter: "@takazudo/zfb-adapter-cloudflare",
    llmsTxt: true,
    cjkFriendly: true,
    sidebarResizer: true,
    sidebarToggle: true,
    tocToggle: true,
    imageEnlarge: true,
    dynamicPageTransition: true,
    docHistory: true,
    claudeResources: {
      claudeDir: ".claude",
    },
    defaultLocaleOnlyPrefixes: [
      "/docs/claude-md/",
      "/docs/claude-skills/",
      "/docs/claude-agents/",
      "/docs/claude-commands/",
    ],
    footer: {
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} <a href="https://x.com/Takazudo">Takazudo</a>. Built with <a href="https://zudo-doc.takazudomodular.com/">zudo-doc</a>. Enjoy synth on <a href="https://takazudomodular.com/">Takazudo Modular</a>.`,
    },
    headerNav: [
      {
        label: "Getting Started",
        path: "/docs/getting-started",
        categoryMatch: "getting-started",
      },
      {
        label: "Worker Backend",
        path: "/docs/worker-backend",
        categoryMatch: "worker-backend",
      },
      {
        label: "Flue",
        path: "/docs/flue",
        categoryMatch: "flue",
      },
      {
        label: "Messaging",
        path: "/docs/messaging",
        categoryMatch: "messaging",
      },
      {
        label: "Events",
        path: "/docs/events",
        categoryMatch: "events",
      },
      {
        label: "Lists",
        path: "/docs/lists",
        categoryMatch: "lists",
      },
      {
        label: "Data Surfaces",
        path: "/docs/data-surfaces",
        categoryMatch: "data-surfaces",
      },
      {
        label: "Claude",
        path: "/docs/claude",
        categoryMatch: "claude",
      },
    ],
    headerRightItems: [
      {
        type: "component",
        component: "github-link",
      },
      {
        type: "component",
        component: "theme-toggle",
      },
      {
        type: "component",
        component: "search",
      },
      {
        type: "component",
        component: "language-switcher",
      },
    ],
  }),
);
