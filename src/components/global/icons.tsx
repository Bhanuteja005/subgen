import React, { SVGProps } from 'react';

const Icons = {
    icon: (props: Omit<SVGProps<SVGSVGElement>, "ref">) => (
        <svg {...props} width="29" height="28" viewBox="0 0 29 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.58473 13.3462C4.01926 11.7064 7.15126 8.0358 9.54473 5.18512L11.1931 3.21858C12.9031 1.17845 15.4285 0 18.0905 0H20.8547C22.4938 0 23.9243 0.0347717 25.085 0.0894412C27.1207 0.185316 28.6841 1.28206 28.806 3.31632C28.9213 5.24137 28.9747 8.45025 28.9747 13.8548C28.9747 19.9382 28.8919 23.4306 28.7764 25.332C28.6964 26.651 27.763 27.1957 26.6547 26.476C25.9085 25.9939 24.7291 24.7527 24.0293 23.7126C22.7765 21.8489 22.7571 21.7692 22.7339 17.2711C22.7223 14.7658 22.5986 11.0459 22.4594 8.99994C22.2777 6.31628 22.0457 5.18512 21.6281 4.927C21.3071 4.72962 20.7426 4.5626 20.3714 4.5626C19.977 4.55881 17.4869 7.04508 14.3781 10.5486C11.4549 13.8472 8.1914 17.5368 7.12806 18.7515C6.06473 19.9623 5.06326 21.1922 4.90473 21.4845C4.7462 21.7768 4.7114 22.1449 4.8274 22.3006C4.94726 22.4562 5.6858 22.3955 6.47073 22.1601C7.25953 21.9286 10.4573 20.7329 13.5777 19.503C18.6623 17.5026 19.3197 17.3318 19.8803 17.8405C20.3791 18.296 20.499 19.2108 20.4913 22.3955C20.4835 25.8497 20.3791 26.495 19.7025 27.2352C18.9873 28.018 18.8541 28.0834 4.07392 27.9387C1.90673 27.9174 0.139235 26.173 0.103047 24.006L0.000508495 17.8657C-0.0160799 16.8724 0.337596 15.9084 0.992677 15.1615L2.58473 13.3462Z" fill="currentColor" />
        </svg>
    ),
    wordmark: (props: Omit<SVGProps<SVGSVGElement>, "ref">) => (
        <svg {...props} width="120" height="36" viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <text
                x="1"
                y="29"
                fill="currentColor"
                fontFamily="var(--font-handwriting)"
                fontSize="34"
                fontWeight="600"
                letterSpacing="0.3"
            >
                SubGen
            </text>
        </svg>
    ),
    wordmarkGradient: (props: Omit<SVGProps<SVGSVGElement>, "ref">) => (
        <svg {...props} width="120" height="36" viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="subgen_wordmark_grad" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#3B82F6" />
                    <stop offset="1" stopColor="#0066FF" />
                </linearGradient>
            </defs>
            <text
                x="1"
                y="29"
                fill="url(#subgen_wordmark_grad)"
                fontFamily="var(--font-handwriting)"
                fontSize="34"
                fontWeight="600"
                letterSpacing="0.5"
            >
                SubGen
            </text>
        </svg>
    ),
    menu: (props: Omit<SVGProps<SVGSVGElement>, "ref">) => (
        <svg {...props} width="18" height="12" viewBox="0 0 18 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1H17M1 6H17M1 11H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
};

export default Icons;
