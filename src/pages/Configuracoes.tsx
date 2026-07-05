import { FormEvent, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

type Aba = 'usuarios' | 'funil' | 'whatsapp' | 'empresa'

export default function Configuracoes() {
  const [aba, setAba] = useState<Aba>('usuarios')
  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Configurações</h2>
      <div className="abas">
        <button className={aba === 'usuarios' ? 'ativa' : ''} onClick={() => setAba('usuarios')}>Usuários e permissões</button>
        <button className={aba === 'funil' ? 'ativa' : ''} onClick={() => setAba('funil')}>Etapas do funil</button>
        <button className={aba === 'whatsapp' ? 'ativa' : ''} onClick={() => setAba('whatsapp')}>WhatsApp (Meta)</button>
        <button className={aba === 'empresa' ? 'ativa' : ''} onClick={() => setAba('empresa')}>Empresa</button>
      </div>
      {aba === 'usuarios' && <AbaUsuarios />}
      {aba === 'funil' && <AbaFunil />}
      {aba === 'whatsapp' && <AbaWhatsApp />}
      {aba === 'empresa' && <AbaEmpresa />}
    </div>
  )
}

/* ---------------- Usuários: pendentes, admins e atendentes ---------------- */
function AbaUsuarios() {
  const { perfil } = useAuth()
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [erro, setErro] = useState('')

  async function carregar() {
    try { setUsuarios(await api('users')) } catch (e: any) { setErro(e.message) }
  }
  useEffect(() => { carregar() }, [])

  async function atualizar(id: string, body: Record<string, string>) {
    setErro('')
    try { await api(`users/${id}`, { method: 'PUT', body }); carregar() }
    catch (e: any) { setErro(e.message) }
  }

  const pendentes = usuarios.filter((u) => u.status === 'pendente')
  const ativos = usuarios.filter((u) => u.status !== 'pendente')

  return (
    <>
      {erro && <div className="erro">{erro}</div>}
      <div className="card">
        <h3>Pendentes de aprovação ({pendentes.length})</h3>
        {pendentes.length === 0 ? <p className="suave">Nenhum usuário pendente.</p> : (
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Cadastro</th><th></th></tr></thead>
            <tbody>
              {pendentes.map((u) => (
                <tr key={u.id}>
                  <td>{u.nome}</td><td>{u.email}</td>
                  <td>{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-mini" onClick={() => atualizar(u.id, { status: 'aprovado' })}>Aprovar como atendente</button>
                    <button className="btn btn-mini btn-secundario" onClick={() => atualizar(u.id, { status: 'aprovado', role: 'admin' })}>Aprovar como admin</button>
                    <button className="btn btn-mini btn-perigo" onClick={() => atualizar(u.id, { status: 'inativo' })}>Recusar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Administradores e atendentes</h3>
        <p className="suave" style={{ marginBottom: 8 }}>Máximo de 3 administradores.</p>
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {ativos.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}{u.id === perfil?.id && ' (você)'}</td>
                <td>{u.email}</td>
                <td><span className="tag">{u.role}</span></td>
                <td><span className="tag">{u.status}</span></td>
                <td style={{ display: 'flex', gap: 6 }}>
                  {u.id !== perfil?.id && (
                    <>
                      {u.role === 'atendente'
                        ? <button className="btn btn-mini btn-secundario" onClick={() => atualizar(u.id, { role: 'admin' })}>Tornar admin</button>
                        : <button className="btn btn-mini btn-secundario" onClick={() => atualizar(u.id, { role: 'atendente' })}>Tornar atendente</button>}
                      {u.status === 'aprovado'
                        ? <button className="btn btn-mini btn-perigo" onClick={() => atualizar(u.id, { status: 'inativo' })}>Inativar</button>
                        : <button className="btn btn-mini" onClick={() => atualizar(u.id, { status: 'aprovado' })}>Reativar</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

/* ---------------- Etapas do Kanban ---------------- */
function AbaFunil() {
  const [etapas, setEtapas] = useState<any[]>([])
  const [nova, setNova] = useState('')
  const [erro, setErro] = useState('')

  async function carregar() {
    try { setEtapas(await api('etapas')) } catch (e: any) { setErro(e.message) }
  }
  useEffect(() => { carregar() }, [])

  async function criar(e: FormEvent) {
    e.preventDefault()
    try {
      await api('etapas', { method: 'POST', body: { nome: nova, ordem: etapas.length + 1 } })
      setNova(''); carregar()
    } catch (err: any) { setErro(err.message) }
  }

  async function renomear(id: string, nome: string) {
    try { await api(`etapas/${id}`, { method: 'PUT', body: { nome } }) }
    catch (err: any) { setErro(err.message) }
  }

  async function mover(id: string, delta: number) {
    const i = etapas.findIndex((e) => e.id === id)
    const j = i + delta
    if (j < 0 || j >= etapas.length) return
    try {
      await api(`etapas/${etapas[i].id}`, { method: 'PUT', body: { ordem: j + 1 } })
      await api(`etapas/${etapas[j].id}`, { method: 'PUT', body: { ordem: i + 1 } })
      carregar()
    } catch (err: any) { setErro(err.message) }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir esta etapa?')) return
    try { await api(`etapas/${id}`, { method: 'DELETE' }); carregar() }
    catch (err: any) { setErro(err.message) }
  }

  return (
    <div className="card">
      <h3>Etapas do Kanban</h3>
      {erro && <div className="erro">{erro}</div>}
      <table>
        <thead><tr><th>Ordem</th><th>Nome</th><th></th></tr></thead>
        <tbody>
          {etapas.map((e, i) => (
            <tr key={e.id}>
              <td style={{ whiteSpace: 'nowrap' }}>
                {i + 1}{' '}
                <button className="btn btn-mini btn-secundario" onClick={() => mover(e.id, -1)}>↑</button>{' '}
                <button className="btn btn-mini btn-secundario" onClick={() => mover(e.id, 1)}>↓</button>
              </td>
              <td>
                <input defaultValue={e.nome} onBlur={(ev) => ev.target.value !== e.nome && renomear(e.id, ev.target.value)} />
              </td>
              <td><button className="btn btn-mini btn-perigo" onClick={() => excluir(e.id)}>Excluir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={criar} className="linha" style={{ marginTop: 12 }}>
        <div><label>Nova etapa</label><input value={nova} onChange={(e) => setNova(e.target.value)} required /></div>
        <div style={{ flex: '0 0 auto' }}><button className="btn">Adicionar</button></div>
      </form>
    </div>
  )
}

/* ---------------- WhatsApp / Meta ---------------- */
function AbaWhatsApp() {
  const [dados, setDados] = useState<any>(null)
  const [templates, setTemplates] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    api('configuracoes').then((d) => {
      setDados(d)
      setTemplates(((d.valores?.whatsapp_templates as string[]) ?? []).join('\n'))
    }).catch((e) => setErro(e.message))
  }, [])

  async function salvarTemplates(e: FormEvent) {
    e.preventDefault()
    setErro(''); setOk('')
    try {
      await api('configuracoes', {
        method: 'PUT',
        body: { valores: { whatsapp_templates: templates.split('\n').map((t) => t.trim()).filter(Boolean) } },
      })
      setOk('Templates salvos')
    } catch (err: any) { setErro(err.message) }
  }

  if (!dados) return <p className="suave">{erro || 'Carregando…'}</p>
  const i = dados.integracoes

  return (
    <>
      <div className="card">
        <h3>Status da integração (API oficial da Meta)</h3>
        <table>
          <tbody>
            <tr>
              <td>Token e Phone Number ID (META_ACCESS_TOKEN / META_PHONE_NUMBER_ID)</td>
              <td>{i.whatsapp_configurado ? <span className="tag vendido">configurado</span> : <span className="tag perdido">não configurado</span>}</td>
            </tr>
            <tr>
              <td>Token de verificação do webhook (META_VERIFY_TOKEN)</td>
              <td>{i.webhook_verify_token_definido ? <span className="tag vendido">definido</span> : <span className="tag perdido">não definido</span>}</td>
            </tr>
            <tr>
              <td>Chave de IA (ANTHROPIC_API_KEY)</td>
              <td>{i.ia_configurada ? <span className="tag vendido">configurada</span> : <span className="tag perdido">não configurada</span>}</td>
            </tr>
          </tbody>
        </table>
        <p className="suave" style={{ marginTop: 12 }}>
          Por segurança, tokens e chaves <strong>não são cadastrados por esta tela</strong>:
          eles ficam nas variáveis de ambiente do Netlify (Site settings → Environment variables).
          São necessários dados <strong>reais</strong> do seu app na Meta Developers: access token
          permanente, Phone Number ID, WhatsApp Business Account e webhook apontando para{' '}
          <code>https://SEU-SITE.netlify.app/api/whatsapp-webhook</code>.
          Sem essas configurações o envio e o recebimento NÃO funcionam.
        </p>
      </div>

      <form className="card" onSubmit={salvarTemplates}>
        <h3>Templates aprovados</h3>
        <p className="suave" style={{ marginBottom: 8 }}>
          Liste (um por linha) os nomes dos templates já aprovados no gerenciador do WhatsApp
          Business. Eles aparecem como opção na tela de Disparos.
        </p>
        <textarea rows={4} value={templates} onChange={(e) => setTemplates(e.target.value)} placeholder={'boas_vindas\npromocao_mensal'} />
        {erro && <div className="erro">{erro}</div>}
        {ok && <div className="sucesso">{ok}</div>}
        <button className="btn" style={{ marginTop: 8 }}>Salvar</button>
      </form>
    </>
  )
}

/* ---------------- Dados da empresa ---------------- */
function AbaEmpresa() {
  const [valores, setValores] = useState<any>({})
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    api('configuracoes').then((d) => setValores(d.valores ?? {})).catch((e) => setErro(e.message))
  }, [])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setOk('')
    try {
      await api('configuracoes', {
        method: 'PUT',
        body: {
          valores: {
            empresa_nome: valores.empresa_nome ?? '',
            empresa_telefone: valores.empresa_telefone ?? '',
            empresa_email: valores.empresa_email ?? '',
          },
        },
      })
      setOk('Dados salvos')
    } catch (err: any) { setErro(err.message) }
  }

  return (
    <form className="card" onSubmit={salvar}>
      <h3>Dados da empresa</h3>
      <div className="linha">
        <div><label>Nome</label><input value={valores.empresa_nome ?? ''} onChange={(e) => setValores({ ...valores, empresa_nome: e.target.value })} /></div>
        <div><label>Telefone</label><input value={valores.empresa_telefone ?? ''} onChange={(e) => setValores({ ...valores, empresa_telefone: e.target.value })} /></div>
        <div><label>E-mail</label><input value={valores.empresa_email ?? ''} onChange={(e) => setValores({ ...valores, empresa_email: e.target.value })} /></div>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {ok && <div className="sucesso">{ok}</div>}
      <button className="btn" style={{ marginTop: 12 }}>Salvar</button>
    </form>
  )
}
