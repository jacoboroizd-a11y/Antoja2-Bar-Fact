import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Antoja2 · Bar & restaurante",
    short_name: "Antoja2",
    description: "Órdenes, mesas, inventario y caja",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf6f7",
    theme_color: "#701c35",
    icons: [
      { src: "/brand/antoja2.png", sizes: "1254x1254", type: "image/png" },
    ],
  };
}
