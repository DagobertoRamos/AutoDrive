// =============================================================================
// telephony/adapters/registry.ts — resolve o adapter pelo TelephonyProviderKind.
// GENERIC_WEBHOOK e MANUAL são funcionais; ASTERISK/THREE_CX/TWILIO ficam
// "preparados" (ready=false) até validação com doc/credenciais oficiais.
// =============================================================================

import type { TelephonyProviderKind } from '@prisma/client'
import type { TelephonyAdapter } from './types'
import { GenericWebhookAdapter } from './generic.adapter'
import { ManualCallAdapter } from './manual.adapter'
import { AsteriskAdapter } from './asterisk.adapter'
import { ThreeCxAdapter } from './threecx.adapter'
import { TwilioAdapter } from './twilio.adapter'

const generic = new GenericWebhookAdapter()
const manual = new ManualCallAdapter()
const asterisk = new AsteriskAdapter()
const threecx = new ThreeCxAdapter()
const twilio = new TwilioAdapter()

export function getTelephonyAdapter(kind: TelephonyProviderKind): TelephonyAdapter {
  switch (kind) {
    case 'ASTERISK': return asterisk
    case 'THREE_CX': return threecx
    case 'TWILIO': return twilio
    case 'MANUAL': return manual
    case 'GENERIC_WEBHOOK':
    default: return generic
  }
}
