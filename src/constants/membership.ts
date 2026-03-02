export const pricingPlans = [
    {
        id: 1,
        name: "Free",
        price: {
            monthly: 0,
            yearly: 0
        },
        description: "Everything you need to add captions to your videos — completely free.",
        features: [
            { text: "Unlimited videos per month", highlighted: true },
            { text: "Up to 90 seconds per video", highlighted: false },
            { text: "3 caption styles to choose from", highlighted: true },
            { text: "Download captioned video", highlighted: true },
            { text: "Download SRT file", highlighted: false },
            { text: "No credit card required", highlighted: false }
        ],
        cta: {
            text: "Start Free",
            href: "/auth/sign-in"
        },
        popular: true,
        badge: "FREE FOREVER"
    }
];

export const trustedCompanies = {
    title: "Used by Telugu content creators worldwide",
    description: "From YouTube channels to film production studios, SubGen powers Telugu subtitling at scale",
    cta: {
        text: "Talk to Sales",
        href: "#"
    }
};

