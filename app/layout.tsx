import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
export const metadata: Metadata = {
  title: "Antoja2 · Bar & restaurante",
  appleWebApp: { capable: true, title: "Antoja2", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  description: "Órdenes, mesas, menú, inventario y caja por jornada operativa.",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#506c60",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
