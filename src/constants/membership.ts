export const pricingPlans = [
    {
        id: 1,
        name: "Free",
        price: {
            monthly: 0,
            yearly: 0
        },
        description: "Perfect for creators and students who need occasional Telugu subtitles",
        features: [
            { text: "5 videos per month", highlighted: false },
            { text: "Up to 10 min per video", highlighted: false },
            { text: "SRT file download", highlighted: false },
            { text: "Telugu transliteration", highlighted: false },
            { text: "Cloud storage (1 hour)", highlighted: false },
            { text: "Community Support", highlighted: false }
        ],
        cta: {
            text: "Start Free",
            href: "#"
        },
        popular: false
    },
    {
        id: 2,
        name: "Pro",
        price: {
            monthly: 12,
            yearly: 99
        },
        description: "For content creators and media professionals who subtitle regularly",
        features: [
            { text: "Unlimited videos", highlighted: true },
            { text: "Videos up to 2 hours", highlighted: true },
            { text: "SRT & VTT download", highlighted: true },
            { text: "Priority AI processing", highlighted: true },
            { text: "Batch processing", highlighted: true },
            { text: "24/7 priority support", highlighted: true }
        ],
        cta: {
            text: "Get Pro",
            href: "#"
        },
        popular: true,
        badge: "POPULAR",
        yearlyDiscount: "2 months free"
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

