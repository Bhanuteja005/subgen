import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const r2Client = new S3Client({
    region: "auto",
    endpoint: "https://e716329aaf1dc56f6375d33fe1374a5c.r2.cloudflarestorage.com",
    credentials: {
        accessKeyId: "33b43df7feef5602f3e4636398a270a1",
        secretAccessKey: "f46ba742ef3649797c5765f68fa90155cb5ff851ddb05ecb28be179054a05708",
    },
});

const corsConfig = {
    Bucket: "socialify-media",
    CORSConfiguration: {
        CORSRules: [
            {
                AllowedOrigins: ["*"],
                AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3600,
            },
        ],
    },
};

try {
    await r2Client.send(new PutBucketCorsCommand(corsConfig));
    console.log("✅ CORS configured successfully on R2 bucket: socialify-media");
} catch (err) {
    console.error("❌ Failed to set CORS:", err.message);
    process.exit(1);
}
