import { Routes } from "./routes";

export const NAV_LINKS = [
    {
        label: "Why Us",
        href: Routes.Difference,
    },
    {
        label: "How It Works",
        href: Routes.Workflow,
    },
    {
        label: "Features",
        href: Routes.Capabilities,
    },
    {
        label: "Export",
        href: Routes.Integrations,
    },
    {
        label: "Pricing",
        href: Routes.Membership,
    },
] as const;

export const footerLinks = {
    product: [
        { label: "Features", href: "#capabilities" },
        { label: "Export Formats", href: "#integrations" },
        { label: "Pricing", href: "#membership" },
        { label: "Upload Video", href: "/" }
    ],
    resources: [
        { label: "How It Works", href: "#workflow" },
        { label: "SRT Format", href: "#" },
        { label: "Support", href: "#" },
        { label: "Status", href: "#" }
    ],
    company: [
        { label: "About", href: "#" },
        { label: "Blog", href: "#" },
        { label: "Telugu AI", href: "#" },
        { label: "Contact", href: "#" }
    ]
};

export const socialLinks = [
    { label: "X", href: "https://x.com", icon: "x" },
    { label: "GitHub", href: "https://github.com", icon: "github" },
    { label: "LinkedIn", href: "https://linkedin.com", icon: "linkedin" },
    { label: "Dribbble", href: "https://dribbble.com", icon: "dribbble" }
];
