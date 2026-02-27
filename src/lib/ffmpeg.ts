import ffmpeg from "fluent-ffmpeg";
import path from "path";
import os from "os";
import fs from "fs";

// Resolve the real ffmpeg binary path at runtime.
// Next.js bundler rewrites static imports of ffmpeg-static to virtual \ROOT\ paths,
// so we use process.cwd() to build the real path instead.
function resolveFfmpegPath(): string {
    // Try the standard ffmpeg-static location relative to project root
    const candidates = [
        path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe"),  // Windows
        path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),      // Linux/Mac
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    // Last resort: let the system PATH find it
    return "ffmpeg";
}

ffmpeg.setFfmpegPath(resolveFfmpegPath());

/**
 * Extracts audio from a video file and saves it as a WAV file.
 * Returns the path to the extracted audio file.
 */
export async function extractAudio(videoPath: string): Promise<string> {
    // Use forward slashes — ffmpeg on Windows can choke on backslash paths
    const audioPath = path.join(os.tmpdir(), `audio_${Date.now()}.wav`).replace(/\\/g, "/");
    const inputPath = videoPath.replace(/\\/g, "/");

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo()
            .audioChannels(1)
            .audioFrequency(16000)
            .outputOptions(["-acodec pcm_s16le", "-ar 16000", "-ac 1"])
            .format("wav")
            .on("end", () => resolve(audioPath))
            .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
            .save(audioPath);
    });
}

/**
 * Cleans up a temporary file silently.
 */
export function cleanupTempFile(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch {
        // Ignore cleanup errors
    }
}
