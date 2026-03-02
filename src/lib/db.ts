import mongoose from "mongoose";
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
    throw new Error("MONGODB_URI environment variable is not set");
}

// ── Mongoose (for VideoJob model) ─────────────────────────────────────────────
declare global {
    // eslint-disable-next-line no-var
    var __mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
}

if (!global.__mongoose) {
    global.__mongoose = { conn: null, promise: null };
}

export async function connectDB(): Promise<typeof mongoose> {
    if (global.__mongoose.conn) return global.__mongoose.conn;
    if (!global.__mongoose.promise) {
        global.__mongoose.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
        });
    }
    global.__mongoose.conn = await global.__mongoose.promise;
    return global.__mongoose.conn;
}

// ── Raw MongoClient (for Better Auth adapter) ─────────────────────────────────
declare global {
    // eslint-disable-next-line no-var
    var __mongoClient: MongoClient | null;
}

let mongoClientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
    if (!global.__mongoClient) {
        global.__mongoClient = new MongoClient(MONGODB_URI);
        global.__mongoClient.connect();
    }
    mongoClientPromise = Promise.resolve(global.__mongoClient);
} else {
    const client = new MongoClient(MONGODB_URI);
    mongoClientPromise = client.connect();
}

export { mongoClientPromise };
