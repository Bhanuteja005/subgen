import { NextResponse } from 'next/server';
import { uploadBufferToR2 } from '@/lib/r2';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { key, srtContent } = body as { key?: string; srtContent?: string };
        if (!key || !srtContent) return NextResponse.json({ error: 'Missing key or srtContent' }, { status: 400 });

        // Save edited SRT next to the original upload key
        const base = key.replace(/\.[^/.]+$/, '');
        const srtKey = `${base}.edited.srt`;
        const buffer = Buffer.from(srtContent, 'utf-8');
        const publicUrl = await uploadBufferToR2(srtKey, buffer, 'text/plain; charset=utf-8');

        return NextResponse.json({ ok: true, srtKey, publicUrl });
    } catch (err: any) {
        console.error('save-subtitles error', err);
        return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
    }
}
