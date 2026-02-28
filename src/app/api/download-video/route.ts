import { NextRequest, NextResponse } from "next/server";
import { getObjectStream } from "@/lib/r2";
import { Readable } from "stream";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    // Only allow keys we own (basic path-traversal guard)
    if (key.includes("..") || !key.startsWith("telugu-subtitles/")) {
        return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    try {
        const stream = await getObjectStream(key);
        if (!stream) return NextResponse.json({ error: "File not found — it may have expired. Please re-upload." }, { status: 404 });

        const filename = key.split("/").pop() ?? "video.mp4";

        // Convert SDK stream → Web ReadableStream and stream bytes to the browser
        const nodeReadable = stream as unknown as Readable;
        const webStream = new ReadableStream({
            start(controller) {
                nodeReadable.on("data", (chunk: Buffer) => controller.enqueue(chunk));
                nodeReadable.on("end", () => controller.close());
                nodeReadable.on("error", (err) => controller.error(err));
            },
        });

        return new Response(webStream, {
            headers: {
                "Content-Type": "video/mp4",
                "Content-Disposition": `attachment; filename="${filename}"`,
                // Allow the browser to read the response (CORS safe — same origin)
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-store",
            },
        });
    } catch (err: unknown) {
        console.error("[download-video] error", err);
        // NoSuchKey = the file was deleted (auto-expiry) or never existed
        const code = (err as { Code?: string; name?: string })?.Code ?? (err as { name?: string })?.name ?? "";
        if (code === "NoSuchKey" || code === "NotFound") {
            return NextResponse.json(
                { error: "Video has expired — please re-upload your file and regenerate subtitles." },
                { status: 404 },
            );
        }
        return NextResponse.json(
            { error: (err as Error)?.message ?? "Download failed" },
            { status: 500 },
        );
    }
}
