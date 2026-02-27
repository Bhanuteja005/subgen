import OpenAI from "openai";
import fs from "fs";

// Single client — all operations via FastRouter
// Gemini 3.1 Pro Preview handles audio natively (transcription + transliteration in one call)
const client = new OpenAI({
    apiKey: process.env.FASTROUTER_API_KEY!,
    baseURL: process.env.FASTROUTER_BASE_URL!,
});

// Gemini 3.1 Pro Preview: multimodal (audio/text), better token efficiency, 1M context
const TRANSCRIPTION_MODEL = "google/gemini-3.1-pro-preview";

export interface TranscriptionSegment {
    id: number;
    start: number;
    end: number;
    text: string;         // transliterated (Latin) — primary subtitle text
    originalText: string; // original as heard (Telugu script or English)
}

/**
 * Transcribes audio and returns subtitle segments.
 * Uses Gemini 3.1 Pro Preview via FastRouter — handles Telugu + English natively.
 * Transcription and transliteration are done in a single API call.
 */
export async function transcribeTeluguAudio(
    audioFilePath: string
): Promise<TranscriptionSegment[]> {
    const audioBuffer = fs.readFileSync(audioFilePath);
    const base64Audio = audioBuffer.toString("base64");

    const response = await client.chat.completions.create({
        model: TRANSCRIPTION_MODEL,
        messages: [
            {
                role: "user",
                // image_url with audio data URI is the correct format for Gemini
                // via OpenAI-compatible APIs (OpenRouter / FastRouter)
                content: [
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:audio/wav;base64,${base64Audio}`,
                        },
                    } as any,
                    {
                        type: "text",
                        text: `Listen to the attached audio carefully and transcribe EVERY word spoken.
The audio may contain Telugu speech, English speech, or a mix of both.

Return a JSON array of subtitle segments. Each segment must be an object with exactly these keys:
  "id"           – integer starting at 1
  "start"        – start time in seconds (float, e.g. 0.0)
  "end"          – end time in seconds (float, e.g. 3.2)
  "text"         – ALL words in ENGLISH ONLY: English words stay as-is; Telugu words must be phonetically romanized (e.g. Telugu "నేను" → "nenu", "వెళ్తున్నా" → "veltunna"). Never output Telugu script in this field.
  "originalText" – exact transcription: Telugu script for Telugu words, English letters for English words

Requirements:
- Divide the audio into multiple segments (aim for ~3-5 second chunks)
- Timestamps must accurately reflect when each word is spoken
- Do NOT invent or guess words — only transcribe what you actually hear
- Output ONLY the raw JSON array, no markdown fences, no explanation`,
                    },
                ],
            },
        ],
        temperature: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        max_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content?.trim() ?? "";
    console.log("[Gemini] raw response (first 800 chars):", content.slice(0, 800));
    if (!content) return [];

    // ── Attempt 1: full JSON array parse ─────────────────────────────────────
    try {
        // Strip optional markdown code fences
        const stripped = content
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();

        // Find the outermost [...] array
        const start = stripped.indexOf("[");
        const end = stripped.lastIndexOf("]");
        if (start !== -1 && end > start) {
            const jsonSlice = stripped.slice(start, end + 1);
            const parsed = JSON.parse(jsonSlice) as Array<{
                id: number;
                start: number;
                end: number;
                text: string;
                originalText: string;
            }>;
            const result = parsed
                .filter(s => !!s.text?.trim())
                .map((s, i) => ({
                    id: s.id ?? i + 1,
                    start: Number(s.start) || 0,
                    end: Number(s.end) || (Number(s.start) || 0) + 2,
                    text: s.text?.trim() ?? "",
                    originalText: s.originalText?.trim() || s.text?.trim() || "",
                }));
            if (result.length > 0) return result;
        }
    } catch (e) {
        console.warn("[Gemini] full JSON parse failed:", e);
    }

    // ── Attempt 2: recover individual objects from truncated/partial JSON ────
    // Handles responses cut off mid-array due to token limits
    try {
        const objects: TranscriptionSegment[] = [];
        const objectRegex = /\{[^{}]*"text"[^{}]*\}/g;
        let match;
        let idx = 0;
        while ((match = objectRegex.exec(content)) !== null) {
            try {
                const obj = JSON.parse(match[0]) as {
                    id?: number;
                    start?: number;
                    end?: number;
                    text?: string;
                    originalText?: string;
                };
                if (obj.text?.trim()) {
                    objects.push({
                        id: obj.id ?? ++idx,
                        start: Number(obj.start) || 0,
                        end: Number(obj.end) || (Number(obj.start) || 0) + 2,
                        text: obj.text.trim(),
                        originalText: obj.originalText?.trim() || obj.text.trim(),
                    });
                }
            } catch { /* skip malformed object */ }
        }
        if (objects.length > 0) {
            console.log("[Gemini] recovered", objects.length, "segments from partial JSON");
            return objects;
        }
    } catch (e) {
        console.warn("[Gemini] object-level recovery failed:", e);
    }

    // ── Attempt 3: plain text fallback — no timestamps ────────────────────────
    // Only if the response doesn't look like JSON at all
    const looksLikeJson = content.includes('"text"') || content.startsWith("[");
    if (!looksLikeJson) {
        console.warn("[Gemini] no JSON found, returning as plain text segment");
        return [{ id: 1, start: 0, end: 30, text: content, originalText: content }];
    }

    console.error("[Gemini] all parse strategies failed. Raw content:", content.slice(0, 200));
    return [];
}
