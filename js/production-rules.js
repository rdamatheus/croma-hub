import { supabase } from './croma-supabase.js';

export const LABEL_RULE_KEY = 'production.plotter_cut.labels';

export const DEFAULT_LABEL_RULES = Object.freeze({
  version: 1,
  technology: 'plotter_cut',
  technology_label: 'Plotter de recorte',
  margin_mm: 10,
  gap_mm: 3,
  min_cut_mm: 15,
  small_item_threshold_mm: 30,
  small_item_capacity_factor: 0.5,
  allow_rotation: true,
  sheet_default: 'A3',
  sheet_formats: {
    A3: { width_mm: 297, height_mm: 420 },
    A4: { width_mm: 210, height_mm: 297 }
  }
});

const clone = value => JSON.parse(JSON.stringify(value));

export function normalizeLabelRules(data={}){
  const base = clone(DEFAULT_LABEL_RULES);
  return {
    ...base,
    ...data,
    sheet_formats: {
      ...base.sheet_formats,
      ...(data.sheet_formats || {})
    }
  };
}

export async function loadLabelRules(){
  const { data, error } = await supabase
    .from('public_config')
    .select('data')
    .eq('config_key', LABEL_RULE_KEY)
    .maybeSingle();

  if(error) {
    console.warn('Não foi possível carregar regras de produção; usando padrão.', error);
    return normalizeLabelRules();
  }
  return normalizeLabelRules(data?.data || {});
}

export function calculateSheetLayout({ widthMm, heightMm, quantity, sheet='A3', rules }){
  const cfg = normalizeLabelRules(rules);
  const format = cfg.sheet_formats?.[sheet];
  if(!format) throw new Error('Formato de cartela inválido.');

  const width = Number(widthMm);
  const height = Number(heightMm);
  const qty = Math.max(1, Math.ceil(Number(quantity) || 0));
  if(!(width > 0) || !(height > 0)) throw new Error('Informe largura e altura válidas.');

  const margin = Math.max(0, Number(cfg.margin_mm) || 0);
  const gap = Math.max(0, Number(cfg.gap_mm) || 0);
  const usableWidth = Number(format.width_mm) - margin * 2;
  const usableHeight = Number(format.height_mm) - margin * 2;
  if(usableWidth <= 0 || usableHeight <= 0) throw new Error('Margem maior que a área útil da cartela.');

  const fit = (itemW, itemH) => {
    const columns = Math.max(0, Math.floor((usableWidth + gap) / (itemW + gap)));
    const rows = Math.max(0, Math.floor((usableHeight + gap) / (itemH + gap)));
    return { columns, rows, rawCapacity: columns * rows, rotated: false };
  };

  const normal = fit(width, height);
  let best = normal;
  if(cfg.allow_rotation && width !== height){
    const rotated = fit(height, width);
    rotated.rotated = true;
    if(rotated.rawCapacity > best.rawCapacity) best = rotated;
  }

  const isSmall = Math.min(width, height) < Number(cfg.small_item_threshold_mm || 0);
  const factor = isSmall ? Math.max(0.01, Math.min(1, Number(cfg.small_item_capacity_factor) || 0.5)) : 1;
  const effectiveCapacity = best.rawCapacity > 0 ? Math.max(1, Math.floor(best.rawCapacity * factor)) : 0;
  const sheetsNeeded = effectiveCapacity > 0 ? Math.ceil(qty / effectiveCapacity) : 0;
  const producedCapacity = sheetsNeeded * effectiveCapacity;
  const minimumWarning = width < Number(cfg.min_cut_mm || 0) || height < Number(cfg.min_cut_mm || 0);

  return {
    sheet,
    sheetWidthMm: Number(format.width_mm),
    sheetHeightMm: Number(format.height_mm),
    usableWidthMm: usableWidth,
    usableHeightMm: usableHeight,
    columns: best.columns,
    rows: best.rows,
    rotated: best.rotated,
    rawCapacity: best.rawCapacity,
    effectiveCapacity,
    sheetsNeeded,
    requestedQuantity: qty,
    producedCapacity,
    smallItemAdjustment: isSmall,
    capacityFactor: factor,
    minimumWarning,
    minCutMm: Number(cfg.min_cut_mm || 0)
  };
}
