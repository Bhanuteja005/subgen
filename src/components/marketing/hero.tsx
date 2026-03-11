"use client";

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Wrapper from '../global/wrapper';
import { Button } from '../ui/button';
import { ArrowRightIcon, Loader2Icon, CheckCircle2Icon, DownloadIcon, RotateCcwIcon, XCircleIcon, UploadCloudIcon, SaveIcon, X as XIcon, GripVerticalIcon } from 'lucide-react';
import { motion, useMotionValue, AnimatePresence } from 'motion/react';
import { cn } from '@/utils';
import Balancer from 'react-wrap-balancer';
import Container from "../global/container";
import type { TranscriptionSegment } from '@/lib/fastrouter';
import { burnSubtitlesWasm, type CaptionStyle } from '@/lib/burn-wasm';
import { useSession } from '@/lib/auth-client';
import Image from 'next/image';

// ─── Floating badges ──────────────────────────────────────────────────────────

const badges = [
    { text: "Upload Video", top: "15%", left: "5%" },
    { text: "Caption Preview", top: "25%", right: "8%" },
    { text: "3 Caption Styles", top: "60%", left: "10%" },
    { text: "Download & Share", top: "70%", right: "18%" },
];

const FloatingBadge = ({ text, top, left, right, index }: { text: string; top: string; left?: string; right?: string; index: number }) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
            transition={{
                opacity: { delay: index * 0.2, duration: 0.5 },
                scale: { delay: index * 0.2, duration: 0.5 },
                y: { duration: 3 + index, repeat: Infinity, ease: "easeInOut" }
            }}
            style={{ x, y, top, left, right }}
            className="absolute hidden lg:block z-30"
        >
            <div className="px-3 py-1 rounded-lg border border-foreground/5 backdrop-blur-md">
                <span className="text-base font-handwriting text-foreground/80 whitespace-nowrap select-none">
                    {text}
                </span>
            </div>
        </motion.div>
    );
};

// ─── Processing step indicator ────────────────────────────────────────────────

type ProcessingStep = "uploading" | "processing" | "transcribing" | "done" | null;

const STEPS: { key: ProcessingStep; label: string }[] = [
    { key: "uploading", label: "Uploading video…" },
    { key: "processing", label: "Extracting audio…" },
    { key: "transcribing", label: "Generating subtitles…" },
    { key: "done", label: "Complete!" },
];

// ─── SRT download helper ──────────────────────────────────────────────────────

function downloadSrt(srtContent: string, filename: string) {
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/\.[^/.]+$/, "") + "_telugu_subtitles.srt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function secondsToSrtTimestamp(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildSrtFromSegments(segments: TranscriptionSegment[]) {
    return segments.map((s, i) => {
        const idx = i + 1;
        const start = secondsToSrtTimestamp(s.start);
        const end = secondsToSrtTimestamp(s.end);
        return `${idx}\n${start} --> ${end}\n${s.text}\n`;
    }).join("\n");
}

function buildVttFromSegments(segments: TranscriptionSegment[]) {
    const body = segments.map((s) => {
        const formatTime = (t: number) => {
            const hh = Math.floor(t / 3600);
            const mm = Math.floor((t % 3600) / 60);
            const ss = Math.floor(t % 60);
            const ms = Math.floor((t - Math.floor(t)) * 1000);
            return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
        };
        return `${formatTime(s.start)} --> ${formatTime(s.end)}\n${s.text}`;
    }).join("\n\n");
    return `WEBVTT\n\n${body}`;
}

async function downloadVideo(videoUrl: string, filename: string) {
    try {
        const res = await fetch(videoUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch {
        // fallback: open in new tab
        window.open(videoUrl, "_blank");
    }
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const secStr = s.toFixed(1); // show tenths (e.g., 01.2)
    const [secsWhole, secsDec] = secStr.split('.');
    return `${String(m).padStart(2, '0')}:${String(secsWhole).padStart(2, '0')}.${secsDec}`;
}

function formatInputTime(seconds: number): string {
    const mm = Math.floor(seconds / 60);
    const ss = (seconds % 60).toFixed(1);
    return `${String(mm).padStart(2, '0')}:${ss}`;
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

const Hero = () => {
    const badge = "Tenglish Captions";
    const description = "Upload any video and get word-accurate captions in 2 clicks. Download the captioned video or SRT file — ready for YouTube, Reels, and every major platform.";

    const router = useRouter();
    const { data: session } = useSession();

    // Redirect to sign-in if not authenticated, otherwise trigger file upload
    const handleCTAClick = () => {
        if (!session?.user) {
            router.push('/auth/sign-in');
            return;
        }
        fileInputRef.current?.click();
    };

    // State
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoPaneRef = useRef<HTMLDivElement>(null);
    // Guard flag: prevents onBlur from auto-saving when a split is in progress
    const splitInProgressRef = useRef(false);
    const [appState, setAppState] = useState<"idle" | "ready" | "processing" | "done" | "error">("idle");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [processingStep, setProcessingStep] = useState<ProcessingStep>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [videoKey, setVideoKey] = useState<string | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [vttUrl, setVttUrl] = useState<string | null>(null);
    const [srtContent, setSrtContent] = useState<string>("");
    const [teluguSrtContent, setTeluguSrtContent] = useState<string>("");
    const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
    const [editingSegmentId, setEditingSegmentId] = useState<string | number | null>(null);
    const [editText, setEditText] = useState<string>("");
    const [savingEdit, setSavingEdit] = useState(false);
    const [lastEdit, setLastEdit] = useState<null | { segId: string | number; previousSegments: TranscriptionSegment[]; previousText: string }>(null);
    const [toastVisible, setToastVisible] = useState(false);
    const [editingTimeSegmentId, setEditingTimeSegmentId] = useState<string | number | null>(null);
    const [timeStartText, setTimeStartText] = useState<string>("");
    const [timeEndText, setTimeEndText] = useState<string>("");
    const [activeSubtitle, setActiveSubtitle] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [burningCaptioned, setBurningCaptioned] = useState(false);
    const [burnPhase, setBurnPhase] = useState<string>("");
    const [burnPct, setBurnPct] = useState<number>(0);
    const [captionStyle, setCaptionStyle] = useState<"default" | "plain" | "outline">("default");
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    // Video natural aspect ratio — used to constrain the subtitle overlay
    // to the actual video content rect (avoids spilling into black bars for
    // portrait/reel videos).  Font size is fixed — no measurement needed.
    const [videoAspect, setVideoAspect] = useState<number | null>(null);

    // Auto-delete from R2 after 30 min — gives users time to edit subtitles and download
    useEffect(() => {
        if (!videoKey) return;
        const t = setTimeout(async () => {
            try { await fetch("/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: videoKey }) }); } catch { /* noop */ }
        }, 30 * 60 * 1000);
        return () => clearTimeout(t);
    }, [videoKey]);

    // Build VTT blob URL whenever segments arrive
    useEffect(() => {
        if (!vttUrl) return;
        return () => { URL.revokeObjectURL(vttUrl); };
    }, [vttUrl]);



    const validateFile = useCallback((file: File) => {
        if (file.size > 500 * 1024 * 1024) { setError("File exceeds 500 MB limit."); return false; }
        return true;
    }, []);

    const handleFileChosen = useCallback((file: File) => {
        if (!validateFile(file)) return;
        setSelectedFile(file);
        setAppState("ready");
        setError(null);
        setVideoKey(null);
        setVideoUrl(null);
        setVttUrl(null);
        setSrtContent("");
        setSegments([]);
    }, [validateFile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (f) handleFileChosen(f);
    };
    const handleFileDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleFileDragLeave = () => setIsDragging(false);
    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const f = e.dataTransfer.files?.[0]; if (f) handleFileChosen(f);
    };

    const handleProcess = useCallback(async () => {
        if (!selectedFile) return;
        setAppState("processing"); setError(null);
        setProcessingStep("uploading"); setUploadProgress(0);

        try {
            // 1a. Get a presigned PUT URL from our backend (tiny JSON request — no file → no 413)
            const urlRes = await fetch("/api/presigned-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: selectedFile.name,
                    contentType: selectedFile.type || "video/mp4",
                }),
            });
            if (!urlRes.ok) {
                let errMsg = "Could not get upload URL";
                try { errMsg = (await urlRes.json()).error ?? errMsg; } catch { errMsg = `Presign failed (${urlRes.status})`; }
                throw new Error(errMsg);
            }
            const { uploadUrl, key: presignedKey } = await urlRes.json();

            // 1b. Try direct XHR upload to R2 (browser → R2, no Vercel overhead).
            //     If CORS isn't configured on the R2 bucket the XHR fires onerror.
            //     In that case we automatically fall back to the server-side upload
            //     route which proxies through Vercel (no CORS needed, ~4.5 MB limit).
            let finalKey = presignedKey;
            let xhrCorsBlocked = false;
            try {
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
                    };
                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) resolve();
                        else reject(new Error(`Upload to storage failed (${xhr.status})`));
                    };
                    // onerror fires for network failures AND CORS-blocked requests
                    xhr.onerror = () => { xhrCorsBlocked = true; reject(new Error("__CORS__")); };
                    xhr.ontimeout = () => reject(new Error("Upload timed out — file may be too large or connection too slow"));
                    xhr.open("PUT", uploadUrl);
                    xhr.setRequestHeader("Content-Type", selectedFile.type || "video/mp4");
                    xhr.send(selectedFile);
                });
            } catch (xhrErr) {
                if (!xhrCorsBlocked) throw xhrErr; // real network error — surface it

                // CORS blocked → fall back to server-side upload via Next.js API route
                console.warn("[upload] XHR blocked (likely CORS). Falling back to server-side upload.");
                setUploadProgress(0);
                const fallbackRes = await fetch("/api/upload", {
                    method: "POST",
                    headers: {
                        "Content-Type": selectedFile.type || "video/mp4",
                        "x-file-type": selectedFile.type || "video/mp4",
                        "x-file-name": encodeURIComponent(selectedFile.name),
                        "x-file-size": String(selectedFile.size),
                    },
                    body: selectedFile,
                });
                if (!fallbackRes.ok) {
                    let fbErr = "Server upload failed";
                    try { fbErr = (await fallbackRes.json()).error ?? fbErr; } catch { fbErr = `Server upload failed (${fallbackRes.status})`; }
                    throw new Error(fbErr);
                }
                const fbData = await fallbackRes.json();
                finalKey = fbData.key;
            }

            setVideoKey(finalKey);
            setUploadProgress(100);

            // 2. Process on server
            setProcessingStep("processing");
            const pRes = await fetch("/api/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: finalKey,
                    fileName: selectedFile.name,
                    fileSize: selectedFile.size,
                }),
            });
            setProcessingStep("transcribing");
            if (!pRes.ok) {
                let errMsg = "Processing failed";
                try { errMsg = (await pRes.json()).error ?? errMsg; } catch { errMsg = `Processing failed (${pRes.status})`; }
                throw new Error(errMsg);
            }
            const data = await pRes.json();

            // 3. Build VTT blob
            const vttBlob = new Blob([data.vttContent], { type: "text/vtt" });
            setVttUrl(URL.createObjectURL(vttBlob));
            setVideoUrl(data.videoUrl);
            setSrtContent(data.srtContent);
            setTeluguSrtContent(data.teluguSrtContent ?? "");
            setSegments(data.segments);
            setProcessingStep("done");
            setAppState("done");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setAppState("error");
            setProcessingStep(null);
        }
    }, [selectedFile]);

    const handleTimeUpdate = useCallback(() => {
        const t = videoRef.current?.currentTime ?? 0;
        const active = segments.find(s => t >= s.start && t <= s.end);
        setActiveSubtitle(active?.text ?? "");
    }, [segments]);

    const handleReset = useCallback(() => {
        setAppState("idle"); setSelectedFile(null); setError(null);
        setProcessingStep(null); setUploadProgress(0);
        setVideoKey(null); setVideoUrl(null); setVttUrl(null);
        setSrtContent(""); setTeluguSrtContent(""); setSegments([]);
        setActiveSubtitle("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    // Save edited segments to server (persist SRT to R2)
    const persistSubtitles = useCallback(async (newSegments: TranscriptionSegment[]) => {
        if (!videoKey) return;
        const newSrt = buildSrtFromSegments(newSegments);
        try {
            await fetch("/api/save-subtitles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: videoKey, srtContent: newSrt }),
            });
        } catch (e) {
            console.error("Failed to persist subtitles", e);
        }
    }, [videoKey]);

    const startEdit = useCallback((seg: TranscriptionSegment) => {
        setEditingSegmentId(seg.id);
        setEditText(seg.text);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingSegmentId(null);
        setEditText("");
    }, []);

    const startEditTime = useCallback((seg: TranscriptionSegment) => {
        setEditingTimeSegmentId(seg.id);
        const fmt = (t: number) => formatInputTime(t);
        setTimeStartText(fmt(seg.start));
        setTimeEndText(fmt(seg.end));
    }, []);

    const cancelEditTime = useCallback(() => {
        setEditingTimeSegmentId(null);
        setTimeStartText("");
        setTimeEndText("");
    }, []);

    const adjustTimeText = useCallback((isStart: boolean, delta: number) => {
        const cur = isStart ? timeStartText : timeEndText;
        const seconds = parseTimeInput(cur);
        const ns = Math.max(0, Number((seconds + delta).toFixed(3)));
        const formatted = formatInputTime(ns);
        if (isStart) setTimeStartText(formatted); else setTimeEndText(formatted);
    }, [timeStartText, timeEndText]);

    function parseTimeInput(input: string) {
        // Accept formats: SS, MM:SS, MM:SS.mmm, HH:MM:SS.mmm
        const parts = input.split(":").map(p => p.trim());
        let seconds = 0;
        if (parts.length === 1) {
            seconds = parseFloat(parts[0]);
        } else if (parts.length === 2) {
            const mm = parseInt(parts[0] || "0", 10);
            const ss = parseFloat(parts[1] || "0");
            seconds = mm * 60 + ss;
        } else if (parts.length === 3) {
            const hh = parseInt(parts[0] || "0", 10);
            const mm = parseInt(parts[1] || "0", 10);
            const ss = parseFloat(parts[2] || "0");
            seconds = hh * 3600 + mm * 60 + ss;
        }
        return isFinite(seconds) ? Math.max(0, seconds) : 0;
    }

    const saveEditTime = useCallback(async (segId: string | number) => {
        if (!segId) return;
        const prev = segments.map(s => ({ ...s }));
        const newSegments = segments.map(s => {
            if (s.id === segId) {
                const start = parseTimeInput(timeStartText);
                const end = parseTimeInput(timeEndText);
                return { ...s, start, end: Math.max(end, start + 0.001) };
            }
            return s;
        });
        setLastEdit({ segId, previousSegments: prev, previousText: prev.find(p => p.id === segId)?.text ?? "" });
        setSegments(newSegments);
        setSrtContent(buildSrtFromSegments(newSegments));
        setVttUrl(URL.createObjectURL(new Blob([buildVttFromSegments(newSegments)], { type: 'text/vtt' })));
        try { await persistSubtitles(newSegments); } catch (e) { console.error('persist time edit failed', e); }
        setEditingTimeSegmentId(null);
        setTimeStartText("");
        setTimeEndText("");
        setToastVisible(true);
        window.setTimeout(() => setToastVisible(false), 6000);
    }, [segments, timeStartText, timeEndText, persistSubtitles]);

    const saveEdit = useCallback(async (segId: string | number) => {
        if (!segId) return;
        setSavingEdit(true);
        const previousSegments = segments.map(s => ({ ...s }));
        const prevText = previousSegments.find(s => s.id === segId)?.text ?? "";
        const newSegments = segments.map(s => s.id === segId ? { ...s, text: editText } : s);
        // keep last edit for undo
        setLastEdit({ segId, previousSegments, previousText: prevText });
        setSegments(newSegments);
        // update client-side SRT and VTT immediately
        setSrtContent(buildSrtFromSegments(newSegments));
        setVttUrl(URL.createObjectURL(new Blob([buildVttFromSegments(newSegments)], { type: 'text/vtt' })));
        // persist in background
        await persistSubtitles(newSegments);
        setSavingEdit(false);
        setEditingSegmentId(null);
        setEditText("");
        // show toast with undo
        setToastVisible(true);
        window.setTimeout(() => setToastVisible(false), 6000);
    }, [editText, segments, persistSubtitles]);

    /**
     * Split the segment being edited at the text cursor position.
     * Text before cursor stays on the current segment; text after goes to a new
     * segment inserted immediately after it.  Timing is divided proportionally
     * to the character split point.
     */
    const splitSegment = useCallback(async (
        seg: TranscriptionSegment,
        segIdx: number,
        cursorPos: number,
    ) => {
        splitInProgressRef.current = true;
        const before = editText.slice(0, cursorPos).trim();
        const after  = editText.slice(cursorPos).trim();

        // If one side is empty, behave like a normal save + advance
        if (!before || !after) {
            splitInProgressRef.current = false;
            const nextSeg = segments[segIdx + 1] ?? null;
            await saveEdit(seg.id);
            if (nextSeg) window.setTimeout(() => startEdit(nextSeg), 50);
            return;
        }

        // Proportional timing split
        const ratio     = cursorPos / Math.max(editText.length, 1);
        const duration  = seg.end - seg.start;
        const splitTime = Number((seg.start + duration * ratio).toFixed(3));

        const newSeg: TranscriptionSegment = {
            id: Date.now(),          // unique; re-numbered in SRT by buildSrtFromSegments
            start: splitTime,
            end: seg.end,
            text: after,
            originalText: after,
        };

        const updatedCurrent = { ...seg, text: before, end: splitTime };
        const updatedSegments = [
            ...segments.slice(0, segIdx),
            updatedCurrent,
            newSeg,
            ...segments.slice(segIdx + 1),
        ];

        setEditingSegmentId(null);
        setEditText("");
        setSegments(updatedSegments);
        setSrtContent(buildSrtFromSegments(updatedSegments));
        setVttUrl(URL.createObjectURL(new Blob([buildVttFromSegments(updatedSegments)], { type: 'text/vtt' })));
        setLastEdit({ segId: seg.id, previousSegments: segments.map(s => ({ ...s })), previousText: seg.text });
        setToastVisible(true);
        window.setTimeout(() => setToastVisible(false), 6000);

        await persistSubtitles(updatedSegments);
        splitInProgressRef.current = false;

        // Auto-focus the new (second) segment for immediate editing
        window.setTimeout(() => startEdit(newSeg), 50);
    }, [editText, segments, persistSubtitles, saveEdit, startEdit]);

    const undoEdit = useCallback(async () => {
        if (!lastEdit) return;
        setSegments(lastEdit.previousSegments);
        setSrtContent(buildSrtFromSegments(lastEdit.previousSegments));
        setVttUrl(URL.createObjectURL(new Blob([buildVttFromSegments(lastEdit.previousSegments)], { type: 'text/vtt' })));
        try {
            await persistSubtitles(lastEdit.previousSegments);
        } catch (e) {
            console.error('undo persist failed', e);
        }
        setLastEdit(null);
        setToastVisible(false);
    }, [lastEdit, persistSubtitles]);

    // ── Drag-to-reorder ───────────────────────────────────────────────────────
    const handleDragStart = useCallback((index: number) => {
        setDragIndex(index);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    }, []);

    const handleDrop = useCallback(async (targetIndex: number) => {
        if (dragIndex === null || dragIndex === targetIndex) {
            setDragIndex(null);
            setDragOverIndex(null);
            return;
        }
        const reordered = [...segments];
        const [moved] = reordered.splice(dragIndex, 1);
        reordered.splice(targetIndex, 0, moved);
        setSegments(reordered);
        setSrtContent(buildSrtFromSegments(reordered));
        setVttUrl(URL.createObjectURL(new Blob([buildVttFromSegments(reordered)], { type: 'text/vtt' })));
        setDragIndex(null);
        setDragOverIndex(null);
        await persistSubtitles(reordered);
    }, [dragIndex, segments, persistSubtitles]);

    const handleDragEnd = useCallback(() => {
        setDragIndex(null);
        setDragOverIndex(null);
    }, []);

    const stepIndex = (s: ProcessingStep) => STEPS.findIndex(x => x.key === s);
    const currentStepIndex = stepIndex(processingStep);

    return (
        <section className="relative w-full flex items-center justify-center pt-16 lg:pt-32 pb-4 overflow-hidden">
            <Wrapper className="relative z-10">
                <div className="flex flex-col items-center text-center">
                    {/* Badge */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className={cn(
                            "flex items-center justify-center gap-2 pl-1.5 pr-2 py-1.5 rounded-full",
                            "badge-glow backdrop-blur-md"
                        )}
                    >
                        <span className={cn("px-2 py-0.5 text-xs font-semibold rounded-full", "bg-foreground text-background")}>
                            New
                        </span>
                        <Container words={true} className="w-min flex text-sm text-foreground/80">
                            {badge.split(" ").map((word, index) => (
                                <span className="w-min" key={index}>{word}&nbsp;</span>
                            ))}
                        </Container>
                    </motion.div>

                    {/* Heading */}
                    <h1 className="text-4xl md:text-6xl font-semibold tracking-tight font-heading mt-8">
                        <Balancer>
                            {"Accurate Tenglish".split(" ").map((word, index) => (
                                <motion.span
                                    initial={{ filter: "blur(10px)", opacity: 0, y: 10 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: index * 0.05 }}
                                    className="inline-block"
                                    key={index}
                                >
                                    {word}&nbsp;
                                </motion.span>
                            ))}
                            <br />
                            {"Captions in 2 Clicks".split(" ").map((word, index) => (
                                <motion.span
                                    initial={{ filter: "blur(10px)", opacity: 0, y: 10 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: (2 + index) * 0.05 }}
                                    className={cn(
                                        "inline-block",
                                        word === "Captions" && "bg-linear-to-r from-primary via-blue-500 to-primary bg-size-[200%_100%] animate-[shimmer_3s_ease-in-out_infinite] text-transparent bg-clip-text"
                                    )}
                                    key={index}
                                >
                                    {word}&nbsp;
                                </motion.span>
                            ))}
                        </Balancer>
                    </h1>

                    {/* Description */}
                    <p className="text-base md:text-lg text-foreground/70 mt-6 max-w-2xl">
                        <Balancer>
                            {description.split(" ").map((word, index) => (
                                <motion.span
                                    initial={{ filter: "blur(10px)", opacity: 0, y: 5 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.3 + index * 0.02 }}
                                    className="inline-block"
                                    key={index}
                                >
                                    {word}&nbsp;
                                </motion.span>
                            ))}
                        </Balancer>
                    </p>

                    {/* CTA Buttons — video upload modal commented out; re-enable to restore interactive hero */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.6 }}
                        className={cn("flex items-center gap-4 flex-wrap justify-center mt-8")}
                    >
                        {/* <input ref={fileInputRef} type="file" accept="video/*" className="sr-only" onChange={handleInputChange} /> */}
                        <Button
                            size="lg"
                            onClick={() => router.push(session?.user ? "/dashboard" : "/auth/sign-in")}
                        >
                            <UploadCloudIcon className="size-4 mr-2" />
                            Get Started Free
                        </Button>
                        <Button size="lg" variant="outline" onClick={() => router.push("/auth/sign-in")}>
                            <ArrowRightIcon className="size-4 mr-2" />
                            Sign In
                        </Button>
                    </motion.div>
                </div>

                {/* Dashboard preview card — mirrors sample-hero layout */}
                <motion.div
                    initial={{ opacity: 0, filter: "blur(20px)", y: 30 }}
                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                    transition={{ duration: 1, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("mt-10 lg:mt-20 relative")}
                >
                    <div className="relative mx-auto max-w-6xl rounded-2xl md:rounded-[32px] border border-foreground/10 bg-foreground/5 backdrop-blur-lg p-2">
                        <div className="absolute top-1/4 left-1/2 -z-10 w-4/5 h-1/3 -translate-x-1/2 -translate-y-1/2 bg-primary/20 blur-[10rem] opacity-50" />

                        <div className="rounded-lg md:rounded-[24px] border border-foreground/10 bg-background overflow-hidden">
                            {/* Looping hero video */}
                            <video
                                src="/images/hero-video.mp4"
                                autoPlay
                                muted
                                loop
                                playsInline
                                className="w-full h-auto object-cover"
                            />

                            {/*
                             * Interactive upload widget — commented out for now.
                             * Remove the video above and un-comment this block to re-enable
                             * the full hero upload + subtitle-editor experience.
                             *
                             * <div
                             *   className="min-h-[300px] lg:min-h-[480px] flex flex-col"
                             *   onDragOver={handleFileDragOver}
                             *   onDragLeave={handleFileDragLeave}
                             *   onDrop={handleFileDrop}
                             * >
                             *   ... (full AnimatePresence state machine was here)
                             * </div>
                             */}
                        </div>
                    </div>

                    {/* Bottom fade-out gradient */}
                    <div className="absolute inset-x-0 bottom-0 z-20 w-full h-3/4 bg-linear-to-t from-background to-background/0 from-10% pointer-events-none" />

                    {/* Top glow */}
                    <div className="absolute top-0 inset-x-0 w-3/5 mx-auto h-1/10 rounded-full bg-primary blur-[4rem] opacity-40 -z-10" />

                    {/* Floating badges */}
                    {badges.map((b, index) => (
                        <FloatingBadge key={index} text={b.text} top={b.top} left={b.left} right={b.right} index={index} />
                    ))}
                </motion.div>
            </Wrapper>
        </section>
    );
};

export default Hero;
