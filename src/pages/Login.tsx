import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('E-mail ou senha inválidos')
    setEnviando(false)
  }

  return (
    <div className="tela-centro">
      <form className="card auth-card" onSubmit={entrar}>
        <h1>CRM Cortez</h1>
        <p>Entre com sua conta</p>
        <div className="campo">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="campo">
          <label>Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        {erro && <div className="erro">{erro}</div>}
        <button className="btn" disabled={enviando} style={{ width: '100%' }}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
        <p style={{ marginTop: 12 }}>
          Não tem conta? <Link to="/cadastro">Cadastre-se</Link>
        </p>
      </form>
    </div>
  )
}
