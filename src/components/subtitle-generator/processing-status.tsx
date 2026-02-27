"use client";

import { cn } from "@/utils";
import { Loader2Icon, CheckCircle2Icon } from "lucide-react";

export type ProcessingStep =
    | "uploading"
    | "processing"
    | "transcribing"
    | "done"
    | null;

interface ProcessingStatusProps {
    step: ProcessingStep;
    uploadProgress?: number;
    className?: string;
}

const STEPS: { key: ProcessingStep; label: string; desc: string }[] = [
    { key: "uploading", label: "Uploading video", desc: "Securely transferring to cloud storage…" },
    { key: "processing", label: "Extracting audio", desc: "Isolating speech track from video…" },
    { key: "transcribing", label: "Generating subtitles", desc: "AI is recognising Telugu speech & transliterating…" },
    { key: "done", label: "Complete!", desc: "Your subtitles are ready." },
];

function stepIndex(step: ProcessingStep): number {
    return STEPS.findIndex((s) => s.key === step);
}

export function ProcessingStatus({
    step,
    uploadProgress,
    className,
}: ProcessingStatusProps) {
    const currentIndex = stepIndex(step);

    return (
        <div className={cn("flex flex-col gap-4", className)}>
            {STEPS.map((s, i) => {
                const isActive = s.key === step;
                const isDone = i < currentIndex || step === "done";
                const isPending = i > currentIndex;

                return (
                    <div key={s.key} className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={cn(
                            "mt-0.5 shrink-0 size-5 rounded-full flex items-center justify-center",
                            isDone && "text-primary",
                            isActive && "text-primary",
                            isPending && "text-muted-foreground/30"
                        )}>
                            {isDone && i < STEPS.length - 1 ? (
                                <CheckCircle2Icon className="size-5" />
                            ) : isActive && s.key !== "done" ? (
                                <Loader2Icon className="size-5 animate-spin" />
                            ) : s.key === "done" && isDone ? (
                                <CheckCircle2Icon className="size-5" />
                            ) : (
                                <div className={cn(
                                    "size-3.5 rounded-full border-2 mx-auto",
                                    isPending ? "border-foreground/20" : "border-primary"
                                )} />
                            )}
                        </div>

                        {/* Text */}
                        <div>
                            <p className={cn(
                                "text-sm font-medium",
                                isActive ? "text-foreground" : isDone ? "text-foreground/70" : "text-muted-foreground/40"
                            )}>
                                {s.label}
                                {isActive && s.key === "uploading" && uploadProgress !== undefined && (
                                    <span className="ml-2 text-primary font-normal">
                                        {Math.round(uploadProgress)}%
                                    </span>
                                )}
                            </p>
                            {(isActive || isDone) && (
                                <p className={cn(
                                    "text-xs mt-0.5",
                                    isActive ? "text-muted-foreground" : "text-muted-foreground/50"
                                )}>
                                    {s.desc}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
