import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

export async function generatePresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 300
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
    });
    return getSignedUrl(r2Client, command, { expiresIn });
}

export async function uploadBufferToR2(
    key: string,
    buffer: Buffer,
    contentType: string
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    });
    await r2Client.send(command);
    return `${PUBLIC_URL}/${key}`;
}

/**
 * Streams an upload directly to R2 without buffering in Node.js memory.
 * Requires the caller to pass the exact byte length for S3 compatibility.
 */
export async function uploadStreamToR2(
    key: string,
    body: NodeJS.ReadableStream | Buffer,
    contentType: string,
    contentLength: number
): Promise<string> {
    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body as any,
        ContentType: contentType,
        ContentLength: contentLength,
    });
    await r2Client.send(command);
    return `${PUBLIC_URL}/${key}`;
}

export async function deleteFromR2(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });
    await r2Client.send(command);
}

export async function getObjectStream(key: string) {
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });
    const response = await r2Client.send(command);
    return response.Body;
}

export function getPublicUrl(key: string): string {
    return `${PUBLIC_URL}/${key}`;
}

export async function generatePresignedGetUrl(key: string, expiresIn = 900): Promise<string> {
    const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
    });
    return getSignedUrl(r2Client, command, { expiresIn });
}
