import type { Metadata } from "next";
import ClipClient from "./clip-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);
  return {
    title: `Clip: ${decoded} | Global Web Clipboard - Swoshboard`,
    description: `View or edit global clipboard "${decoded}". Fast, ephemeral, cross-device copy & paste with QR code sharing.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function ClipPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ClipClient slug={decodeURIComponent(slug)} />;
}
