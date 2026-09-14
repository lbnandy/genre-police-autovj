// Generated from the pinned Genre Police controller.
export function createTypography(){
const appShell=document.querySelector('#app'),genreLabel=document.querySelector('#genre'),genreFace=document.querySelector('#genre-face'),parentGenre=document.querySelector('#parent-genre'),trackRule=document.querySelector('.track-rule'),jurisdictionLabel=document.querySelector('.jurisdiction > span:nth-child(2)'),titleLabel=document.querySelector('#title');
const genreMetricsContext=document.createElement('canvas').getContext('2d');const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));let titlePanAnimation=null,titlePanSignature='';
function textInkBounds(element, text, uiScale) {
  if (!genreMetricsContext || !element || !String(text || '').trim()) return null;
  const style = getComputedStyle(element);
  const renderedText = style.textTransform === 'uppercase'
    ? String(text).toLocaleUpperCase()
    : style.textTransform === 'lowercase'
      ? String(text).toLocaleLowerCase()
      : String(text);
  genreMetricsContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  genreMetricsContext.fontKerning = style.fontKerning;
  const metrics = genreMetricsContext.measureText(renderedText);
  const actualAscent = Number(metrics.actualBoundingBoxAscent) || 0;
  const actualDescent = Number(metrics.actualBoundingBoxDescent) || 0;
  const fontAscent = Number(metrics.fontBoundingBoxAscent) || actualAscent;
  const fontDescent = Number(metrics.fontBoundingBoxDescent) || actualDescent;
  if (!(actualAscent + actualDescent > 0) || !(fontAscent + fontDescent > 0)) return null;

  const rect = element.getBoundingClientRect();
  const fontBoxHeight = (fontAscent + fontDescent) * uiScale;
  const baseline = rect.top + (rect.height - fontBoxHeight) / 2 + fontAscent * uiScale;
  return {
    top: baseline - actualAscent * uiScale,
    bottom: baseline + actualDescent * uiScale
  };
}

function balanceCapsuleGenreStack() {
  const stackedFullscreen = document.body.dataset.stageOutput === 'true'
    && document.body.dataset.fullscreenLayout === 'stacked';
  const capsuleLayout = document.body.dataset.layout !== 'poster' && !stackedFullscreen;
  if (!capsuleLayout || !jurisdictionLabel || !genreFace || !trackRule
      || !parentGenre.textContent.trim() || !genreFace.textContent.trim()) {
    parentGenre.style.removeProperty('--parent-balance-y');
    return false;
  }

  const savedScale = genreLabel.style.getPropertyValue('--genre-scale');
  const savedLift = genreLabel.style.getPropertyValue('--genre-lift');
  const savedTransform = genreLabel.style.transform;
  genreLabel.style.removeProperty('transform');
  parentGenre.style.setProperty('--parent-balance-y', '0px');
  genreLabel.style.setProperty('--genre-scale', '1');
  genreLabel.style.setProperty('--genre-lift', '0px');
  genreLabel.style.setProperty('--genre-balance-y', '0px');

  const appRect = appShell.getBoundingClientRect();
  const uiScale = appShell.offsetHeight > 0 ? appRect.height / appShell.offsetHeight : 1;
  const jurisdictionInk = textInkBounds(jurisdictionLabel, jurisdictionLabel.textContent, uiScale);
  const parentInk = textInkBounds(parentGenre, parentGenre.textContent, uiScale);
  const genreInk = textInkBounds(genreFace, genreFace.textContent, uiScale);
  const ruleTop = trackRule.getBoundingClientRect().top;

  if (savedScale) genreLabel.style.setProperty('--genre-scale', savedScale);
  else genreLabel.style.removeProperty('--genre-scale');
  if (savedLift) genreLabel.style.setProperty('--genre-lift', savedLift);
  else genreLabel.style.removeProperty('--genre-lift');
  if (savedTransform) genreLabel.style.transform = savedTransform;
  else genreLabel.style.removeProperty('transform');

  if (!jurisdictionInk || !parentInk || !genreInk || !(uiScale > 0)) {
    parentGenre.style.removeProperty('--parent-balance-y');
    genreLabel.style.removeProperty('--genre-balance-y');
    return true;
  }

  const parentHeight = parentInk.bottom - parentInk.top;
  const genreHeight = genreInk.bottom - genreInk.top;
  const freeSpace = ruleTop - jurisdictionInk.bottom - parentHeight - genreHeight;
  const targetGap = Math.max(0, freeSpace / 3);
  const parentOffset = clamp(
    (jurisdictionInk.bottom + targetGap - parentInk.top) / uiScale,
    -16,
    16
  );
  const genreOffset = clamp(
    (ruleTop - targetGap - genreInk.bottom) / uiScale,
    -16,
    16
  );
  parentGenre.style.setProperty('--parent-balance-y', `${parentOffset.toFixed(2)}px`);
  genreLabel.style.setProperty('--genre-balance-y', `${genreOffset.toFixed(2)}px`);
  return true;
}

function balanceGenreLabel() {
  if (balanceCapsuleGenreStack()) return;

  if (!genreFace || !parentGenre.textContent.trim() || !genreFace.textContent.trim() || !trackRule) {
    genreLabel.style.removeProperty('--genre-balance-y');
    return;
  }

  const savedScale = genreLabel.style.getPropertyValue('--genre-scale');
  const savedLift = genreLabel.style.getPropertyValue('--genre-lift');
  const savedTransform = genreLabel.style.transform;
  genreLabel.style.removeProperty('transform');
  genreLabel.style.setProperty('--genre-scale', '1');
  genreLabel.style.setProperty('--genre-lift', '0px');
  genreLabel.style.setProperty('--genre-balance-y', '0px');

  const appRect = appShell.getBoundingClientRect();
  const uiScale = appShell.offsetHeight > 0 ? appRect.height / appShell.offsetHeight : 1;
  const parentInk = textInkBounds(parentGenre, parentGenre.textContent, uiScale);
  const genreInk = textInkBounds(genreFace, genreFace.textContent, uiScale);
  const ruleTop = trackRule.getBoundingClientRect().top;

  if (savedScale) genreLabel.style.setProperty('--genre-scale', savedScale);
  else genreLabel.style.removeProperty('--genre-scale');
  if (savedLift) genreLabel.style.setProperty('--genre-lift', savedLift);
  else genreLabel.style.removeProperty('--genre-lift');
  if (savedTransform) genreLabel.style.transform = savedTransform;
  else genreLabel.style.removeProperty('transform');

  if (!parentInk || !genreInk || !(uiScale > 0)) {
    genreLabel.style.removeProperty('--genre-balance-y');
    return;
  }

  const targetCenter = (parentInk.bottom + ruleTop) / 2;
  const currentCenter = (genreInk.top + genreInk.bottom) / 2;
  const stackedFullscreen = document.body.dataset.stageOutput === 'true'
    && document.body.dataset.fullscreenLayout === 'stacked';
  const offsetLimit = stackedFullscreen ? 20 : 12;
  const offset = clamp((targetCenter - currentCenter) / uiScale, -offsetLimit, offsetLimit);
  genreLabel.style.setProperty('--genre-balance-y', `${offset.toFixed(2)}px`);
}

function fitGenreLabel() {
  // Start from the genre family's intended type size, then shrink only when
  // the rendered font would overflow. Measure the static face rather than the
  // effect container: animated glitch copies can extend its scrollWidth and
  // otherwise make long labels refit by fractions of a pixel during playback.
  genreLabel.style.removeProperty('font-size');
  const availableWidth = genreLabel.clientWidth;
  const renderedWidth = genreFace?.scrollWidth || genreLabel.scrollWidth;
  if (!availableWidth || !renderedWidth) {
    balanceGenreLabel();
    return;
  }

  const naturalSize = Number.parseFloat(getComputedStyle(genreLabel).fontSize) || 58;
  // Leave room for the live scale/glow so a fitted label does not appear to
  // leave the capsule on an impact frame.
  const safeWidth = availableWidth * 0.94;
  if (renderedWidth > safeWidth) {
    const fittedSize = Math.max(25, naturalSize * safeWidth / renderedWidth);
    genreLabel.style.fontSize = `${fittedSize.toFixed(2)}px`;
  }
  balanceGenreLabel();
}

function updateTitleOverflow() {
  const text = titleLabel.querySelector('.title-scroll-text');
  if (!text) {
    titlePanAnimation?.cancel();
    titlePanAnimation = null;
    titlePanSignature = '';
    return;
  }
  const titleStyle = getComputedStyle(titleLabel);
  const horizontalPadding = (parseFloat(titleStyle.paddingLeft) || 0)
    + (parseFloat(titleStyle.paddingRight) || 0);
  const viewportWidth = Math.max(0, titleLabel.clientWidth - horizontalPadding);
  const distance = Math.max(0, text.scrollWidth - viewportWidth);
  const overflowing = distance > 3;
  const roundedDistance = Math.ceil(distance);
  const signature = `${text.textContent}::${Math.round(viewportWidth)}::${roundedDistance}`;
  titleLabel.classList.toggle('is-overflowing', overflowing);
  if (signature === titlePanSignature && Boolean(titlePanAnimation) === overflowing) return;

  titlePanAnimation?.cancel();
  titlePanAnimation = null;
  titlePanSignature = signature;
  text.style.transform = 'translateX(0)';
  if (!overflowing) return;

  const holdMs = 2000;
  const travelMs = Math.max(2200, Math.min(9000, roundedDistance / 32 * 1000));
  const duration = holdMs * 2 + travelMs * 2;
  const leftHold = holdMs / duration;
  const rightArrival = (holdMs + travelMs) / duration;
  const rightHold = (holdMs * 2 + travelMs) / duration;
  titlePanAnimation = text.animate([
    { transform: 'translateX(0)', offset: 0 },
    { transform: 'translateX(0)', offset: leftHold },
    { transform: `translateX(-${roundedDistance}px)`, offset: rightArrival },
    { transform: `translateX(-${roundedDistance}px)`, offset: rightHold },
    { transform: 'translateX(0)', offset: 1 }
  ], {
    duration,
    iterations: Infinity,
    fill: 'both',
    easing: 'linear'
  });
}

return ()=>{fitGenreLabel();updateTitleOverflow();};
}
