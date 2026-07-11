import 'server-only';
import { prisma } from '@/lib/prisma';
import { ProcessingSession, ExtractionStrategy } from '../shared/types';
import { PROCESSING_SESSION_TTL_MS } from '../shared/constants';
import { ErrorCodes } from '../shared/error-codes';

export class ProcessingSessionService {
  static async createSession(data: {
    tenantId: string;
    userId: string;
    fileHash: string;
    fileSize: number;
    mimeType: string;
    strategy: ExtractionStrategy;
  }): Promise<ProcessingSession> {
    const expiresAt = new Date(Date.now() + PROCESSING_SESSION_TTL_MS);
    
    const job = await prisma.documentProcessingJob.create({
      data: {
        tenantId: data.tenantId,
        createdByUserId: data.userId,
        documentHash: data.fileHash,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        status: 'uploaded',
        expiresAt,
        metadata: { strategy: data.strategy, attempts: 0 }
      }
    });

    return {
      processingId: job.id,
      userId: data.userId,
      tenantId: data.tenantId,
      fileHash: data.fileHash,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      strategy: data.strategy,
      status: 'INIT',
      expiresAt
    };
  }

  static async getSession(processingId: string): Promise<ProcessingSession> {
    const job = await prisma.documentProcessingJob.findUnique({
      where: { id: processingId }
    });
    
    if (!job) throw new Error(ErrorCodes.SESSION_NOT_FOUND);
    if (job.expiresAt && job.expiresAt < new Date()) {
      throw new Error(ErrorCodes.SESSION_EXPIRED);
    }
    
    const meta = (job.metadata as any) || {};

    return {
      processingId: job.id,
      userId: job.createdByUserId || '',
      tenantId: job.tenantId || '',
      fileHash: job.documentHash || '',
      fileSize: job.fileSize || 0,
      mimeType: job.mimeType || '',
      strategy: meta.strategy || 'HYBRID',
      status: job.status as any,
      expiresAt: job.expiresAt || new Date()
    };
  }

  static async updateStatus(processingId: string, status: string, additionalData?: any) {
    const job = await prisma.documentProcessingJob.findUnique({ where: { id: processingId }});
    if (!job) return;
    
    const meta = (job.metadata as any) || {};
    const newMeta = { ...meta, ...additionalData };

    await prisma.documentProcessingJob.update({
      where: { id: processingId },
      data: { status: status as any, metadata: newMeta }
    });
  }
}
