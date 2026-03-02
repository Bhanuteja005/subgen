"use client";

import Wrapper from '@/components/global/wrapper';
import { Button } from '@/components/ui/button';
import SectionBadge from '@/components/ui/section-badge';
import { pricingPlans } from '@/constants/membership';
import { cn } from '@/utils';
import NumberFlow from '@number-flow/react';
import { ArrowRight, Check } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';

const Membership = () => {

    return (
        <section id="membership" className="w-full py-16 lg:py-24 relative">

            <div className="hidden lg:block absolute -z-10 top-0 -left-1/4 size-1/3 bg-primary/10 rounded-full blur-[8rem]" />

            <Wrapper>
                <div className="flex flex-col items-center text-center">
                    <SectionBadge title="Pricing" />

                    <motion.h2
                        className="title mt-6"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                    >
                        Simple pricing
                        <br />
                        for creators
                    </motion.h2>

                    <motion.p
                        className="desc mt-4"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                    >
                        Get started for free — no credit card required
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 gap-6 mt-12 max-w-md mx-auto">
                    {pricingPlans.map((plan, index) => (
                        <motion.div
                            key={plan.id}
                            className={cn(
                                "relative rounded-xl lg:rounded-2xl p-5 lg:p-8 overflow-hidden",
                                "bg-cardbox",
                                "transition-all duration-300",
                            )}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.5 + index * 0.1 }}
                        >
                            {plan.popular && (
                                <>
                                    <div className="absolute top-0 inset-x-0 h-6 w-4/5 mx-auto bg-primary blur-[3rem]">
                                    </div>
                                    <div className="absolute top-0 inset-x-0 h-px w-full bg-linear-to-r from-primary/0 via-primary/50 to-primary/0"></div>
                                </>
                            )}

                            {plan.popular && (
                                <div className="absolute top-4 right-4">
                                    <span className="px-3 py-1 text-xs font-medium bg-primary text-white rounded-full">
                                        {plan.badge}
                                    </span>
                                </div>
                            )}

                            <div>
                                <h3 className="text-2xl font-semibold">
                                    {plan.name}
                                </h3>
                                <div className="flex items-baseline w-full mt-4">
                                    <span className="text-5xl font-semibold">
                                        $
                                    </span>
                                    <NumberFlow
                                        value={plan.price.monthly}
                                        className="text-5xl font-semibold tracking-tight"
                                        format={{ notation: 'standard' }}
                                    />
                                    <span className="text-muted-foreground text-sm ml-2">/month</span>
                                </div>
                                <p className="text-muted-foreground text-sm mt-4 leading-relaxed">
                                    {plan.description}
                                </p>
                            </div>

                            <Link href={plan.cta.href}>
                                <Button
                                    variant={plan.popular ? "default" : "secondary"}
                                    className={cn(
                                        "w-full mt-6"
                                    )}

                                >
                                    {plan.cta.text}
                                    <ArrowRight className="size-4" />
                                </Button>
                            </Link>

                            <ul className="space-y-3 mt-8">
                                {plan.features.map((feature, idx) => (
                                    <motion.li
                                        key={idx}
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ duration: 0.3, delay: 0.6 + idx * 0.05 }}
                                        className={cn(
                                            "flex items-center gap-2 transition-all duration-200",
                                        )}
                                    >
                                        <Check className={cn(
                                            "size-3.5",
                                            feature.highlighted
                                                ? "text-primary"
                                                : "text-muted-foreground"
                                        )} />
                                        <span className={cn(
                                            "text-sm leading-relaxed",
                                            feature.highlighted
                                                ? "text-foreground font-medium"
                                                : "text-muted-foreground"
                                        )}>
                                            {feature.text}
                                        </span>
                                    </motion.li>
                                ))}
                            </ul>
                        </motion.div>
                    ))}
                </div>
            </Wrapper>
        </section>
    );
};

export default Membership;

