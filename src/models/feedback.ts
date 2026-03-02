import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFeedback extends Document {
    userId: string;
    userEmail: string;
    name?: string;
    email?: string;
    subject?: string;
    rating?: number;
    message: string;
    createdAt: Date;
    updatedAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
    {
        userId:    { type: String, required: true, index: true },
        userEmail: { type: String, required: true },
        name:      { type: String },
        email:     { type: String },
        subject:   { type: String },
        rating:    { type: Number, min: 1, max: 5 },
        message:   { type: String, required: true },
    },
    { timestamps: true }
);

const Feedback: Model<IFeedback> =
    mongoose.models.Feedback ?? mongoose.model<IFeedback>("Feedback", FeedbackSchema);

export default Feedback;
