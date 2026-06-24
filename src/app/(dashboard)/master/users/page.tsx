'use client'

// =============================================================================
// /master/users — Gestão global de usuários (MASTER only)
//
// • Lista todos os usuários da plataforma com filtros
// • Editar role, status, tenant
// • Resetar senha
// • Ativar / inativar / bloquear
// • Criar usuário em qualquer tenant
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter }                         from 'next/navigation'
import Link                                  from 'next/link'
import {
  Users, Search, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Shield, Edit2, Key, UserX, UserCheck,
  ChevronLeft, ChevronRight, X, Save, Plus, Eye, EyeOff,
  ExternalLink, Trash2,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface UserRecord {
  id:                 string
  name:               string
  email:              string
  phone?:             string | null
  cpf?:               string | null
  role:               string
  status:             string
  tenantId:           string | null
  unitId:             string | null
  mustChangePassword: boolean
  lastLoginAt:        string | null
  createdAt:          string
  tenant:             { id: string; name: string; publicId: string; status: string } | null
  unit:               { id: string; name: string } | null
  position:           { id: string; name: string; slug: string } | null
}

interface SellerExtra {
  fullName?:       string
  shortName?:      string | null
  whatsapp?:       string | null
  cargo?:          string | null
  notes?:          string | null
  active?:         boolean
  receivesCharge?: boolean
}

interface PositionOption {
  id:        string
  name:      string
  slug:      string
  sortOrder: number
}

interface Meta { total: number; page: number; limit: number; pages: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'text-xs font-medium text-gray-600 block mb-1'

const ROLE_COLOR: Record<string, string> = {
  MASTER:         'bg-purple-100 text-purple-800 border-purple-200',
  ADM:            'bg-blue-100   text-blue-800   border-blue-200',
  GERENTE_GERAL:  'bg-indigo-100 text-indigo-800 border-indigo-200',
  GERENTE:        'bg-cyan-100   text-cyan-800   border-cyan-200',
  VENDEDOR_LIDER: 'bg-teal-100   text-teal-800   border-teal-200',
  VENDEDOR:       'bg-green-100  text-green-800  border-green-200',
  USUARIO_LIDER:  'bg-orange-100 text-orange-800 border-orange-200',
  USUARIO:        'bg-gray-100   text-gray-700   border-gray-200',
}

const STATUS_COLOR: Record<string, string> = {
  ATIVO:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  INATIVO:  'bg-gray-100   text-gray-600   border-gray-200',
  PENDENTE: 'bg-amber-50   text-amber-700  border-amber-200',
  BLOQUEADO:'bg-red-50     text-red-700    border-red-200',
}

const ROLES = ['MASTER','ADM','GERENTE_GERAL','GERENTE','VENDEDOR_LIDER','VENDEDOR','USUARIO_LIDER','USUARIO']
const STATUSES = ['ATIVO','INATIVO','PENDENTE','BLOQUEADO','SUSPENSO']

// Tabs visíveis (com label + cor). PENDENTE não é tab principal — fica
// junto com Ativos por padrão (usuário recém-criado pode aparecer aqui).
const STATUS_TABS: Array<{ value: string; label: string; pill: string }> = [
  { value: 'ATIVO',     label: 'Ativos',     pill: 'bg-emerald-100 text-emerald-700' },
  { value: 'SUSPENSO',  label: 'Suspensos',  pill: 'bg-amber-100 text-amber-700' },
  { value: 'BLOQUEADO', label: 'Bloqueados', pill: 'bg-red-100 text-red-700' },
  { value: 'INATIVO',   label: 'Inativos',   pill: 'bg-gray-100 text-gray-700' },
  { value: 'PENDENTE',  label: 'Pendentes',  pill: 'bg-blue-100 text-blue-700' },
]

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

// ── Modal: editar usuário ──────────────────────────────────────────────────────

function EditModal({ user, positions, onClose, onSaved }: { user: UserRecord; positions: PositionOption[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name:               user.name,
    email:              user.email,
    phone:              user.phone ?? '',
    cpf:                user.cpf ?? '',
    role:               user.role,
    status:             user.status,
    mustChangePassword: user.mustChangePassword,
    positionId:         user.position?.id ?? '',
    tenantId:           user.tenantId ?? '',
    unitId:             user.unitId ?? '',
  })
  // MASTER pode transferir entre tenants/unidades. Carrega as opções.
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [units, setUnits] = useState<{ id: string; name: string; tenantId: string }[]>([])
  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const [tR, uR] = await Promise.all([fetch('/api/master/tenants'), fetch('/api/units')])
        const tJ = await tR.json().catch(() => ({})); const uJ = await uR.json().catch(() => ({}))
        if (off) return
        setTenants((tJ?.data ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))
        setUnits((uJ?.data ?? []).map((u: { id: string; name: string; tenantId: string }) => ({ id: u.id, name: u.name, tenantId: u.tenantId })))
      } catch { /* noop */ }
    })()
    return () => { off = true }
  }, [])
  const [seller, setSeller] = useState<SellerExtra & { loaded: boolean }>({
    loaded: false,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [tab,    setTab]    = useState<'pessoal' | 'acesso' | 'vendedor'>('pessoal')

  const isVendedor = form.role === 'VENDEDOR'

  // Carrega sub-cadastro Seller se for vendedor (uma vez por modal)
  useEffect(() => {
    if (!isVendedor || seller.loaded) return
    ;(async () => {
      try {
        const r = await fetch(`/api/sellers?userId=${user.id}`)
        const d = await r.json().catch(() => ({}))
        const s = Array.isArray(d?.data) ? d.data.find((x: any) => x.userId === user.id) : null  // eslint-disable-line @typescript-eslint/no-explicit-any
        setSeller({
          loaded:         true,
          fullName:       s?.fullName ?? user.name,
          shortName:      s?.shortName ?? '',
          whatsapp:       s?.whatsapp ?? '',
          cargo:          s?.cargo ?? '',
          notes:          s?.notes ?? '',
          active:         s?.active ?? true,
          receivesCharge: s?.receivesCharge ?? true,
        })
      } catch {
        setSeller({ loaded: true })
      }
    })()
  }, [isVendedor, seller.loaded, user.id, user.name])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:               form.name.trim(),
        email:              form.email.trim().toLowerCase(),
        phone:              form.phone || null,
        cpf:                form.cpf || null,
        role:               form.role,
        status:             form.status,
        mustChangePassword: form.mustChangePassword,
        positionId:         form.positionId || null,
        tenantId:           form.tenantId || null,
        unitId:             form.unitId || null,
      }
      if (isVendedor && seller.loaded) {
        payload.seller = {
          fullName:       seller.fullName,
          shortName:      seller.shortName,
          whatsapp:       seller.whatsapp,
          cargo:          seller.cargo,
          notes:          seller.notes,
          active:         seller.active,
          receivesCharge: seller.receivesCharge,
        }
      }
      const res  = await fetch(`/api/master/users/${user.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao salvar.')
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">Editar usuário</h2>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={15} /></button>
        </div>

        {/* Tabs internas */}
        <div className="flex gap-1 border-b border-gray-100 px-5 pt-2">
          {([
            { id: 'pessoal',  label: 'Dados pessoais' },
            { id: 'acesso',   label: 'Acesso e permissões' },
            ...(isVendedor ? [{ id: 'vendedor' as const, label: 'Vendedor' }] : []),
          ] as const).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle size={13} className="shrink-0" />{error}
              </div>
            )}

            {/* ── Aba: Dados pessoais ─────────────────────────────── */}
            {tab === 'pessoal' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={labelCls}>Nome completo</label>
                  <input className={inputCls} value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>E-mail</label>
                  <input type="email" className={inputCls} value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Telefone</label>
                  <input className={inputCls} placeholder="(11) 99999-9999" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>CPF</label>
                  <input className={inputCls} placeholder="000.000.000-00" value={form.cpf}
                    onChange={e => setForm(p => ({ ...p, cpf: e.target.value }))} />
                </div>
              </div>
            )}

            {/* ── Aba: Acesso e permissões ───────────────────────── */}
            {tab === 'acesso' && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Empresa (Tenant)</label>
                  <select className={inputCls} value={form.tenantId}
                    onChange={e => setForm(p => ({ ...p, tenantId: e.target.value, unitId: '', positionId: '' }))}>
                    <option value="">— sem empresa (plataforma) —</option>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Unidade</label>
                  <select className={inputCls} value={form.unitId}
                    onChange={e => setForm(p => ({ ...p, unitId: e.target.value }))}>
                    <option value="">— sem unidade —</option>
                    {units.filter(u => u.tenantId === form.tenantId).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Papel (Role)</label>
                  <select className={inputCls} value={form.role}
                    onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={inputCls} value={form.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={labelCls}>Cargo (Position)</label>
                  <select className={inputCls} value={form.positionId}
                    onChange={e => setForm(p => ({ ...p, positionId: e.target.value }))}>
                    <option value="">— sem cargo —</option>
                    {positions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <label className="md:col-span-2 flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    checked={form.mustChangePassword}
                    onChange={e => setForm(p => ({ ...p, mustChangePassword: e.target.checked }))}
                  />
                  <span className="text-sm text-gray-700">Exigir troca de senha no próximo login</span>
                </label>
              </div>
            )}

            {/* ── Aba: Vendedor (sub-cadastro) ───────────────────── */}
            {tab === 'vendedor' && isVendedor && (
              seller.loaded ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className={labelCls}>Nome no contrato (fullName)</label>
                    <input className={inputCls} value={seller.fullName ?? ''}
                      onChange={e => setSeller(s => ({ ...s, fullName: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Nome curto / apelido</label>
                    <input className={inputCls} value={seller.shortName ?? ''}
                      onChange={e => setSeller(s => ({ ...s, shortName: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>WhatsApp</label>
                    <input className={inputCls} placeholder="(11) 99999-9999"
                      value={seller.whatsapp ?? ''}
                      onChange={e => setSeller(s => ({ ...s, whatsapp: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Cargo / função na loja</label>
                    <input className={inputCls} placeholder="Ex.: Vendedor Pleno"
                      value={seller.cargo ?? ''}
                      onChange={e => setSeller(s => ({ ...s, cargo: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelCls}>Observações</label>
                    <textarea className={`${inputCls} min-h-16 resize-y`} value={seller.notes ?? ''}
                      onChange={e => setSeller(s => ({ ...s, notes: e.target.value }))} />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                      checked={seller.active ?? true}
                      onChange={e => setSeller(s => ({ ...s, active: e.target.checked }))}
                    />
                    <span className="text-sm text-gray-700">Vendedor ativo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
                      checked={seller.receivesCharge ?? true}
                      onChange={e => setSeller(s => ({ ...s, receivesCharge: e.target.checked }))}
                    />
                    <span className="text-sm text-gray-700">Recebe pendências/cobranças</span>
                  </label>
                </div>
              ) : (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              )
            )}
          </div>

          <div className="flex gap-3 border-t border-gray-100 px-5 py-3">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal: resetar senha ───────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose, onSaved }: { user: UserRecord; onClose: () => void; onSaved: () => void }) {
  const [pwd,      setPwd]      = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pwd.length < 6) { setError('Mínimo 6 caracteres.'); return }
    setSaving(true)
    try {
      const res  = await fetch(`/api/master/users/${user.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'RESET_PASSWORD', newPassword: pwd, reason: 'Reset por MASTER' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro.')
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Key size={14} />Resetar senha</h2>
            <p className="text-xs text-gray-400">{user.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={15} /></button>
        </div>
        <form onSubmit={handleReset} className="space-y-4 px-5 py-4">
          {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={13} />{error}</div>}
          <div>
            <label className={labelCls}>Nova senha</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                className={`${inputCls} pr-9`}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                placeholder="Mínimo 6 caracteres"
              />
              <button type="button" onClick={() => setShowPwd(p => !p)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-amber-600">O usuário será obrigado a trocar na próxima sessão.</p>
          </div>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
              Resetar
            </button>
            <button type="button" onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── DeleteUserModal — confirmação forte (digite EXCLUIR) ────────────────────

function DeleteUserModal({
  user, isSelf, onClose, onDeleted,
}: {
  user: UserRecord
  isSelf: boolean
  onClose: () => void
  onDeleted: (msg?: string) => void
}) {
  const [typed, setTyped] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')
  const isMaster = user.role === 'MASTER'

  async function doDelete() {
    setBusy(true); setErr('')
    try {
      const res  = await fetch(`/api/master/users/${user.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error ?? 'Falha ao excluir.')
      onDeleted(data?.message ?? 'Usuário inativado.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-red-700">
            <Trash2 size={16} /> Excluir / inativar usuário
          </h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5 text-sm">
          {isSelf && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Você não pode excluir sua própria conta. Peça a outro MASTER.
            </div>
          )}

          {isMaster && !isSelf && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Usuário <strong>MASTER</strong>. O sistema bloqueia inativar o último MASTER ativo.
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-0.5">
            <p><strong>Nome:</strong> {user.name}</p>
            <p><strong>E-mail:</strong> {user.email}</p>
            <p><strong>Perfil:</strong> {user.role}</p>
            {user.tenant && <p><strong>Tenant:</strong> {user.tenant.name}</p>}
            {!user.tenant && <p><strong>Tenant:</strong> Plataforma (MASTER)</p>}
          </div>

          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            O usuário será <strong>inativado</strong> (status → INATIVO). Não poderá mais logar,
            mas todos os dados históricos (logs, negociações, comissões) ficam preservados.
            Para reativar depois, basta usar o botão <em>Reativar</em> na linha.
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Digite <span className="font-mono text-red-600">EXCLUIR</span> para confirmar:
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isSelf}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="EXCLUIR"
            />
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={doDelete}
            disabled={busy || isSelf || typed.trim().toUpperCase() !== 'EXCLUIR'}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PurgeUserModal — hard delete real (force purge) ─────────────────────────

function PurgeUserModal({
  user, isSelf, onClose, onPurged,
}: {
  user: UserRecord
  isSelf: boolean
  onClose: () => void
  onPurged: (msg?: string) => void
}) {
  const [typed, setTyped] = useState('')
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState('')

  async function doPurge() {
    setBusy(true); setErr('')
    try {
      const res  = await fetch(`/api/master/users/${user.id}/purge`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) throw new Error(data?.error ?? 'Falha ao purgar.')
      onPurged(data?.message ?? 'Usuário apagado permanentemente.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro inesperado.')
    } finally {
      setBusy(false)
    }
  }

  const confirmPhrase = 'EXCLUIR PERMANENTE'
  const canConfirm = !isSelf && typed.trim().toUpperCase() === confirmPhrase

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-red-300 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-red-800">
            <Trash2 size={16} /> EXCLUIR PERMANENTEMENTE
          </h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-red-700 hover:bg-red-100">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-5 text-sm">
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            <strong>⚠️ Atenção:</strong> esta ação é <strong>irreversível</strong>.
            Vai apagar o usuário e <strong>todos os dados pessoais vinculados</strong> do banco
            (notificações, preferências, comentários, comissões, sellers/managers).
            Históricos auditáveis (logs, deals, pendências) terão a referência do usuário
            substituída por <em>NULL</em>.
          </div>

          {isSelf && (
            <div className="rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-xs text-red-900">
              Você não pode purgar sua própria conta.
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-0.5">
            <p><strong>Nome:</strong> {user.name}</p>
            <p><strong>E-mail:</strong> {user.email}</p>
            <p><strong>Perfil:</strong> {user.role}</p>
            <p><strong>Status atual:</strong> {user.status}</p>
            {user.tenant && <p><strong>Tenant:</strong> {user.tenant.name}</p>}
          </div>

          {user.status !== 'INATIVO' && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Usuário precisa estar <strong>INATIVO</strong> para purgar. Inative primeiro
              pelo botão padrão (lixeira cinza).
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Digite <span className="font-mono text-red-700">{confirmPhrase}</span> para confirmar:
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isSelf || user.status !== 'INATIVO'}
              className="w-full rounded-md border border-red-300 px-3 py-2 text-sm font-mono focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder={confirmPhrase}
            />
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={doPurge}
            disabled={busy || !canConfirm || user.status !== 'INATIVO'}
            className="flex items-center gap-1.5 rounded-md bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Excluir permanentemente
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function MasterUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [users,     setUsers]     = useState<UserRecord[]>([])
  const [positions, setPositions] = useState<PositionOption[]>([])
  const [meta,      setMeta]      = useState<Meta>({ total: 0, page: 1, limit: 50, pages: 1 })
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Filtros
  const [search,   setSearch]   = useState('')
  const [roleF,    setRoleF]    = useState('')
  const [statusF,  setStatusF]  = useState('')
  const [page,     setPage]     = useState(1)

  // Modals
  const [editUser,   setEditUser]   = useState<UserRecord | null>(null)
  const [resetUser,  setResetUser]  = useState<UserRecord | null>(null)
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null)
  const [purgeUser,  setPurgeUser]  = useState<UserRecord | null>(null)

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') router.replace('/inicio')
  }, [session, status, router])

  const load = useCallback(async () => {
    if (session?.user?.role !== 'MASTER') return
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams({
        page:  String(page),
        limit: '50',
        ...(search  && { search }),
        ...(roleF   && { role: roleF }),
        ...(statusF && { status: statusF }),
      })
      const res  = await fetch(`/api/master/users?${qs}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data.data ?? [])
      setMeta(data.meta ?? { total: 0, page: 1, limit: 50, pages: 1 })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }, [session, page, search, roleF, statusF])

  useEffect(() => { load() }, [load])

  // Carrega cargos uma vez (sistema + tenant)
  useEffect(() => {
    if (session?.user?.role !== 'MASTER') return
    fetch('/api/positions?active=true')
      .then(r => r.json())
      .then(d => {
        const list: PositionOption[] = (d?.data ?? []) as PositionOption[]
        list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
        setPositions(list)
      })
      .catch(() => { /* silent */ })
  }, [session])

  function handleSaved() {
    setEditUser(null)
    setResetUser(null)
    setSuccess('Ação realizada com sucesso.')
    setTimeout(() => setSuccess(''), 3000)
    load()
  }

  async function quickStatus(user: UserRecord, newStatus: string) {
    try {
      await fetch(`/api/master/users/${user.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'SET_STATUS', status: newStatus }),
      })
      load()
    } catch { /* silent */ }
  }

  // Agrupa users por tenant — MASTER (tenantId=null) vira grupo especial "Plataforma".
  // Garante ordem: Plataforma primeiro, depois tenants em ordem alfabética.
  const groupedByTenant = useMemo(() => {
    const groups = new Map<string, { id: string | null; name: string; isMaster: boolean; users: UserRecord[] }>()
    for (const u of users) {
      const key = u.tenant?.id ?? '__master__'
      if (!groups.has(key)) {
        groups.set(key, {
          id:       u.tenant?.id ?? null,
          name:     u.tenant?.name ?? 'Plataforma (MASTER)',
          isMaster: !u.tenant,
          users:    [],
        })
      }
      groups.get(key)!.users.push(u)
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.isMaster && !b.isMaster) return -1
      if (!a.isMaster && b.isMaster) return 1
      return a.name.localeCompare(b.name)
    })
  }, [users])

  if (status === 'loading' || (loading && users.length === 0)) {
    return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" /></div>
  }

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Users size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Usuários Globais</h1>
            <p className="text-xs text-gray-400">{meta.total} usuários na plataforma</p>
          </div>
        </div>
        <Link href="/master/users/novo" className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus size={15} />Novo usuário
        </Link>
      </div>

      {/* Feedback */}
      {error   && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 size={15} />{success}</div>}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="Nome ou e-mail..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={roleF} onChange={e => { setRoleF(e.target.value); setPage(1) }}>
          <option value="">Todos os papéis</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={load} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs por status */}
      <div className="flex flex-wrap gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        <button
          onClick={() => { setStatusF(''); setPage(1) }}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            statusF === '' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Todos
          {meta.total > 0 && (
            <span className="rounded-full bg-white/30 px-1.5 py-0.5 text-[10px]">{meta.total}</span>
          )}
        </button>
        {STATUS_TABS.map((t) => {
          const active = statusF === t.value
          const count  = users.filter((u) => u.status === t.value).length
          return (
            <button
              key={t.value}
              onClick={() => { setStatusF(t.value); setPage(1) }}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand-600 text-white' : `text-gray-600 hover:bg-gray-100 ${t.pill}`
              }`}
            >
              {t.label}
              {count > 0 && !active && (
                <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px]">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Cards por tenant — cada tenant vira um card com sua própria tabela */}
      {loading ? (
        <div className="flex justify-center py-12 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : groupedByTenant.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-12 text-center text-gray-400">
          Nenhum usuário encontrado nos filtros atuais.
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByTenant.map((group) => (
            <div key={group.id ?? 'master'} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
              group.isMaster ? 'border-purple-200' : 'border-gray-200'
            }`}>
              {/* Header do tenant */}
              <div className={`flex items-center justify-between border-b px-4 py-3 ${
                group.isMaster ? 'border-purple-100 bg-purple-50/50' : 'border-gray-100 bg-gray-50'
              }`}>
                <div className="flex items-center gap-2.5">
                  {group.isMaster ? (
                    <Shield size={16} className="text-purple-600" />
                  ) : (
                    <Users size={16} className="text-brand-600" />
                  )}
                  <div>
                    {group.isMaster ? (
                      <h3 className="text-sm font-semibold text-purple-900">{group.name}</h3>
                    ) : (
                      <Link href={`/master/tenants/${group.id}`} className="flex items-center gap-1 text-sm font-semibold text-gray-800 hover:text-brand-700 hover:underline">
                        {group.name}
                        <ExternalLink size={11} />
                      </Link>
                    )}
                    <p className="text-[11px] text-gray-500">
                      {group.users.length} usuário{group.users.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {group.users.length}
                </span>
              </div>

              {/* Tabela do tenant */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Usuário</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Papel</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Cargo</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Último login</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-[140px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                          {u.mustChangePassword && (
                            <span className="text-[10px] font-medium text-amber-600">⚠ Troca de senha pendente</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">
                          {u.position ? u.position.name : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[u.status] ?? ''}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(u.lastLoginAt)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditUser(u)} title="Editar"
                              className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            ><Edit2 size={13} /></button>
                            <button onClick={() => setResetUser(u)} title="Resetar senha"
                              className="rounded p-1 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                            ><Key size={13} /></button>
                            {u.status === 'ATIVO' ? (
                              <button onClick={() => quickStatus(u, 'BLOQUEADO')} title="Bloquear"
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              ><UserX size={13} /></button>
                            ) : (
                              <button onClick={() => quickStatus(u, 'ATIVO')} title="Reativar"
                                className="rounded p-1 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                              ><UserCheck size={13} /></button>
                            )}
                            {u.status === 'INATIVO' ? (
                              <button onClick={() => setPurgeUser(u)} title="EXCLUIR PERMANENTEMENTE (force purge)"
                                className="rounded p-1 text-red-500 hover:bg-red-100 hover:text-red-800"
                              ><Trash2 size={13} /></button>
                            ) : (
                              <button onClick={() => setDeleteUser(u)} title="Inativar (soft delete)"
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-700"
                              ><Trash2 size={13} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginação global */}
      {meta.pages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">
            {((page - 1) * meta.limit) + 1}–{Math.min(page * meta.limit, meta.total)} de {meta.total} usuários
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            ><ChevronLeft size={14} /></button>
            <span className="px-2 text-xs text-gray-700">{page} / {meta.pages}</span>
            <button onClick={() => setPage(p => Math.min(meta.pages, p + 1))} disabled={page === meta.pages}
              className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            ><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Modals */}
      {editUser  && <EditModal  user={editUser}  positions={positions} onClose={() => setEditUser(null)}  onSaved={handleSaved} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onSaved={handleSaved} />}
      {deleteUser && (
        <DeleteUserModal
          user={deleteUser}
          isSelf={session?.user?.id === deleteUser.id}
          onClose={() => setDeleteUser(null)}
          onDeleted={(msg) => {
            setDeleteUser(null)
            load()
            if (msg) {
              setSuccess(msg)
              setTimeout(() => setSuccess(''), 4000)
            }
          }}
        />
      )}
      {purgeUser && (
        <PurgeUserModal
          user={purgeUser}
          isSelf={session?.user?.id === purgeUser.id}
          onClose={() => setPurgeUser(null)}
          onPurged={(msg) => {
            setPurgeUser(null)
            load()
            if (msg) {
              setSuccess(msg)
              setTimeout(() => setSuccess(''), 5000)
            }
          }}
        />
      )}
    </div>
  )
}
