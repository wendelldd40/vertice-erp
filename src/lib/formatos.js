export const moeda = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export const numero = (v) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(v) || 0)

export const dataHora = (v) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v))

// margem sobre a venda; markup sobre o custo
export const margem = (custo, venda) => {
  const c = Number(custo), v = Number(venda)
  if (!v) return null
  return ((v - c) / v) * 100
}
export const markup = (custo, venda) => {
  const c = Number(custo), v = Number(venda)
  if (!c) return null
  return ((v - c) / c) * 100
}
