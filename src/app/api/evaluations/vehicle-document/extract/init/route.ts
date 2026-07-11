import { NextResponse } from 'next/server';
import { ExtractInitSchema } from '@/lib/crlv/pipeline/shared/schemas';
import { FileValidationService } from '@/lib/crlv/pipeline/server/FileValidationService.server';
import { ProcessingSessionService } from '@/lib/crlv/pipeline/server/ProcessingSessionService.server';
import { MAX_FILE_SIZE, MAX_TEXT_RESULT_PAGES, MAX_TEXT_RESULT_BODY_BYTES } from '@/lib/crlv/pipeline/shared/constants';
import { getServerAuthSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = ExtractInitSchema.parse(body);
    
    FileValidationService.validateSize(data.size);
    FileValidationService.validateMimeType(data.mimeType);
    
    const authSession = await getServerAuthSession();
    if (!authSession?.user?.tenantId || !authSession?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    
    const tenantId = authSession.user.tenantId;
    const userId = authSession.user.id;

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
