"use strict";
window.autovj.onScene(scene=>{document.getElementById('output-blackout').hidden=!scene.blackout;document.body.classList.toggle('blackout',scene.blackout);});
window.addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();window.autovj.hideOutput();}});
window.addEventListener('dblclick',()=>window.autovj.hideOutput());
