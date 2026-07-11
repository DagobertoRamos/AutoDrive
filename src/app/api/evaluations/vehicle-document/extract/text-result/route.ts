import { NextResponse } from 'next/server';
import { TextResultSchema } from '@/lib/crlv/pipeline/shared/schemas';
import { ProcessingSessionService } from '@/lib/crlv/pipeline/server/ProcessingSessionService.server';
import { DocumentExtractionOrchestrator } from '@/lib/crlv/pipeline/server/DocumentExtractionOrchestrator.server';
import { getServerAuthSession } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = TextResultSchema.parse(body);
    
    const session = await ProcessingSessionService.getSession(data.processingId);
    
    const authSession = await getServerAuthSession();
    if (!authSession?.user?.tenantId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    if (session.tenantId !== authSession.user.tenantId && authSession.user.role !== 'MASTER') {
      return NextResponse.json({ error: 'Acesso negado à sessão' }, { status: 403 });
    }

    const result = await DocumentExtractionOrchestrator.handleClientTextResult(
      session, 
      data.pages, 
      data.source
    );
    
    return NextResponse.json(result);

  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
