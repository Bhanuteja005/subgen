import mongoose, { Schema, Document, Model } from "mongoose";

export interface IVideoJob extends Document {
    userId: string;
    userEmail: string;
    fileName: string;
    fileSize: number;          // bytes
    r2Key: string;
    status: "processing" | "done" | "error";
    durationSeconds: number;
    segmentCount: number;
    tokenUsage: number;        // approx tokens burned (audio KB * 4)
    srtContent: string;
    errorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}

const VideoJobSchema = new Schema<IVideoJob>(
    {
        userId:          { type: String, required: true, index: true },
        userEmail:       { type: String, required: true },
        fileName:        { type: String, required: true },
        fileSize:        { type: Number, default: 0 },
        r2Key:           { type: String, required: true },
        status:          { type: String, enum: ["processing", "done", "error"], default: "processing" },
        durationSeconds: { type: Number, default: 0 },
        segmentCount:    { type: Number, default: 0 },
        tokenUsage:      { type: Number, default: 0 },
        srtContent:      { type: String, default: "" },
        errorMessage:    { type: String },
    },
    { timestamps: true }
);

const VideoJob: Model<IVideoJob> =
    mongoose.models.VideoJob ?? mongoose.model<IVideoJob>("VideoJob", VideoJobSchema);

export default VideoJob;
