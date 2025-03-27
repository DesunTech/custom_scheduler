import mongoose, { Schema, Document } from 'mongoose';
import { Job, JobPriority, JobStatus } from '../interfaces/Job';

export interface JobDocument extends Document, Omit<Job, 'id'> {
  // The 'id' field is handled by MongoDB's _id
}

const JobSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.PENDING,
      required: true,
      index: true
    },
    scheduledAt: { type: Date, required: true, index: true },
    executedAt: { type: Date },
    completedAt: { type: Date },
    errorMessage: { type: String },
    attempts: { type: Number, default: 0, required: true },
    userId: { type: String, index: true },
    priority: {
      type: String,
      enum: Object.values(JobPriority),
      default: JobPriority.NORMAL,
      required: true,
      index: true
    },
    maxRetries: { type: Number, default: 3, required: true },
    retryDelay: { type: Number, default: 60000, required: true }, // 1 minute default
    timeout: { type: Number, default: 30000, required: true }, // 30 seconds default
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes for query optimization
JobSchema.index({ status: 1, scheduledAt: 1, priority: -1 });
JobSchema.index({ userId: 1, status: 1 });

export const JobModel = mongoose.model<JobDocument>('Job', JobSchema);

export const convertToJob = (doc: JobDocument): Job => {
  const job = doc.toJSON() as unknown as Job;
  return job;
};