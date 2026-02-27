import type { TranscriptionSegment } from "./fastrouter";

/**
 * Formats a time in seconds to SRT timestamp format: HH:MM:SS,mmm
 */
function formatSrtTime(seconds: number): string {
    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSeconds = Math.floor(totalMs / 1000);
    const s = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const m = totalMinutes % 60;
    const h = Math.floor(totalMinutes / 60);

    return [
        String(h).padStart(2, "0"),
        String(m).padStart(2, "0"),
        String(s).padStart(2, "0"),
    ].join(":") + "," + String(ms).padStart(3, "0");
}

/**
 * Converts an array of transcription segments into SRT format.
 * Uses the transliterated (Latin) text.
 */
export function segmentsToSrt(segments: TranscriptionSegment[]): string {
    return segments
        .map((seg) => {
            const start = formatSrtTime(seg.start);
            const end = formatSrtTime(seg.end);
            return `${seg.id}\n${start} --> ${end}\n${seg.text}\n`;
        })
        .join("\n");
}

/**
 * Converts segments to SRT using the original Whisper text (Telugu script).
 */
export function segmentsToOriginalSrt(segments: TranscriptionSegment[]): string {
    return segments
        .map((seg) => {
            const start = formatSrtTime(seg.start);
            const end = formatSrtTime(seg.end);
            return `${seg.id}\n${start} --> ${end}\n${seg.originalText}\n`;
        })
        .join("\n");
}

/**
 * Converts an array of transcription segments into WebVTT format
 * (used for HTML5 <track> element subtitle overlay).
 */
export function segmentsToVtt(segments: TranscriptionSegment[]): string {
    const lines = ["WEBVTT", ""];

    for (const seg of segments) {
        const start = formatSrtTime(seg.start).replace(",", ".");
        const end = formatSrtTime(seg.end).replace(",", ".");
        lines.push(`${seg.id}`);
        lines.push(`${start} --> ${end}`);
        lines.push(seg.text);
        lines.push("");
    }

    return lines.join("\n");
}

/**
 * Converts segments to WebVTT using the original Whisper text (Telugu script).
 */
export function segmentsToOriginalVtt(segments: TranscriptionSegment[]): string {
    const lines = ["WEBVTT", ""];

    for (const seg of segments) {
        const start = formatSrtTime(seg.start).replace(",", ".");
        const end = formatSrtTime(seg.end).replace(",", ".");
        lines.push(`${seg.id}`);
        lines.push(`${start} --> ${end}`);
        lines.push(seg.originalText);
        lines.push("");
    }

    return lines.join("\n");
}
