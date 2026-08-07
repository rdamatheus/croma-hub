const FALLBACK_DATA = {
  categorias: ["Todos", "Comunicação Visual", "Gráfica", "Papelaria", "Digital"],
  itens: []
};

export async function carregarCatalogo() {
  try {
    const response = await fetch("data/catalogo.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Falha ao carregar catálogo: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn("Catálogo indisponível; usando fallback local.", error);
    return FALLBACK_DATA;
  }
}
