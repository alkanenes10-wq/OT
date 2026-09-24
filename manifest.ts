import type { MetadataRoute } from "next";
import { APP_NAME } from "./lib";

// Telefona "uygulama olarak" eklenebilmesi için gerekli bilgiler
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME.length > 12 ? "YKS Takip" : APP_NAME,
    description: "YKS öğrencileri için akademik ve psikolojik takip uygulaması",
    lang: "tr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f5f9",
    theme_color: "#1f5fd6",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
