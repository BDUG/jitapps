(function(){'use strict';
 async function svg(formula,settings){await MathJax.startup.promise;if(!formula.latex.trim())throw Error('Enter a formula before exporting SVG.');
  const container=MathJax.tex2svg(formula.latex,{display:true}),error=container.querySelector('[data-mjx-error],[data-mml-node="merror"]');if(error)throw Error(error.getAttribute('data-mjx-error')||error.textContent||'Invalid LaTeX expression.');
  const output=container.querySelector('svg')?.cloneNode(true);if(!output)throw Error('The math renderer returned no SVG.');
  if(output.querySelector('script,foreignObject,image,a'))throw Error('Formula output contains unsupported active or external content.');
  for(const element of [output,...output.querySelectorAll('*')])for(const attr of [...element.attributes]){if(/^on/i.test(attr.name)||/(?:^|:)href$/.test(attr.name)&&!attr.value.startsWith('#'))throw Error('External SVG references are unsupported.');if(['stroke','fill'].includes(attr.name)&&attr.value==='currentColor')element.setAttribute(attr.name,settings.color);}
  const box=output.getAttribute('viewBox').split(/\s+/).map(Number),pad=settings.padding/settings.fontSize*1000;
  if(box.length!==4||box.some(n=>!Number.isFinite(n))||box[2]<=0||box[3]<=0)throw Error('The formula has no visible bounds.');
  output.setAttribute('viewBox',[box[0]-pad,box[1]-pad,box[2]+2*pad,box[3]+2*pad].join(' '));output.setAttribute('width',String(Math.ceil(box[2]/1000*settings.fontSize+settings.padding*2)));output.setAttribute('height',String(Math.ceil(box[3]/1000*settings.fontSize+settings.padding*2)));output.setAttribute('xmlns','http://www.w3.org/2000/svg');output.style.color=settings.color;output.style.verticalAlign='';output.setAttribute('role','img');output.setAttribute('aria-label',formula.title||'Formula');output.removeAttribute('aria-hidden');
  const element=(tag,text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);n.textContent=text;return n;};output.prepend(element('title',formula.title),element('desc','LaTeX: '+formula.latex));
  const metadata=element('metadata',JSON.stringify({format:'formix-formula',version:1,formula}));metadata.setAttribute('id','formix-source');output.append(metadata);
  if(!settings.transparent){const background=element('rect','');for(const [k,v]of Object.entries({x:box[0]-pad,y:box[1]-pad,width:box[2]+2*pad,height:box[3]+2*pad,fill:'#ffffff'}))background.setAttribute(k,v);output.prepend(background);}
  return output;
 }
 window.FormixRender={svg};
})();
