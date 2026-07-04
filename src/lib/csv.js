// CSV pronto para Excel BR: BOM UTF-8 + separador ponto-e-vírgula.
export function baixarCSV(nomeArquivo, colunas, linhas) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const num = (v) => String(v).replace('.', ',') // decimais no padrão BR
  const corpo = linhas.map((l) =>
    colunas.map((c) => (typeof l[c.campo] === 'number' ? num(l[c.campo]) : esc(l[c.campo]))).join(';')
  )
  const csv = '\ufeff' + colunas.map((c) => esc(c.titulo)).join(';') + '\n' + corpo.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
