"use client";

import { useCallback, useState } from "react";
import { UploadCloudIcon, FileVideoIcon, XCircleIcon } from "lucide-react";
import { cn } from "@/utils";

const MAX_FILE_SIZE_MB = 500;
const ACCEPTED_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "video/mpeg",
    "video/ogg",
];

interface UploadZoneProps {
    onFileSelected: (file: File) => void;
    disabled?: boolean;
}

export function UploadZone({ onFileSelected, disabled }: UploadZoneProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const validateAndSelect = useCallback(
        (file: File) => {
            setError(null);

            if (!ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|webm|mpeg|mpg|mkv)$/i)) {
                setError("Please upload a valid video file (MP4, MOV, AVI, WebM, etc.)");
                return;
            }

            const sizeMB = file.size / (1024 * 1024);
            if (sizeMB > MAX_FILE_SIZE_MB) {
                setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
                return;
            }

            setSelectedFile(file);
            onFileSelected(file);
        },
        [onFileSelected]
    );

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setIsDragging(true);
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (disabled) return;

            const file = e.dataTransfer.files?.[0];
            if (file) validateAndSelect(file);
        },
        [disabled, validateAndSelect]
    );

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) validateAndSelect(file);
        },
        [validateAndSelect]
    );

    const clearFile = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            setSelectedFile(null);
            setError(null);
        },
        []
    );

    return (
        <div className="w-full">
            <label
                className={cn(
                    "relative flex flex-col items-center justify-center w-full cursor-pointer",
                    "rounded-2xl border-2 border-dashed transition-all duration-200",
                    "min-h-[220px] p-8 text-center",
                    isDragging
                        ? "border-primary bg-primary/10 scale-[1.01]"
                        : "border-foreground/20 hover:border-primary/50 hover:bg-foreground/[0.03]",
                    (disabled) && "opacity-60 cursor-not-allowed pointer-events-none",
                    selectedFile && !error && "border-primary/40 bg-primary/5"
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    className="sr-only"
                    accept="video/*"
                    onChange={handleInputChange}
                    disabled={disabled}
                />

                {selectedFile ? (
                    <div className="flex flex-col items-center gap-3">
                        <div className="relative">
                            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                                <FileVideoIcon className="size-10 text-primary" />
                            </div>
                            <button
                                type="button"
                                onClick={clearFile}
                                className="absolute -top-2 -right-2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <XCircleIcon className="size-5" />
                            </button>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-foreground line-clamp-1 max-w-xs">
                                {selectedFile.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <div className={cn(
                            "p-4 rounded-2xl border transition-colors",
                            isDragging
                                ? "border-primary/40 bg-primary/10"
                                : "border-foreground/10 bg-foreground/5"
                        )}>
                            <UploadCloudIcon className={cn(
                                "size-10 transition-colors",
                                isDragging ? "text-primary" : "text-muted-foreground"
                            )} />
                        </div>
                        <div>
                            <p className="text-base font-medium text-foreground">
                                {isDragging ? "Drop your video here" : "Drag & drop your video"}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                or <span className="text-primary font-medium">click to browse</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                            <span>MP4, MOV, AVI, WebM</span>
                            <span>·</span>
                            <span>Up to {MAX_FILE_SIZE_MB}MB</span>
                        </div>
                    </div>
                )}
            </label>

            {error && (
                <p className="mt-3 text-sm text-red-400 flex items-center gap-2">
                    <XCircleIcon className="size-4 shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}
