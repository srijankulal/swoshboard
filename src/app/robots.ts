import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://swoshboard.vercel.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/clip", "/clip/*", "/terms"],
        disallow: ["/api/", "/dashboard"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
