// =============================================================================
// telephony/adapters/index.ts — exportações públicas dos adapters de telefonia.
// =============================================================================

export * from './types'
export * from './base'
export { getTelephonyAdapter } from './registry'
export { GenericWebhookAdapter } from './generic.adapter'
export { ManualCallAdapter } from './manual.adapter'
export { AsteriskAdapter } from './asterisk.adapter'
export { ThreeCxAdapter } from './threecx.adapter'
export { TwilioAdapter } from './twilio.adapter'
