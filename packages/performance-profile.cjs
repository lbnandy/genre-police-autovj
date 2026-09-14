"use strict";
function performanceProfile(value) { return value === 'low' ? 'low' : 'standard'; }
function previewProfile(value) {
  return performanceProfile(value) === 'low' ? {maxWidth:960,maxHeight:540,fps:15} : {maxWidth:1280,maxHeight:720,fps:30};
}
function needsVisuals({preview,local,external,recovering}) { return Boolean(preview || local || external || recovering); }
module.exports = {performanceProfile, previewProfile, needsVisuals};
