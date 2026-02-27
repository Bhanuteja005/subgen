import { NextRequest, NextResponse } from "next/server";
import { uploadBufferToR2 } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";

// Allow up to 500 MB uploads
export const maxDuration = 300;

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!file.type.startsWith("video/")) {
            return NextResponse.json({ error: "Only video files are accepted" }, { status: 400 });
        }

        const ext = file.name.split(".").pop() ?? "mp4";
        const key = `telugu-subtitles/${uuidv4()}.${ext}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadBufferToR2(key, buffer, file.type || "video/mp4");

        return NextResponse.json({ key, url: publicUrl });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
