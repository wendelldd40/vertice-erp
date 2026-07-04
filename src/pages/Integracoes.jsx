import { useEffect, useState, useCallback, useRef } from 'react'
import { Webhook, MessageCircle, FileSpreadsheet, Store, Check, Upload, Download, Link2, RefreshCw, Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import { baixarCSV } from '../lib/csv'
import { moeda } from '../lib/formatos'

export default function Integracoes() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const podeEditar = can('configuracoes', 'editar')

  const [configs, setConfigs] = useState(null)
  const [importar, setImportar] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('integracoes').select('*').eq('empresa_id', empresa.id)
    setConfigs(data ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  const cfg = (tipo) => (configs ?? []).find((c) => c.tipo === tipo)

  const salvarWebhook = async (url, ativo) => {
    const existente = cfg('webhook_vendas')
    if (existente) {
      await supabase.from('integracoes')
        .update({ config: { url }, ativo })
        .eq('id', existente.id)
    } else {
      await supabase.from('integracoes')
        .insert({ empresa_id: empresa.id, tipo: 'webhook_vendas', config: { url }, ativo })
    }
    carregar()
  }

  const exportarProdutos = async () => {
    const { data } = await supabase
      .from('produtos')
      .select('nome, sku, codigo_barras, preco_custo, preco_venda, estoque_minimo, unidade, marca, ncm, ativo')
      .eq('empresa_id', empresa.id)
      .order('nome')
    baixarCSV('produtos_vertice.csv',
      [
        { campo: 'nome', titulo: 'nome' },
        { campo: 'sku', titulo: 'sku' },
        { campo: 'codigo_barras', titulo: 'codigo_barras' },
        { campo: 'preco_custo', titulo: 'preco_custo' },
        { campo: 'preco_venda', titulo: 'preco_venda' },
        { campo: 'estoque_minimo', titulo: 'estoque_minimo' },
        { campo: 'unidade', titulo: 'unidade' },
        { campo: 'marca', titulo: 'marca' },
        { campo: 'ncm', titulo: 'ncm' },
        { campo: 'ativo', titulo: 'ativo' },
      ],
      (data ?? []).map((p) => ({
        ...p,
        preco_custo: Number(p.preco_custo), preco_venda: Number(p.preco_venda),
        estoque_minimo: Number(p.estoque_minimo), ativo: p.ativo ? 'sim' : 'nao',
      }))
    )
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Integrações</h1>
          <p className="page-sub">Conecte o Vértice ao resto da sua operação.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>

        <CardWebhook
          config={cfg('webhook_vendas')}
          podeEditar={podeEditar}
          onSalvar={salvarWebhook}
          carregando={configs === null}
        />

        <CardIntegracao
          icon={MessageCircle}
          titulo="WhatsApp"
          badge={<span className="badge badge-success"><Check size={11} /> Ativa</span>}
        >
          Sem configuração: já funciona em todo o sistema.
          <ul style={{ margin: '10px 0 0 18px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <li><strong>PDV</strong>: botão de comprovante por WhatsApp na tela de venda concluída.</li>
            <li><strong>Contas a receber</strong>: botão de cobrança com mensagem pronta em cada lançamento.</li>
          </ul>
        </CardIntegracao>

        <CardIntegracao
          icon={FileSpreadsheet}
          titulo="Importar / Exportar produtos"
          badge={<span className="badge badge-success"><Check size={11} /> Ativa</span>}
        >
          Migre o catálogo de outro sistema em CSV, ou exporte o seu.
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {can('produtos', 'criar') && (
              <button className="btn btn-primary" onClick={() => setImportar(true)}>
                <Upload size={14} /> Importar CSV
              </button>
            )}
            <button className="btn btn-ghost" onClick={exportarProdutos}>
              <Download size={14} /> Exportar produtos
            </button>
          </div>
        </CardIntegracao>

        <CardMercadoLivre />

        <CardIntegracao
          icon={Store}
          titulo="Shopee e Amazon"
          badge={<span className="badge badge-warn">Planejado</span>}
        >
          Mesma arquitetura do Mercado Livre (Edge Functions + OAuth), aguardando credenciais
          de desenvolvedor de cada plataforma. A Shopee Open Platform exige app aprovado;
          a Amazon SP-API tem processo de homologação próprio.
        </CardIntegracao>
      </div>

      {importar && (
        <ModalImportarProdutos
          onClose={() => setImportar(false)}
          onImportado={() => setImportar(false)}
        />
      )}
    </div>
  )
}

function CardIntegracao({ icon: Icon, titulo, badge, children }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center',
          background: 'var(--accent-soft)', color: 'var(--accent-text)', flexShrink: 0,
        }}>
          <Icon size={18} />
        </div>
        <div style={{ fontWeight: 600, flex: 1 }}>{titulo}</div>
        {badge}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function CardWebhook({ config, podeEditar, onSalvar, carregando }) {
  const [url, setUrl] = useState('')
  const [ativo, setAtivo] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (config) {
      setUrl(config.config?.url ?? '')
      setAtivo(config.ativo)
    }
  }, [config])

  const salvar = async () => {
    setErro('')
    if (ativo && !url.startsWith('https://')) {
      setErro('A URL precisa começar com https://')
      return
    }
    await onSalvar(url.trim(), ativo)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 1800)
  }

  return (
    <CardIntegracao
      icon={Webhook}
      titulo="Webhook de vendas"
      badge={config?.ativo
        ? <span className="badge badge-success"><Check size={11} /> Ativa</span>
        : <span className="badge badge-muted">Inativa</span>}
    >
      Cada venda (e cancelamento) dispara um POST JSON para a URL abaixo.
      Cole aqui um webhook do <strong>Make</strong>, n8n ou Zapier e leve as vendas
      para planilhas, WhatsApp API, e-mail — o que quiser.
      {carregando ? (
        <div className="skeleton" style={{ height: 38, marginTop: 12 }} />
      ) : (
        <>
          <input
            className="input" style={{ marginTop: 12 }}
            placeholder="https://hook.us1.make.com/…"
            value={url} onChange={(e) => setUrl(e.target.value)}
            disabled={!podeEditar}
            aria-label="URL do webhook"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" className="perm-check" checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)} disabled={!podeEditar} />
              Ativar
            </label>
            {podeEditar && (
              <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={salvar}>
                {salvo ? 'Salvo ✓' : 'Salvar'}
              </button>
            )}
          </div>
          {erro && <div className="badge badge-danger" style={{ marginTop: 10 }}>{erro}</div>}
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 10 }}>
            Payload: evento, número, total, forma de pagamento, cliente e data.
            O disparo é assíncrono — nunca atrasa uma venda.
          </div>
        </>
      )}
    </CardIntegracao>
  )
}

/* ---------------- IMPORTAÇÃO DE PRODUTOS ---------------- */
function ModalImportarProdutos({ onClose, onImportado }) {
  const { empresa } = useAuth()
  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState(null)
  const [importando, setImportando] = useState(false)
  const fileRef = useRef(null)

  const lerArquivo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErro('')
    setResultado(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseCSV(String(reader.result))
        if (!parsed.length) { setErro('Arquivo vazio ou sem linhas válidas'); return }
        if (!parsed[0].nome) { setErro('O CSV precisa ter uma coluna "nome"'); return }
        setLinhas(parsed)
      } catch (err) {
        setErro('Não consegui ler o arquivo: ' + err.message)
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  const importar = async () => {
    setImportando(true)
    setErro('')
    const payload = linhas
      .filter((l) => (l.nome || '').trim())
      .map((l) => ({
        empresa_id: empresa.id,
        nome: l.nome.trim(),
        sku: l.sku || null,
        codigo_barras: l.codigo_barras || null,
        marca: l.marca || null,
        ncm: l.ncm || null,
        unidade: l.unidade || 'un',
        preco_custo: numBR(l.preco_custo),
        preco_venda: numBR(l.preco_venda),
        estoque_minimo: numBR(l.estoque_minimo),
        ativo: (l.ativo || 'sim').toLowerCase() !== 'nao',
      }))

    // Lotes de 200 para não estourar o request
    let ok = 0, falhas = 0
    for (let i = 0; i < payload.length; i += 200) {
      const lote = payload.slice(i, i + 200)
      const { error } = await supabase.from('produtos').insert(lote)
      if (error) falhas += lote.length
      else ok += lote.length
    }
    setImportando(false)
    setResultado({ ok, falhas })
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22, width: 'min(620px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Importar produtos (CSV)</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Separador vírgula ou ponto-e-vírgula. Coluna obrigatória: <code>nome</code>.
          Opcionais: <code>sku</code>, <code>codigo_barras</code>, <code>preco_custo</code>, <code>preco_venda</code>,{' '}
          <code>estoque_minimo</code>, <code>unidade</code>, <code>marca</code>, <code>ncm</code>, <code>ativo</code> (sim/nao).
          Dica: exporte seus produtos primeiro para usar como modelo.
        </p>

        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={lerArquivo} style={{ display: 'none' }} />
        <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Escolher arquivo CSV
        </button>

        {linhas && !resultado && (
          <>
            <div className="card" style={{ marginTop: 14, boxShadow: 'none', overflow: 'auto', maxHeight: 220 }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead>
                  <tr><th>Nome</th><th>SKU</th><th style={{ textAlign: 'right' }}>Custo</th><th style={{ textAlign: 'right' }}>Venda</th></tr>
                </thead>
                <tbody>
                  {linhas.slice(0, 8).map((l, i) => (
                    <tr key={i}>
                      <td>{l.nome}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{l.sku || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{l.preco_custo || '0'}</td>
                      <td style={{ textAlign: 'right' }}>{l.preco_venda || '0'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
              Prévia das primeiras linhas · {linhas.length} produtos no arquivo
            </div>
          </>
        )}

        {resultado && (
          <div className={`badge ${resultado.falhas ? 'badge-warn' : 'badge-success'}`} style={{ marginTop: 14 }}>
            {resultado.ok} produtos importados{resultado.falhas ? ` · ${resultado.falhas} falharam` : ''}
          </div>
        )}

        {erro && <div className="badge badge-danger" style={{ marginTop: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={resultado ? onImportado : onClose}>
            {resultado ? 'Concluir' : 'Cancelar'}
          </button>
          {linhas && !resultado && (
            <button className="btn btn-primary" onClick={importar} disabled={importando}>
              {importando ? 'Importando…' : `Importar ${linhas.length} produtos`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Parser CSV leve: detecta , ou ; e respeita aspas
function parseCSV(texto) {
  const linhas = texto.replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!linhas.length) return []
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ','

  const splitLinha = (linha) => {
    const campos = []
    let atual = '', dentroAspas = false
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i]
      if (ch === '"') {
        if (dentroAspas && linha[i + 1] === '"') { atual += '"'; i++ }
        else dentroAspas = !dentroAspas
      } else if (ch === sep && !dentroAspas) {
        campos.push(atual); atual = ''
      } else atual += ch
    }
    campos.push(atual)
    return campos.map((c) => c.trim())
  }

  const cab = splitLinha(linhas[0]).map((c) =>
    c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
  )
  return linhas.slice(1).map((l) => {
    const vals = splitLinha(l)
    const obj = {}
    cab.forEach((c, i) => { obj[c] = vals[i] ?? '' })
    return obj
  })
}

// "12,50" ou "12.50" → 12.5
function numBR(v) {
  if (v == null || v === '') return 0
  return Number(String(v).replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')) || 0
}

/* ---------------- MERCADO LIVRE ---------------- */
function CardMercadoLivre() {
  const { empresa } = useAuth()
  const { can } = usePermissions()
  const [conexao, setConexao] = useState(undefined) // undefined=carregando, null=desconectado
  const [vinculos, setVinculos] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [modalVincular, setModalVincular] = useState(false)
  const [modalPedidos, setModalPedidos] = useState(false)
  const [sync, setSync] = useState(null) // null | 'rodando' | resultado
  const appId = import.meta.env.VITE_ML_APP_ID

  const carregar = useCallback(async () => {
    const [{ data: cx }, { data: vc }, { data: pd }] = await Promise.all([
      supabase.from('marketplace_conexoes').select('*').eq('marketplace', 'mercadolivre').maybeSingle(),
      supabase.from('produto_vinculos').select('id').eq('empresa_id', empresa.id).eq('marketplace', 'mercadolivre'),
      supabase.from('pedidos_marketplace').select('id, pedido_externo, total, comprador, status, criado_em, dados')
        .eq('empresa_id', empresa.id).order('criado_em', { ascending: false }).limit(20),
    ])
    setConexao(cx ?? null)
    setVinculos(vc ?? [])
    setPedidos(pd ?? [])
  }, [empresa.id])

  useEffect(() => { carregar() }, [carregar])

  // feedback do redirect do OAuth (?ml=ok|erro)
  const [avisoOAuth] = useState(() => new URLSearchParams(window.location.search).get('ml'))

  const conectar = () => {
    const redirect = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ml-oauth`
    window.location.href =
      `https://auth.mercadolivre.com.br/authorization?response_type=code` +
      `&client_id=${appId}&redirect_uri=${encodeURIComponent(redirect)}&state=${empresa.id}`
  }

  const sincronizar = async () => {
    setSync('rodando')
    const { data, error } = await supabase.functions.invoke('ml', { body: { action: 'sync_estoque' } })
    setSync(error ? { erro: error.message } : data)
  }

  const novos = pedidos.filter((p) => p.status === 'novo').length

  return (
    <CardIntegracao
      icon={Store}
      titulo="Mercado Livre"
      badge={conexao === undefined
        ? <span className="badge badge-muted">…</span>
        : conexao
          ? <span className="badge badge-success"><Check size={11} /> {conexao.apelido || 'Conectado'}</span>
          : <span className="badge badge-muted">Desconectado</span>}
    >
      Sincronize o estoque do Vértice com seus anúncios e receba os pedidos automaticamente.

      {avisoOAuth === 'ok' && <div className="badge badge-success" style={{ marginTop: 10 }}>Conta conectada com sucesso!</div>}
      {avisoOAuth === 'erro' && <div className="badge badge-danger" style={{ marginTop: 10 }}>Falha na conexão. Tente novamente.</div>}

      {!appId ? (
        <div className="badge badge-warn" style={{ marginTop: 12 }}>
          Configure VITE_ML_APP_ID no .env e faça o deploy das Edge Functions (passo a passo no README).
        </div>
      ) : conexao === null ? (
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={conectar}>Conectar conta do Mercado Livre</button>
        </div>
      ) : conexao ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {can('produtos', 'editar') && (
              <button className="btn btn-ghost" onClick={() => setModalVincular(true)}>
                <Link2 size={14} /> Vincular anúncios ({vinculos.length})
              </button>
            )}
            <button className="btn btn-primary" onClick={sincronizar} disabled={sync === 'rodando'}>
              <RefreshCw size={14} /> {sync === 'rodando' ? 'Sincronizando…' : 'Sincronizar estoque'}
            </button>
            <button className="btn btn-ghost" onClick={() => setModalPedidos(true)}>
              <Inbox size={14} /> Pedidos {novos > 0 && <span className="badge badge-accent">{novos} novos</span>}
            </button>
          </div>
          {sync && sync !== 'rodando' && (
            <div className={`badge ${sync.erro || sync.erros ? 'badge-warn' : 'badge-success'}`} style={{ marginTop: 10 }}>
              {sync.erro
                ? sync.erro
                : sync.detalhe || `${sync.atualizados} anúncios atualizados${sync.erros ? ` · ${sync.erros} falharam` : ''}`}
            </div>
          )}
        </>
      ) : null}

      {modalVincular && (
        <ModalVincularML
          onClose={() => setModalVincular(false)}
          onSalvo={() => { setModalVincular(false); carregar() }}
        />
      )}
      {modalPedidos && (
        <ModalPedidosML pedidos={pedidos} onClose={() => setModalPedidos(false)} onAtualizado={carregar} />
      )}
    </CardIntegracao>
  )
}

function ModalVincularML({ onClose, onSalvo }) {
  const { empresa } = useAuth()
  const [itens, setItens] = useState(null)
  const [produtos, setProdutos] = useState([])
  const [mapa, setMapa] = useState({}) // item_externo -> produto_id
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.functions.invoke('ml', { body: { action: 'itens' } }).then(({ data, error }) => {
      if (error) { setErro(error.message); setItens([]); return }
      if (data?.erro) { setErro(data.erro); setItens([]); return }
      setItens(data?.itens ?? [])
    })
    supabase.from('produtos').select('id, nome, sku').eq('empresa_id', empresa.id).eq('ativo', true).order('nome')
      .then(({ data }) => setProdutos(data ?? []))
    supabase.from('produto_vinculos').select('item_externo, produto_id')
      .eq('empresa_id', empresa.id).eq('marketplace', 'mercadolivre')
      .then(({ data }) => {
        const m = {}
        for (const v of data ?? []) m[v.item_externo] = v.produto_id
        setMapa(m)
      })
  }, [empresa.id])

  const salvar = async () => {
    setSalvando(true)
    setErro('')
    const rows = Object.entries(mapa)
      .filter(([, produto_id]) => produto_id)
      .map(([item_externo, produto_id]) => ({
        empresa_id: empresa.id, marketplace: 'mercadolivre',
        item_externo, produto_id,
        titulo_externo: itens?.find((i) => i.id === item_externo)?.titulo ?? null,
      }))
    // limpa e regrava (simples e correto para esse volume)
    await supabase.from('produto_vinculos').delete()
      .eq('empresa_id', empresa.id).eq('marketplace', 'mercadolivre')
    if (rows.length) {
      const { error } = await supabase.from('produto_vinculos').insert(rows)
      if (error) { setErro(error.message); setSalvando(false); return }
    }
    setSalvando(false)
    onSalvo()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22, width: 'min(680px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Vincular anúncios do Mercado Livre</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Escolha qual produto do Vértice corresponde a cada anúncio. A sincronização de estoque usa esses vínculos.
        </p>

        {itens === null ? (
          [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />)
        ) : itens.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>
            {erro ? erro : 'Nenhum anúncio ativo encontrado na conta conectada.'}
          </div>
        ) : (
          <div style={{ maxHeight: 340, overflow: 'auto' }}>
            {itens.map((it) => (
              <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.titulo}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{it.id} · estoque no ML: {it.estoque}</div>
                </div>
                <select
                  className="select" style={{ width: 220 }}
                  value={mapa[it.id] ?? ''}
                  onChange={(e) => setMapa((m) => ({ ...m, [it.id]: e.target.value }))}
                  aria-label={`Produto para ${it.titulo}`}
                >
                  <option value="">Não vincular</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.sku ? ` (${p.sku})` : ''}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {erro && itens?.length > 0 && <div className="badge badge-danger" style={{ marginTop: 12 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          {itens?.length > 0 && (
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar vínculos'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ModalPedidosML({ pedidos, onClose, onAtualizado }) {
  const marcar = async (p, status) => {
    await supabase.from('pedidos_marketplace').update({ status }).eq('id', p.id)
    onAtualizado()
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" style={{ padding: 22, width: 'min(680px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Pedidos do Mercado Livre</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          Chegam automaticamente pelo webhook. Marque como processado após dar baixa.
        </p>

        {pedidos.length === 0 ? (
          <div className="empty" style={{ padding: 20 }}>
            <strong>Nenhum pedido recebido ainda</strong>
            Configure a URL de notificações no painel do ML (README) e os pedidos aparecem aqui sozinhos.
          </div>
        ) : (
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {pedidos.map((p) => (
              <div key={p.id} className="card" style={{ padding: 12, marginBottom: 8, boxShadow: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>#{p.pedido_externo}</span>
                  <span className="badge badge-muted">{p.comprador || 'comprador'}</span>
                  <span className={`badge ${p.status === 'novo' ? 'badge-accent' : p.status === 'processado' ? 'badge-success' : 'badge-muted'}`}>
                    {p.status}
                  </span>
                  <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{moeda(p.total)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {(p.dados?.itens ?? []).map((i, idx) => (
                    <div key={idx}>{i.quantidade}× {i.titulo}</div>
                  ))}
                </div>
                {p.status === 'novo' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => marcar(p, 'processado')}>
                      Marcar processado
                    </button>
                    <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => marcar(p, 'ignorado')}>
                      Ignorar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
