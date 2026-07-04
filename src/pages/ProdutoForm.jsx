import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2, ImagePlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { margem, markup } from '../lib/formatos'

const VAZIO = {
  nome: '', descricao: '', sku: '', codigo_barras: '', categoria_id: '', imagem_url: '',
  marca: '', unidade: 'un', preco_custo: '', preco_venda: '', preco_promocional: '',
  estoque_minimo: '', ncm: '', cest: '', origem: '',
  peso_kg: '', altura_cm: '', largura_cm: '', comprimento_cm: '', ativo: true,
}

const SECOES = ['Essencial', 'Preços', 'Fiscal', 'Dimensões']

export default function ProdutoForm() {
  const { id } = useParams()
  const novo = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa } = useAuth()
  const { can } = usePermissions()

  const [form, setForm] = useState(VAZIO)
  const [categorias, setCategorias] = useState([])
  const [secao, setSecao] = useState('Essencial')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [carregado, setCarregado] = useState(novo)
  const [enviandoFoto, setEnviandoFoto] = useState(false)

  const enviarFoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setErro('A imagem deve ter no máximo 3 MB'); return }
    setErro('')
    setEnviandoFoto(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${empresa.id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('produtos').upload(path, file, { cacheControl: '3600' })
    setEnviandoFoto(false)
    if (error) { setErro('Falha no upload: ' + error.message); return }
    const { data } = supabase.storage.from('produtos').getPublicUrl(path)
    setForm((f) => ({ ...f, imagem_url: data.publicUrl }))
  }

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  useEffect(() => {
    supabase.from('categorias').select('id, nome').eq('empresa_id', empresa.id).order('nome')
      .then(({ data }) => setCategorias(data ?? []))
  }, [empresa.id])

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('produtos').select('*').eq('id', id).single()
    if (data) {
      const f = { ...VAZIO }
      for (const k of Object.keys(VAZIO)) f[k] = data[k] ?? ''
      f.ativo = data.ativo
      setForm(f)
    }
    setCarregado(true)
  }, [id])

  useEffect(() => { if (!novo) carregar() }, [novo, carregar])

  const salvar = async () => {
    if (!form.nome.trim()) { setErro('O nome é obrigatório'); setSecao('Essencial'); return }
    setErro('')
    setSalvando(true)

    const payload = {
      empresa_id: empresa.id,
      nome: form.nome.trim(),
      descricao: form.descricao || null,
      sku: form.sku || null,
      codigo_barras: form.codigo_barras || null,
      categoria_id: form.categoria_id || null,
      marca: form.marca || null,
      unidade: form.unidade,
      preco_custo: Number(form.preco_custo) || 0,
      preco_venda: Number(form.preco_venda) || 0,
      preco_promocional: form.preco_promocional === '' ? null : Number(form.preco_promocional),
      estoque_minimo: Number(form.estoque_minimo) || 0,
      ncm: form.ncm || null,
      cest: form.cest || null,
      origem: form.origem || null,
      peso_kg: form.peso_kg === '' ? null : Number(form.peso_kg),
      altura_cm: form.altura_cm === '' ? null : Number(form.altura_cm),
      largura_cm: form.largura_cm === '' ? null : Number(form.largura_cm),
      comprimento_cm: form.comprimento_cm === '' ? null : Number(form.comprimento_cm),
      ativo: form.ativo,
      imagem_url: form.imagem_url || null,
    }

    const q = novo
      ? supabase.from('produtos').insert(payload)
      : supabase.from('produtos').update(payload).eq('id', id)

    const { error } = await q
    setSalvando(false)
    if (error) { setErro(error.message); return }
    navigate('/produtos')
  }

  const excluir = async () => {
    if (!window.confirm('Excluir este produto? As movimentações de estoque dele também serão removidas.')) return
    await supabase.from('produtos').delete().eq('id', id)
    navigate('/produtos')
  }

  const m = margem(form.preco_custo, form.preco_venda)
  const mk = markup(form.preco_custo, form.preco_venda)

  if (!carregado) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 44, marginBottom: 10, maxWidth: 480 }} />
        <div className="skeleton" style={{ height: 240, maxWidth: 640 }} />
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 780 }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="icon-btn" onClick={() => navigate('/produtos')} aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">{novo ? 'Novo produto' : form.nome || 'Editar produto'}</h1>
            <p className="page-sub">Só o nome é obrigatório. O resto pode vir depois.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!novo && can('produtos', 'excluir') && (
            <button className="btn btn-danger" onClick={excluir}><Trash2 size={14} /> Excluir</button>
          )}
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {SECOES.map((s) => (
          <button key={s} className={`btn ${secao === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSecao(s)}>
            {s}
          </button>
        ))}
      </div>

      {erro && <div className="badge badge-danger" style={{ marginBottom: 14 }}>{erro}</div>}

      <div className="card" style={{ padding: 22 }}>
        {secao === 'Essencial' && (
          <>
            <div className="field">
              <label className="label">Foto</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 84, height: 84, borderRadius: 'var(--radius)', overflow: 'hidden',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  display: 'grid', placeItems: 'center', flexShrink: 0,
                }}>
                  {form.imagem_url
                    ? <img src={form.imagem_url} alt={form.nome || 'Produto'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <ImagePlus size={22} style={{ color: 'var(--text-faint)' }} />}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                    <ImagePlus size={14} /> {enviandoFoto ? 'Enviando…' : form.imagem_url ? 'Trocar foto' : 'Adicionar foto'}
                    <input type="file" accept="image/*" onChange={enviarFoto} style={{ display: 'none' }} disabled={enviandoFoto} />
                  </label>
                  {form.imagem_url && (
                    <button className="btn btn-ghost" onClick={() => setForm((f) => ({ ...f, imagem_url: '' }))}>
                      <X size={14} /> Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="f-nome">Nome *</label>
              <input id="f-nome" className="input" value={form.nome} onChange={set('nome')} placeholder="Ração Premium 10kg" />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-desc">Descrição</label>
              <textarea id="f-desc" className="input" rows={3} value={form.descricao} onChange={set('descricao')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="f-sku">SKU</label>
                <input id="f-sku" className="input" value={form.sku} onChange={set('sku')} placeholder="RAC-010" />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-cb">Código de barras</label>
                <input id="f-cb" className="input" value={form.codigo_barras} onChange={set('codigo_barras')} placeholder="7890000000000" />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-cat">Categoria</label>
                <select id="f-cat" className="select" value={form.categoria_id} onChange={set('categoria_id')}>
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="f-marca">Marca</label>
                <input id="f-marca" className="input" value={form.marca} onChange={set('marca')} />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-un">Unidade</label>
                <select id="f-un" className="select" value={form.unidade} onChange={set('unidade')}>
                  {['un', 'kg', 'g', 'l', 'ml', 'm', 'cx', 'pct'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="f-min">Estoque mínimo</label>
                <input id="f-min" className="input" type="number" min="0" value={form.estoque_minimo} onChange={set('estoque_minimo')} placeholder="0" />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" className="perm-check" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} />
              Produto ativo (aparece nas vendas)
            </label>
          </>
        )}

        {secao === 'Preços' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <div className="field">
                <label className="label" htmlFor="f-custo">Preço de custo</label>
                <input id="f-custo" className="input" type="number" min="0" step="0.01" value={form.preco_custo} onChange={set('preco_custo')} placeholder="0,00" />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-venda">Preço de venda</label>
                <input id="f-venda" className="input" type="number" min="0" step="0.01" value={form.preco_venda} onChange={set('preco_venda')} placeholder="0,00" />
              </div>
              <div className="field">
                <label className="label" htmlFor="f-promo">Preço promocional</label>
                <input id="f-promo" className="input" type="number" min="0" step="0.01" value={form.preco_promocional} onChange={set('preco_promocional')} placeholder="opcional" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className={`badge ${m == null ? 'badge-muted' : m < 0 ? 'badge-danger' : m < 15 ? 'badge-warn' : 'badge-success'}`}>
                Margem: {m == null ? '—' : `${m.toFixed(1)}%`}
              </span>
              <span className="badge badge-muted">
                Markup: {mk == null ? '—' : `${mk.toFixed(1)}%`}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12 }}>
              Margem é o lucro sobre o preço de venda; markup, sobre o custo. Calculados em tempo real enquanto você digita.
            </p>
          </>
        )}

        {secao === 'Fiscal' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div className="field">
              <label className="label" htmlFor="f-ncm">NCM</label>
              <input id="f-ncm" className="input" value={form.ncm} onChange={set('ncm')} placeholder="0000.00.00" />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-cest">CEST</label>
              <input id="f-cest" className="input" value={form.cest} onChange={set('cest')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-origem">Origem</label>
              <select id="f-origem" className="select" value={form.origem} onChange={set('origem')}>
                <option value="">Não informada</option>
                <option value="0">0 — Nacional</option>
                <option value="1">1 — Estrangeira (importação direta)</option>
                <option value="2">2 — Estrangeira (mercado interno)</option>
              </select>
            </div>
          </div>
        )}

        {secao === 'Dimensões' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
            <div className="field">
              <label className="label" htmlFor="f-peso">Peso (kg)</label>
              <input id="f-peso" className="input" type="number" min="0" step="0.001" value={form.peso_kg} onChange={set('peso_kg')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-alt">Altura (cm)</label>
              <input id="f-alt" className="input" type="number" min="0" step="0.01" value={form.altura_cm} onChange={set('altura_cm')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-larg">Largura (cm)</label>
              <input id="f-larg" className="input" type="number" min="0" step="0.01" value={form.largura_cm} onChange={set('largura_cm')} />
            </div>
            <div className="field">
              <label className="label" htmlFor="f-comp">Comprimento (cm)</label>
              <input id="f-comp" className="input" type="number" min="0" step="0.01" value={form.comprimento_cm} onChange={set('comprimento_cm')} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
