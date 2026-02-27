"use client";

import { Toaster } from '@/components/ui/sonner';
import React from 'react';

const Providers = ({ children }: { children: React.ReactNode }) => {
    return (
        <>
            <Toaster />
            {children}
        </>
    );
};

export default Providers;

