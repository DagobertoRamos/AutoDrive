// =============================================================================
// scripts/fix-params-async.js
//
// Sweep automático: localiza handlers de App Router (`route.ts`) onde
// `params` está sendo destruturado SÍNCRONO e:
//   • Troca a assinatura para `ctxArg: { params: T | Promise<T> }`
//   • Insere `const params = await Promise.resolve(ctxArg.params)` como
//     primeira linha do corpo da função
//
// Idempotente: detecta arquivos já corrigidos pelo marcador e ignora.
// Inofensivo: NÃO altera nada além das assinaturas e da primeira linha.
// =============================================================================
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', 'src', 'app', 'api')

// Regex: captura assinaturas tipo
//   export async function METHOD(req, { params }: { params: { id: string } }) {
//   export async function METHOD(req: NextRequest, { params }: { params: { id: string; foo: string } }) {
//   export async function METHOD(_req, { params }: { params: { id: string } }) {
const SIG_RE = /(export\s+async\s+function\s+\w+\s*\(\s*[A-Za-z_][\w$]*(?:\s*:\s*[^,)]+)?\s*,\s*)\{\s*params\s*\}\s*:\s*\{\s*params:\s*(\{[^{}]+\})\s*\}\s*,?\s*\)\s*\{/g

const MARKER = '/* ASYNC_PARAMS_FIXED */'

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (f === 'route.ts') out.push(full)
  }
  return out
}

let changed = 0
let skipped = 0
let alreadyFixed = 0

for (const file of walk(ROOT)) {
  let src = fs.readFileSync(file, 'utf8')
  if (src.includes(MARKER)) { alreadyFixed++; continue }
  let touched = false
  const next = src.replace(SIG_RE, (_match, prefix, shape) => {
    touched = true
    return `${prefix}ctxArg: { params: ${shape} | Promise<${shape}> }) {\n  ${MARKER} const params = await Promise.resolve(ctxArg.params)`
  })
  if (touched) {
    fs.writeFileSync(file, next, 'utf8')
    changed++
    console.log('  ✓', path.relative(path.join(__dirname, '..'), file))
  } else {
    skipped++
  }
}

console.log(`\n[fix-params-async] ${changed} corrigidos, ${alreadyFixed} já estavam, ${skipped} sem match.`)
