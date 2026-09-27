// Keep the original 920×400 landscape composition. Give stacked portrait
// output its own vertical spacing while the original engine renders normally.
export function visualSizeScale(value) { return ({standard: 1, large: 1.15, maximum: 1.3})[value] || 1; }

export function stageGeometry(width, height, layout, visualSize = 'standard') {
  const visualScale = visualSizeScale(visualSize);
  const portrait = height > width;
  const designHeight = portrait && layout === "stacked" ? 1040 : layout === 'stacked' ? 400 + 200 * (visualScale - 1) : 400;
  const stackY = designHeight === 1040 ? 300 : 100 * visualScale;
  const hudTop = designHeight === 1040 ? 600 : 200 * visualScale;
  const scale = Math.max(0.1, Math.min(Math.max(1,width-96)/920, Math.max(1,height-96)/designHeight));
  const left = (width - 920 * scale) / 2, top = (height - designHeight * scale) / 2;
  const x = Math.ceil(Math.max(0,left / scale) + 24 / scale);
  const y = Math.ceil(Math.max(0,top / scale) + 24 / scale);
  return {portrait, designHeight, stackY, hudTop, scale, left, top, x, y};
}
