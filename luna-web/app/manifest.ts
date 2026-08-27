import type { MetadataRoute } from "next";

/**
 * Makes Luna installable. Chrome's "Install app" then opens her in a
 * standalone window with no tab strip and no address bar — the browser
 * chrome in a normal tab can't be removed any other way.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Luna",
    short_name: "Luna",
    description: "Your personal AI assistant.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    orientation: "any",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
