import { NextResponse } from 'next/server';
import { FileValidationService } from '@/lib/crlv/pipeline/server/FileValidationService.server';
import { ProcessingSessionService } from '@/lib/crlv/pipeline/server/ProcessingSessionService.server';
import { DocumentExtractionOrchestrator } from '@/lib/crlv/pipeline/server/DocumentExtractionOrchestrator.server';
import { getServerAuthSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const processingId = formData.get('processingId') as string;
    const file = formData.get('file') as File;
    
    if (!processingId || !file) {
      return NextResponse.json({ error: 'Missing processingId or file' }, { status: 400 });
    }

    const authSession = await getServerAuthSession();
    if (!authSession?.user?.tenantId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const session = await ProcessingSessionService.getSession(processingId);
    
    if (session.tenantId !== authSession.user.tenantId && authSession.user.role !== 'MASTER') {
      return NextResponse.json({ error: 'Acesso negado à sessão' }, { status: 403 });
    }
    
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!FileValidationService.compareHash(buffer, session.fileHash)) {
      return NextResponse.json({ error: 'Hash mismatch' }, { status: 400 });
    }
    
    const result = await DocumentExtractionOrchestrator.handleServerNativeExtraction(session, buffer);
    return NextResponse.json(result);

  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
