import mongoose, { Schema, Document } from 'mongoose';
import { JobOptions, JobPriority } from '../interfaces/Job';

export interface RecurringJob {
  id: string;
  name: string;
  data: any;
  cronExpression: string;
  userId?: string;
  priority: JobPriority;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  lastExecutedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecurringJobDocument extends Document, Omit<RecurringJob, 'id'> {
  // The 'id' field is handled by MongoDB's _id
}

const RecurringJobSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
    cronExpression: { type: String, required: true },
    userId: { type: String, index: true },
    priority: {
      type: String,
      enum: Object.values(JobPriority),
      default: JobPriority.NORMAL,
      required: true
    },
    maxRetries: { type: Number, default: 3, required: true },
    retryDelay: { type: Number, default: 60000, required: true },
    timeout: { type: Number, default: 30000, required: true },
    lastExecutedAt: { type: Date },
    isActive: { type: Boolean, default: true, required: true, index: true },
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

export const RecurringJobModel = mongoose.model<RecurringJobDocument>('RecurringJob', RecurringJobSchema);

export const convertToRecurringJob = (doc: RecurringJobDocument): RecurringJob => {
  const job = doc.toJSON() as unknown as RecurringJob;
  return job;
};