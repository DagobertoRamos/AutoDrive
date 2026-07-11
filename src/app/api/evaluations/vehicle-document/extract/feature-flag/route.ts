import { NextResponse } from 'next/server';

export async function GET() {
  const isEmergencyOff = process.env.DOCUMENT_EXTRACTION_PIPELINE_V2_FORCE_OFF === 'true';
  if (isEmergencyOff) {
    return NextResponse.json({ enabled: false, reason: 'Emergency Block' });
  }

  // To truly use DB config:
  // For MVP: return false, so V2 is off by default as requested.
  // Can be overridden in Master Panel later to set true.
  
  // Checking Prisma config
  const prisma = (await import('@/lib/prisma')).prisma;
  const config = await prisma.systemSetting.findUnique({ where: { key: 'global:document_reader:feature_v2' }});
  
  if (config?.value) {
    const val = JSON.parse(config.value);
    if (val.active) {
      return NextResponse.json({ enabled: true, reason: 'Active in panel' });
    }
  }

  return NextResponse.json({ enabled: false, reason: 'Off by default' });
}
