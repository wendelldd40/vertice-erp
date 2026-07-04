import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, PackageOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { moeda } from '../lib/formatos'

const PAGINA = 25

export default function Produtos() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()

  const [lista, setLista] = useState(null)
  const [total, setTotal] = useState(0)
  const [busca, setBusca] = useState('')
  const [categorias, setCategorias] = useState([])
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('ativos')
  const [pagina, setPagina] = useState(0)
  const [modalRapido, setModalRapido] = useState(false)
  const debounce = useRef(null)

  const carregar = useCallback(async (termo, cat, status, pag) => {
    let q = supabase
      .from('produtos')
      .select('id, nome, sku, imagem_url, preco_custo, preco_venda, estoque_minimo, ativo, categoria_id, estoque_saldos(quantidade)', { count: 'exact' })
      .eq('empresa_id', empresa.id)
      .order('criado_em', { ascending: false })
      .range(pag * PAGINA, pag * PAGINA + PAGINA - 1)

    if (termo) q = q.or(`nome.ilike.%${termo}%,sku.ilike.%${termo}%,codigo_barras.ilike.%${termo}%`)
    if (cat) q = q.eq('categoria_id', cat)
    if (status === 'ativos') q = q.eq('ativo', true)
    if (status === 'inativos') q = q.eq('ativo', false)

    const { data, count } = await q
    setLista(data ?? [])
    setTotal(count ?? 0)
  }, [empresa.id])

  useEffect(() => {
    supabase.from('categorias').select('id, nome').eq('empresa_id', empresa.id).order('nome')
      .then(({ data }) => setCategorias(data ?? []))
  }, [empresa.id])

  // Busca instantânea com debounce
  useEffect(() => {
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      setPagina(0)
      carregar(busca, filtroCategoria, filtroStatus, 0)
    }, 250)
    return () => clearTimeout(debounce.current)
  }, [busca, filtroCategoria, filtroStatus, carregar])

  useEffect(() => { carregar(busca, filtroCategoria, filtroStatus, pagina) }, [pagina]) // eslint-disable-line

  const saldoTotal = (p) => (p.estoque_saldos ?? []).reduce((s, x) => s + Number(x.quantidade), 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Produtos</h1>
          <p className="page-sub">{total} {total === 1 ? 'produto' : 'produtos'}</p>
        </div>
        {can('produtos', 'criar') && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => navigate('/produtos/novo')}>
              Cadastro completo
            </button>
            <button className="btn btn-primary" onClick={() => setModalRapido(true)}>
              <Plus size={15} /> Produto rápido
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-faint)' }} />
          <input
            className="input"
            style={{ paddingLeft: 34 }}
            placeholder="Nome, SKU ou código de barras…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select className="select" style={{ width: 180 }} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className="select" style={{ width: 130 }} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {lista === null ? (
          <div style={{ padding: 16 }}>
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)}
          </div>
        ) : lista.length === 0 ? (
          <div className="empty">
            <PackageOpen size={26} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
            <strong>{busca ? 'Nada encontrado' : 'Nenhum produto ainda'}</strong>
            {busca ? 'Tente outro termo de busca.' : 'Cadastre o primeiro em segundos com o botão "Produto rápido".'}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th style={{ textAlign: 'right' }}>Custo</th>
                <th style={{ textAlign: 'right' }}>Venda</th>
                <th style={{ textAlign: 'right' }}>Estoque</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const saldo = saldoTotal(p)
                const baixo = p.ativo && Number(p.estoque_minimo) > 0 && saldo <= Number(p.estoque_minimo)
                return (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/produtos/${p.id}`)}>
                    <td style={{ fontWeight: 500 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          width: 34, height: 34, borderRadius: 7, overflow: 'hidden', flexShrink: 0,
                          background: 'var(--surface-2)', border: '1px solid var(--border)',
                          display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--text-faint)',
                        }}>
                          {p.imagem_url
                            ? <img src={p.imagem_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : (p.nome || '?')[0].toUpperCase()}
                        </span>
                        {p.nome}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.sku || '—'}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{moeda(p.preco_custo)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{moeda(p.preco_venda)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {saldo}
                      {baixo && <span className="badge badge-warn" style={{ marginLeft: 8 }}>baixo</span>}
                    </td>
                    <td>
                      <span className={`badge ${p.ativo ? 'badge-success' : 'badge-muted'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > PAGINA && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            Página {pagina + 1} de {Math.ceil(total / PAGINA)}
          </span>
          <button className="btn btn-ghost" disabled={(pagina + 1) * PAGINA >= total} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
        </div>
      )}

      {modalRapido && (
        <ModalProdutoRapido
          onClose={() => setModalRapido(false)}
          onSalvo={() => { setModalRapido(false); carregar(busca, filtroCategoria, filtroStatus, pagina) }}
        />
      )}
    </div>
  )
}

/* Cadastro rápido: nome + preço + estoque inicial. Vendável em 10 segundos. */
function ModalProdutoRapido({ onClose, onSalvo }) {
  const { empresa, profile } = useAuth()
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [estoque, setEstoque] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    if (!nome.trim()) { setErro('Informe o nome do produto'); return }
    setErro('')
    setSalvando(true)
    const { data: prod, error } = await supabase.from('produtos').insert({
      empresa_id: empresa.id,
      nome: nome.trim(),
      preco_venda: Number(preco) || 0,
    }).select('id').single()
    if (error) { setErro(error.message); setSalvando(false); return }

    const qtd = Number(estoque)
    if (qtd > 0) {
      const { data: dep } = await supabase.from('depositos')
        .select('id').eq('empresa_id', empresa.id).eq('padrao', true).limit(1).single()
      if (dep) {
        await supabase.rpc('movimentar_estoque', {
          p_produto: prod.id, p_deposito: dep.id,
          p_tipo: 'entrada', p_quantidade: qtd,
          p_motivo: 'Estoque inicial',
        })
      }
    }
    onSalvo()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Produto rápido</h2>
        <div className="field">
          <label className="label" htmlFor="pr-nome">Nome</label>
          <input id="pr-nome" className="input" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ração Premium 10kg" />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="pr-preco">Preço de venda</label>
            <input id="pr-preco" className="input" type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="pr-est">Estoque inicial</label>
            <input
              id="pr-est" className="input" type="number" min="0" value={estoque}
              onChange={(e) => setEstoque(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && salvar()}
              placeholder="0"
            />
          </div>
        </div>
        {erro && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar produto'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 12 }}>
          Detalhes como categoria, código de barras e dados fiscais podem ser preenchidos depois, na edição completa.
        </p>
      </div>
    </div>
  )
}
