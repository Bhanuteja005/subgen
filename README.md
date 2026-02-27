# SubGen — Telugu Subtitle Generator

## 🔥 Introduction

SubGen is an AI-powered web app that converts Telugu speech in any video into phonetically accurate, romanized English subtitles — with frame-precise timestamps. Upload a video, and SubGen returns subtitles burnt-in as an overlay, plus downloadable SRT files ready for any video editor.

**How it works:**
1. Upload an MP4/MOV/AVI/WebM video (up to 500 MB)
2. Audio is extracted via FFmpeg and sent to Google Gemini 3.1 Pro Preview
3. Gemini transcribes Telugu speech and romanizes it to Latin phonetics in one pass
4. Subtitles are displayed on the video and available for download

## 🔗 Live Preview

Check out the live demo: [SubGen](https://subgen.vercel.app)

## 💻 Tech Stack

- **Next.js 15** – React framework (App Router)
- **React 19** – UI library
- **TailwindCSS 4** – Utility-first CSS
- **Shadcn UI** – Component library built on Radix UI
- **Motion (Framer Motion)** – Animations
- **TypeScript** – Type-safe code
- **Google Gemini 3.1 Pro Preview** – Multimodal AI (audio transcription + transliteration in one call)
- **FastRouter** – OpenAI-compatible AI proxy for Gemini
- **Cloudflare R2** – Video storage (server-side upload, auto-deleted after 5 min)
- **FFmpeg (fluent-ffmpeg)** – Audio extraction from video

## 🛠️ Installation

Clone the repository:

```bash
git clone https://github.com/Bhanuteja005/subgen.git
cd subgen
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## ⚙️ Environment Variables

Create a `.env.local` file in the project root:

```env
# FastRouter AI API — Gemini access (transcription + transliteration)
FASTROUTER_API_KEY=your_fastrouter_api_key
FASTROUTER_BASE_URL=https://go.fastrouter.ai/api/v1

# Cloudflare R2 Storage
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://pub-<id>.r2.dev

NEXT_PUBLIC_APP_NAME="SubGen"
```

## 📦 Features

- **Drag & drop** video upload with file size validation
- **Real-time progress** steps (upload → extract audio → generate subtitles)
- **Live subtitle overlay** on video player (no crossOrigin/CORS issues)
- **Download SRT** — romanized transliteration (English letters)
- **Download SRT** — original Telugu script
- **Download Video** — original uploaded video
- **Auto-cleanup** — videos deleted from R2 after 5 minutes
- Supports Telugu + English mixed audio

## 🚀 Deploy on Vercel

```bash
pnpm build
```

Or deploy directly via the [Vercel Platform](https://vercel.com/new). Add all environment variables in the Vercel project settings.

> **Note:** FFmpeg is required at runtime. On Vercel, use a custom Docker image or a self-hosted server. The app works fully in local development on Windows/macOS/Linux.

## 📜 License

This project is licensed under the MIT License.
