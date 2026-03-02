"use client";

import { cn } from "@/utils";
import { Loader2Icon, CheckIcon, UploadCloudIcon, ScissorsIcon, SparklesIcon, PartyPopperIcon } from "lucide-react";

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

const STEPS: { key: ProcessingStep; label: string; desc: string; icon: React.FC<{ className?: string }> }[] = [
    { key: "uploading",    label: "Uploading video",      desc: "Securely transferring to cloud storage",   icon: UploadCloudIcon },
    { key: "processing",   label: "Extracting audio",     desc: "Isolating speech track from video",        icon: ScissorsIcon    },
    { key: "transcribing", label: "Generating subtitles", desc: "AI is recognising Telugu speech",          icon: SparklesIcon    },
    { key: "done",         label: "Complete!",            desc: "Your subtitles are ready to download",     icon: PartyPopperIcon },
];

function stepIndex(step: ProcessingStep): number {
    return STEPS.findIndex((s) => s.key === step);
}

export function ProcessingStatus({ step, uploadProgress, className }: ProcessingStatusProps) {
    const currentIndex = stepIndex(step);
    const totalSteps = STEPS.length - 1; // exclude "done" from bar
    const progressPct = step === "done" ? 100 : ((currentIndex) / totalSteps) * 100;

    return (
        <div className={cn("w-full space-y-5", className)}>
            {/* Overall progress bar */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{step === "done" ? "All steps complete" : "Processing…"}</span>
                    <span className="tabular-nums">{Math.round(progressPct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-700 ease-out"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
            </div>

            {/* Step cards */}
            <div className="space-y-2">
                {STEPS.map((s, i) => {
                    const isActive  = s.key === step;
                    const isDone    = i < currentIndex || step === "done";
                    const isPending = i > currentIndex && step !== "done";
                    const StepIcon  = s.icon;

                    return (
                        <div
                            key={s.key}
                            className={cn(
                                "flex items-center gap-4 rounded-xl px-4 py-3.5 border transition-all duration-300",
                                isActive  && "border-primary/40 bg-primary/5 shadow-[0_0_20px_rgba(var(--primary-rgb,0,85,255),0.08)]",
                                isDone    && "border-foreground/10 bg-foreground/[0.02] opacity-70",
                                isPending && "border-foreground/5 bg-transparent opacity-40"
                            )}
                        >
                            {/* Icon bubble */}
                            <div className={cn(
                                "size-9 rounded-xl flex items-center justify-center shrink-0 transition-all",
                                isActive  && "bg-primary/15 text-primary",
                                isDone    && "bg-green-500/10 text-green-400",
                                isPending && "bg-foreground/5 text-muted-foreground/30"
                            )}>
                                {isDone ? (
                                    <CheckIcon className="size-4 stroke-[3]" />
                                ) : isActive && s.key !== "done" ? (
                                    <Loader2Icon className="size-4 animate-spin" />
                                ) : (
                                    <StepIcon className="size-4" />
                                )}
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <p className={cn(
                                    "text-sm font-semibold leading-tight",
                                    isActive  ? "text-foreground" : isDone ? "text-foreground/60" : "text-muted-foreground/40"
                                )}>
                                    {s.label}
                                    {isActive && s.key === "uploading" && uploadProgress !== undefined && (
                                        <span className="ml-2 text-primary font-normal text-xs">
                                            {Math.round(uploadProgress)}%
                                        </span>
                                    )}
                                </p>
                                <p className={cn(
                                    "text-xs mt-0.5",
                                    isActive  ? "text-muted-foreground" : isDone ? "text-muted-foreground/40" : "text-muted-foreground/30"
                                )}>
                                    {s.desc}
                                </p>
                            </div>

                            {/* Status badge */}
                            {isDone && (
                                <span className="text-[10px] font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full shrink-0">
                                    Done
                                </span>
                            )}
                            {isActive && s.key !== "done" && (
                                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                                    Active
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Upload sub-progress bar */}
            {step === "uploading" && uploadProgress !== undefined && uploadProgress > 0 && (
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Upload progress</span>
                        <span className="tabular-nums">{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-primary/60 transition-all duration-200"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
