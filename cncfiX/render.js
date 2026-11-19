/* Pure SVG renderer for CNCF landscape diagrams. Produces standalone vector SVG. */
(function(root){'use strict';
 const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const initials=name=>{const parts=String(name||'').trim().split(/[\s/_-]+/).filter(Boolean);if(!parts.length)return '?';if(parts.length===1)return parts[0].slice(0,2).toUpperCase();return (parts[0][0]+parts[1][0]).toUpperCase();};

 function renderSvg(project,options={}){
  const M=root.Cncfix;
  const p=M.validate(project);
  const filterMaturity=options.maturity||'all';
  const filterText=String(options.search||'').trim().toLowerCase();
  const activeItemId=options.activeItemId??p.activeItemId;
  const cols=Math.max(1,Math.min(6,p.settings.columns||4));
  const cardW=p.settings.cardWidth||156;
  const cardH=52;
  const cardGap=8;
  const subPad=12;
  const catPad=14;
  const colGap=16;
  const pad=24;

  // Match items against active filters
  const visibleItems=p.items.filter(it=>{
   if(filterMaturity!=='all'&&it.maturity!==filterMaturity)return false;
   if(filterText&&!(it.name+' '+it.description+' '+it.maturity).toLowerCase().includes(filterText))return false;
   return true;
  });

  const colW=Math.max(cardW*2+cardGap+subPad*2+catPad*2,340);
  const cardsPerRow=Math.max(1,Math.floor((colW-catPad*2-subPad*2+cardGap)/(cardW+cardGap)));

  // Compute category block heights
  const blocks=p.categories.map(cat=>{
   const subs=p.subcategories.filter(s=>s.categoryId===cat.id).map(sub=>{
    const items=visibleItems.filter(i=>i.subcategoryId===sub.id);
    const rows=Math.max(1,Math.ceil(items.length/cardsPerRow));
    const h=28+subPad+rows*cardH+(rows-1)*cardGap+subPad;
    return {sub,items,h};
   });
   const bodyH=subs.reduce((sum,s)=>sum+s.h+10,0);
   return {cat,subs,h:40+catPad+Math.max(40,bodyH)+catPad};
  });

  // Pack category blocks into columns (shortest-column greedy)
  const colHeights=Array(cols).fill(0);
  const placements=blocks.map(b=>{
   let best=0;
   for(let i=1;i<cols;i++)if(colHeights[i]<colHeights[best])best=i;
   const x=pad+best*(colW+colGap);
   const y=colHeights[best];
   colHeights[best]+=b.h+16;
   return {...b,x,y};
  });

  const headerH=p.settings.showLegend?108:76;
  const totalW=pad*2+cols*colW+(cols-1)*colGap;
  const totalH=headerH+Math.max(220,Math.max(...colHeights,0))+pad;

  const out=[];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">`);
  if(options.embedProject){
   out.push(`<metadata><cncfix-project xmlns="https://tlal.os/cncfix">${esc(JSON.stringify(p))}</cncfix-project></metadata>`);
  }
  out.push(`<rect width="${totalW}" height="${totalH}" fill="#fafafa"/>`);
  // Header
  out.push(`<text x="${pad}" y="${pad+26}" font-size="24" font-weight="700" fill="#343b43">${esc(p.name)}</text>`);
  if(p.subtitle){
   out.push(`<text x="${pad}" y="${pad+48}" font-size="13" fill="#626a73">${esc(p.subtitle)} · ${visibleItems.length} projects across ${p.categories.length} categories</text>`);
  }
  if(p.settings.showLegend){
   let lx=pad;
   const ly=pad+68;
   for(const key of M.MATURITIES){
    const meta=M.MATURITY_META[key];
    out.push(`<g transform="translate(${lx},${ly})">`);
    out.push(`<rect width="12" height="12" rx="3" fill="${meta.fill}" stroke="${meta.border}" stroke-width="1.5"/>`);
    out.push(`<text x="18" y="10.5" font-size="11.5" font-weight="600" fill="#343b43">${esc(meta.label)}</text>`);
    out.push(`</g>`);
    lx+=104;
   }
  }

  for(const block of placements){
   const by=headerH+block.y;
   out.push(`<g class="lx-cat" data-category-id="${esc(block.cat.id)}">`);
   out.push(`<rect x="${block.x}" y="${by}" width="${colW}" height="${block.h}" rx="12" fill="#ffffff" stroke="#d9dde1" stroke-width="1.2"/>`);
   out.push(`<rect x="${block.x}" y="${by}" width="${colW}" height="34" rx="12" fill="${esc(block.cat.color||'#1e5a8a')}"/>`);
   out.push(`<rect x="${block.x}" y="${by+20}" width="${colW}" height="14" fill="${esc(block.cat.color||'#1e5a8a')}"/>`);
   out.push(`<text x="${block.x+14}" y="${by+22}" font-size="13" font-weight="700" fill="#ffffff">${esc(block.cat.name)}</text>`);

   let sy=by+44;
   for(const subBlock of block.subs){
    const sx=block.x+catPad;
    const sw=colW-catPad*2;
    out.push(`<g class="lx-sub" data-subcategory-id="${esc(subBlock.sub.id)}">`);
    out.push(`<rect x="${sx}" y="${sy}" width="${sw}" height="${subBlock.h}" rx="8" fill="#f4f6f8" stroke="#e4e7eb" stroke-width="1"/>`);
    out.push(`<text x="${sx+10}" y="${sy+19}" font-size="11.5" font-weight="700" fill="#495057">${esc(subBlock.sub.name)} (${subBlock.items.length})</text>`);
    if(!subBlock.items.length){
     out.push(`<text x="${sx+10}" y="${sy+44}" font-size="11" fill="#8b949e">No matching projects</text>`);
    }else{
     subBlock.items.forEach((it,idx)=>{
      const col=idx%cardsPerRow;
      const row=Math.floor(idx/cardsPerRow);
      const cx=sx+subPad+col*(cardW+cardGap);
      const cy=sy+28+row*(cardH+cardGap);
      const meta=M.MATURITY_META[it.maturity]||M.MATURITY_META.sandbox;
      const selected=it.id===activeItemId;
      out.push(`<g class="lx-item" data-item-id="${esc(it.id)}" style="cursor:pointer">`);
      out.push(`<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" rx="7" fill="#ffffff" stroke="${selected?'#8b1e3f':meta.border}" stroke-width="${selected?2.4:1.3}"/>`);
      out.push(`<rect x="${cx+6}" y="${cy+8}" width="32" height="36" rx="6" fill="${meta.fill}" stroke="${meta.border}" stroke-width="1"/>`);
      out.push(`<text x="${cx+22}" y="${cy+30}" text-anchor="middle" font-size="11" font-weight="700" fill="${meta.color}">${esc(initials(it.name))}</text>`);
      const label=it.name.length>15?it.name.slice(0,14)+'…':it.name;
      out.push(`<text x="${cx+44}" y="${cy+23}" font-size="11.5" font-weight="650" fill="#212529">${esc(label)}</text>`);
      if(p.settings.showMaturity){
       out.push(`<text x="${cx+44}" y="${cy+39}" font-size="9.5" font-weight="600" fill="${meta.color}">${esc(meta.label)}${p.settings.showOssBadge&&it.oss?' · OSS':''}</text>`);
      }
      out.push(`</g>`);
     });
    }
    out.push(`</g>`);
    sy+=subBlock.h+10;
   }
   out.push(`</g>`);
  }

  out.push(`</svg>`);
  return out.join('\n');
 }

 const api={renderSvg};
 root.CncfixRender=api;if(typeof module==='object')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
