import { Metadata } from "next";

export const generateMetadata = ({
    title = `SubGen | Telugu Subtitle Generator`,
    description = `AI-powered Telugu speech to phonetic subtitle generator. Upload your video, get SRT and VTT subtitle files instantly.`,
    image = "/images/og-image.png",
    icons = [
        {
            rel: "apple-touch-icon",
            sizes: "32x32",
            url: "/icons/icon.svg"
        },
        {
            rel: "icon",
            sizes: "32x32",
            url: "/icons/icon.svg"
        },
    ],
    noIndex = false
}: {
    title?: string;
    description?: string;
    image?: string | null;
    icons?: Metadata["icons"];
    noIndex?: boolean;
} = {}): Metadata => ({
    title,
    description,
    icons,
    ...(noIndex && { robots: { index: false, follow: false } }),
});
