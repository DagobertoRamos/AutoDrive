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

import { useState, useEffect, useCallback } from 'react'
import { useSession }                        from 'next-auth/react'
import { useRouter }                         from 'next/navigation'
import Link                                  from 'next/link'
import {
  Users, Search, Filter, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Shield, Edit2, Key, UserX, UserCheck,
  ChevronLeft, ChevronRight, X, Save, Plus, Eye, EyeOff,
  ExternalLink,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface UserRecord {
  id:                 string
  name:               string
  email:              string
  role:               string
  status:             string
  tenantId:           string | null
  unitId:             string | null
  mustChangePassword: boolean
  lastLoginAt:        string | null
  createdAt:          string
  tenant:             { id: string; name: string; publicId: string; status: string } | null
  unit:               { id: string; name: string } | null
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
const STATUSES = ['ATIVO','INATIVO','PENDENTE','BLOQUEADO']

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

// ── Modal: editar usuário ──────────────────────────────────────────────────────

function EditModal({ user, onClose, onSaved }: { user: UserRecord; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ role: user.role, status: user.status, mustChangePassword: user.mustChangePassword })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res  = await fetch(`/api/master/users/${user.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
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
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">Editar usuário</h2>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100"><X size={15} /></button>
        </div>
        <form onSubmit={handleSave} className="space-y-4 px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={13} className="shrink-0" />{error}
            </div>
          )}
          <div>
            <label className={labelCls}>Papel (Role)</label>
            <select className={inputCls} value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600"
              checked={form.mustChangePassword}
              onChange={e => setForm(p => ({ ...p, mustChangePassword: e.target.checked }))}
            />
            <span className="text-sm text-gray-700">Exigir troca de senha no próximo login</span>
          </label>
          <div className="flex gap-3 pt-2 border-t border-gray-100">
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

// ── Página principal ─────────────────────────────────────────────────────────

export default function MasterUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [users,    setUsers]    = useState<UserRecord[]>([])
  const [meta,     setMeta]     = useState<Meta>({ total: 0, page: 1, limit: 50, pages: 1 })
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Filtros
  const [search,   setSearch]   = useState('')
  const [roleF,    setRoleF]    = useState('')
  const [statusF,  setStatusF]  = useState('')
  const [page,     setPage]     = useState(1)

  // Modals
  const [editUser,  setEditUser]  = useState<UserRecord | null>(null)
  const [resetUser, setResetUser] = useState<UserRecord | null>(null)

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
        <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1) }}>
          <option value="">Todos os status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Usuário</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Papel</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Tenant</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Último login</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 w-[120px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">Nenhum usuário encontrado.</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                      {u.mustChangePassword && (
                        <span className="text-[10px] text-amber-600 font-medium">⚠ Troca de senha pendente</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[u.role] ?? 'bg-gray-100 text-gray-700'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[u.status] ?? ''}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.tenant ? (
                      <Link href={`/master/tenants/${u.tenant.id}`} className="hover:text-brand-700 hover:underline flex items-center gap-1">
                        {u.tenant.name}
                        <ExternalLink size={10} />
                      </Link>
                    ) : (
                      <span className="text-purple-600 font-medium">Plataforma (MASTER)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(u.lastLoginAt)}</td>
                  <td className="px-4 py-3">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">
              {((page - 1) * meta.limit) + 1}–{Math.min(page * meta.limit, meta.total)} de {meta.total}
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
      </div>

      {/* Modals */}
      {editUser  && <EditModal  user={editUser}  onClose={() => setEditUser(null)}  onSaved={handleSaved} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onSaved={handleSaved} />}
    </div>
  )
}
