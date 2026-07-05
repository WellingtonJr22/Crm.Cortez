import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Cadastro() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function cadastrar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    // O trigger no banco cria o perfil com status 'pendente'.
    // O acesso só é liberado depois que um administrador aprovar.
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    })
    if (error) setErro(error.message)
    else setFeito(true)
    setEnviando(false)
  }

  if (feito) {
    return (
      <div className="tela-centro">
        <div className="card auth-card" style={{ textAlign: 'center' }}>
          <h1>Cadastro enviado</h1>
          <p>
            Sua conta foi criada e está <strong>pendente de aprovação</strong> por um
            administrador. Você poderá entrar assim que for aprovado.
          </p>
          <Link to="/login">Voltar ao login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="tela-centro">
      <form className="card auth-card" onSubmit={cadastrar}>
        <h1>Criar conta</h1>
        <p>O acesso é liberado por um administrador após o cadastro</p>
        <div className="campo">
          <label>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div className="campo">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="campo">
          <label>Senha (mínimo 6 caracteres)</label>
          <input type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        {erro && <div className="erro">{erro}</div>}
        <button className="btn" disabled={enviando} style={{ width: '100%' }}>
          {enviando ? 'Enviando…' : 'Cadastrar'}
        </button>
        <p style={{ marginTop: 12 }}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </form>
    </div>
  )
}
