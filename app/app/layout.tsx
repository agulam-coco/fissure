import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-sans",
    display: "swap",
});

// Reserved for things that are literally records: counts, campaign numbers,
// complaint text. Not used as decoration on labels.
const mono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--font-mono",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Fissure",
    description:
        "Finds car problems in owner complaints before the recall happens, by reading what drivers describe instead of the category it gets filed under.",
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" className={`${sans.variable} ${mono.variable}`}>
            <body
                style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
                className="min-h-screen antialiased"
            >
                {children}
            </body>
        </html>
    );
}