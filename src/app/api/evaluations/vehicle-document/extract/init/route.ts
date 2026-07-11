import { NextResponse } from 'next/server';
import { ExtractInitSchema } from '@/lib/crlv/pipeline/shared/schemas';
import { FileValidationService } from '@/lib/crlv/pipeline/server/FileValidationService.server';
import { ProcessingSessionService } from '@/lib/crlv/pipeline/server/ProcessingSessionService.server';
import { MAX_FILE_SIZE, MAX_TEXT_RESULT_PAGES, MAX_TEXT_RESULT_BODY_BYTES } from '@/lib/crlv/pipeline/shared/constants';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = ExtractInitSchema.parse(body);
    
    FileValidationService.validateSize(data.size);
    FileValidationService.validateMimeType(data.mimeType);
    
    // Hardcoded mock user/tenant for now if auth is missing
    const tenantId = 'AD-7K92P00LJ01'; 
    const userId = 'SYSTEM';

    const session = await ProcessingSessionService.createSession({
      tenantId,
      userId,
      fileHash: data.fileHash,
      fileSize: data.size,
      mimeType: data.mimeType,
      strategy: 'HYBRID', // will be decided by client orchestrator
    });
    
    return NextResponse.json({
      processingId: session.processingId,
      processingToken: session.processingId, // Just using ID as token for MVP
      strategy: session.strategy,
      maximumPages: MAX_TEXT_RESULT_PAGES,
      maximumPayload: MAX_TEXT_RESULT_BODY_BYTES,
      expiresAt: session.expiresAt
    });

  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
