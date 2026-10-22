import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Antoja2 · Bar & restaurante",
    short_name: "Antoja2",
    description: "Órdenes, mesas, inventario y caja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7faf8",
    theme_color: "#506c60",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
