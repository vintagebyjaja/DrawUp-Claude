/* DrawUp v21 Detail Library: drawing kit.
   Draws one construction detail per image (SVG), in real inches at a stated architectural
   scale (100 px = 1 printed inch, so a PDF page of 8 x 6 in prints true to scale).
   Line weights: h = cut/profile, m = object, l = light, x = hatch. Hatches follow common
   US drafting conventions (concrete, earth, gravel, batt, rigid, gypsum, masonry, wood). */
(function(){
'use strict';
const W=800,H=600,TOP=24,BOT=522;let NX=548;
const escX=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const r2=n=>Math.round(n*100)/100;
const DEFS=`<defs>
<pattern id="p-conc" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#fff"/><path d="M4 9l4-5 2 6z M19 22l5-3 0 5z M22 6l3 3-4 1z" fill="none" stroke="#333" stroke-width=".6"/><g fill="#333"><circle cx="13" cy="14" r=".9"/><circle cx="26" cy="13" r=".7"/><circle cx="7" cy="23" r=".8"/><circle cx="15" cy="27" r=".6"/><circle cx="3" cy="16" r=".6"/><circle cx="17" cy="4" r=".6"/><circle cx="27" cy="27" r=".6"/></g></pattern>
<pattern id="p-earth" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="#fff"/><path d="M0 2H22M0 5H22M0 8H22" stroke="#777" stroke-width=".45"/></pattern>
<pattern id="p-grav" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#fff"/><g fill="none" stroke="#333" stroke-width=".6"><circle cx="5" cy="5" r="2.6"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="3"/><circle cx="19" cy="18" r="1.6"/><circle cx="1" cy="13" r="1.4"/></g></pattern>
<pattern id="p-sand" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#fff"/><g fill="#444"><circle cx="2" cy="2" r=".5"/><circle cx="7" cy="4" r=".5"/><circle cx="4" cy="8" r=".5"/><circle cx="9" cy="9" r=".4"/></g></pattern>
<pattern id="p-rigid" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fff"/><path d="M0 0H7M0 0V7" stroke="#333" stroke-width=".5"/></pattern>
<pattern id="p-gyp" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#fff"/><circle cx="2.5" cy="2.5" r=".5" fill="#444"/></pattern>
<pattern id="p-brick" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><path d="M0 0H5" stroke="#222" stroke-width=".7"/></pattern>
<pattern id="p-cmu" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#fff"/><path d="M0 0H9" stroke="#222" stroke-width=".6"/></pattern>
<pattern id="p-ply" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="3" height="3" fill="#fff"/><path d="M0 0H3" stroke="#444" stroke-width=".45"/></pattern>
<pattern id="p-wood" width="40" height="6" patternUnits="userSpaceOnUse"><rect width="40" height="6" fill="#fff"/><path d="M0 3C10 1 20 5 40 3" fill="none" stroke="#666" stroke-width=".45"/></pattern>
<pattern id="p-mw" width="8" height="5" patternUnits="userSpaceOnUse"><rect width="8" height="5" fill="#fff"/><path d="M0 3Q2 0 4 3T8 3" fill="none" stroke="#444" stroke-width=".5"/></pattern>
<pattern id="p-tile" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fff"/><path d="M0 0H6M0 0V6" stroke="#555" stroke-width=".4"/></pattern>
<pattern id="p-act" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#fff"/><g fill="#555"><circle cx="2" cy="2" r=".55"/><circle cx="6.5" cy="5" r=".55"/><circle cx="3" cy="7.5" r=".45"/></g></pattern>
<pattern id="p-stone" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="12" height="12" fill="#fff"/><path d="M0 3H12M0 9H7" stroke="#555" stroke-width=".5"/></pattern>
</defs>`;
const FILL={conc:'url(#p-conc)',earth:'url(#p-earth)',grav:'url(#p-grav)',sand:'url(#p-sand)',rigid:'url(#p-rigid)',gyp:'url(#p-gyp)',brick:'url(#p-brick)',cmu:'url(#p-cmu)',ply:'url(#p-ply)',wood:'url(#p-wood)',mw:'url(#p-mw)',tile:'url(#p-tile)',act:'url(#p-act)',stone:'url(#p-stone)',steel:'#262626',alum:'#c8d0d7',glass:'#e2f0f5',seal:'#111',white:'#fff',none:'none',gray:'#d9dee2',dark:'#555'};
const LW={h:2.3,m:1.25,l:.7,x:.45};
const DASH={hid:'6 4',cen:'16 4 3 4',wrb:'5 3',vr:'9 3 2 3'};

/* One kit per view: real inches, y up, origin at (ox,oy) px, k px per inch. */
function kit(k,ox,oy,S){
  const out=S.out,X=x=>{const v=r2(ox+x*k);if(v>S.maxX&&v<W-40)S.maxX=v;return v;},Y=y=>r2(oy-y*k);
  const st=(f,w,dash)=>`fill="${FILL[f]||f||'none'}" stroke="#111" stroke-width="${LW[w]||w||LW.m}"${dash?` stroke-dasharray="${DASH[dash]||dash}"`:''}`;
  const a={k,X,Y,
    rect(x,y,w,h,f,w_='m',dash){out.push(`<rect x="${X(x)}" y="${Y(y+h)}" width="${r2(w*k)}" height="${r2(h*k)}" ${st(f,w_,dash)}/>`);return a;},
    poly(p,f,w_='m'){out.push(`<polygon points="${p.map(q=>X(q[0])+','+Y(q[1])).join(' ')}" ${st(f,w_)} stroke-linejoin="round"/>`);return a;},
    pl(p,w_='m',dash){out.push(`<polyline points="${p.map(q=>X(q[0])+','+Y(q[1])).join(' ')}" ${st('none',w_,dash)} stroke-linejoin="round" stroke-linecap="round"/>`);return a;},
    ln(x1,y1,x2,y2,w_='l',dash){out.push(`<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}" ${st('none',w_,dash)} stroke-linecap="round"/>`);return a;},
    circ(x,y,r,f='none',w_='m'){out.push(`<circle cx="${X(x)}" cy="${Y(y)}" r="${r2(r*k)}" ${st(f,w_)}/>`);return a;},
    ell(x,y,rx,ry,f='white',w_='m'){out.push(`<ellipse cx="${X(x)}" cy="${Y(y)}" rx="${r2(rx*k)}" ry="${r2(ry*k)}" ${st(f,w_)}/>`);return a;},
    dot(x,y,r=.25){return a.circ(x,y,r,'#111','x');},
    /* sawn lumber in section: box with an X */
    blk(x,y,w,h){a.rect(x,y,w,h,'white','m');out.push(`<path d="M${X(x)} ${Y(y)}L${X(x+w)} ${Y(y+h)}M${X(x)} ${Y(y+h)}L${X(x+w)} ${Y(y)}" stroke="#111" stroke-width=".55"/>`);return a;},
    /* lumber seen in elevation / continuous member: box with one diagonal */
    blk1(x,y,w,h){a.rect(x,y,w,h,'white','m');out.push(`<path d="M${X(x)} ${Y(y)}L${X(x+w)} ${Y(y+h)}" stroke="#111" stroke-width=".55"/>`);return a;},
    /* batt insulation: looping prolate cycloid along the cavity */
    batt(x,y,w,h,dir='v'){const L=dir==='v'?h:w,T=dir==='v'?w:h,d=T*.46,p=T*.62,r=p/(2*Math.PI),pts=[];
      for(let t=0;;t+=.2){const s=r*t-d*Math.sin(t)+d,c=T/2-d*Math.cos(t);if(s>L)break;if(s<0)continue;pts.push(dir==='v'?[x+c,y+s]:[x+s,y+c]);}
      out.push(`<polyline points="${pts.map(q=>X(q[0])+','+Y(q[1])).join(' ')}" fill="none" stroke="#333" stroke-width=".6"/>`);
      a.rect(x,y,w,h,'none','x');return a;},
    /* break line across a member from (x1,y1) to (x2,y2) */
    brk(x1,y1,x2,y2){const mx=(x1+x2)/2,my=(y1+y2)/2,dx=(x2-x1),dy=(y2-y1),L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,nx=-uy,ny=ux,s=5/k;
      const P=[[x1-ux*s,y1-uy*s],[mx-ux*s,my-uy*s],[mx-ux*s*.4+nx*s*1.6,my-uy*s*.4+ny*s*1.6],[mx+ux*s*.4-nx*s*1.6,my+uy*s*.4-ny*s*1.6],[mx+ux*s,my+uy*s],[x2+ux*s,y2+uy*s]];
      out.push(`<polyline points="${P.map(q=>X(q[0])+','+Y(q[1])).join(' ')}" fill="none" stroke="#111" stroke-width="${LW.l}"/>`);return a;},
    /* clear a strip so the break reads as a cut */
    gap(x,y,w,h){out.push(`<rect x="${X(x)}" y="${Y(y+h)}" width="${r2(w*k)}" height="${r2(h*k)}" fill="#fff"/>`);return a;},
    note(x,y,t){S.notes.push({px:r2(ox+x*k),py:Y(y),t});return a;},
    txt(x,y,t,size=9,anchor='middle',weight=400,rot=0){out.push(`<text x="${X(x)}" y="${Y(y)}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}"${rot?` transform="rotate(${rot} ${X(x)} ${Y(y)})"`:''}>${escX(t)}</text>`);return a;},
    /* horizontal or vertical dimension with architectural ticks */
    dim(x1,y1,x2,y2,label,off=0){const hz=Math.abs(y2-y1)<1e-6;
      if(hz){const y=y1+off;out.push(`<path d="M${X(x1)} ${Y(y1)}V${Y(y)+(off>0?-4:4)}M${X(x2)} ${Y(y2)}V${Y(y)+(off>0?-4:4)}" stroke="#111" stroke-width=".45"/><path d="M${X(x1)-4} ${Y(y)}H${X(x2)+4}" stroke="#111" stroke-width=".6"/><path d="M${X(x1)-3} ${Y(y)+3}l6 -6M${X(x2)-3} ${Y(y)+3}l6 -6" stroke="#111" stroke-width="1.3"/>`);
        out.push(`<text x="${r2((X(x1)+X(x2))/2)}" y="${Y(y)-3.5}" font-size="9" text-anchor="middle">${escX(label)}</text>`);}
      else{const x=x1+off;out.push(`<path d="M${X(x1)} ${Y(y1)}H${X(x)+(off>0?4:-4)}M${X(x2)} ${Y(y2)}H${X(x)+(off>0?4:-4)}" stroke="#111" stroke-width=".45"/><path d="M${X(x)} ${Y(y1)+4}V${Y(y2)-4}" stroke="#111" stroke-width=".6"/><path d="M${X(x)-3} ${Y(y1)+3}l6 -6M${X(x)-3} ${Y(y2)+3}l6 -6" stroke="#111" stroke-width="1.3"/>`);
        const cy=r2((Y(y1)+Y(y2))/2);out.push(`<text x="${X(x)-4}" y="${cy}" font-size="9" text-anchor="middle" transform="rotate(-90 ${X(x)-4} ${cy})">${escX(label)}</text>`);}
      return a;},
    /* view label under a view: bubble-less subtitle */
    label(x,y,t){out.push(`<text x="${X(x)}" y="${Y(y)}" font-size="10.5" font-weight="700" text-anchor="middle" letter-spacing=".06em">${escX(t)}</text><line x1="${X(x)-t.length*3.6}" y1="${Y(y)+3}" x2="${X(x)+t.length*3.6}" y2="${Y(y)+3}" stroke="#111" stroke-width="1.2"/>`);return a;},
    raw(s){out.push(s);return a;}
  };
  return a;
}

function wrap(t,n){const w=String(t).toUpperCase().split(/\s+/),L=[];let c='';for(const x of w){if((c+' '+x).trim().length>n){if(c)L.push(c);c=x;}else c=(c+' '+x).trim();}if(c)L.push(c);return L;}
function layoutNotes(notes){
  const LH=11.2,GAP=6,list=notes.map(n=>({...n,lines:wrap(n.t,Math.floor((W-24-NX)/5.6))})).sort((a,b)=>a.py-b.py);
  list.forEach(n=>n.h=n.lines.length*LH);
  let y=TOP;for(const n of list){n.ty=Math.max(n.py-n.h/2+LH*.7,y);y=n.ty+n.h+GAP;}
  let lim=BOT;for(let i=list.length-1;i>=0;i--){const n=list[i];if(n.ty+n.h>lim)n.ty=lim-n.h;lim=n.ty-GAP;}
  if(list.length&&list[0].ty<TOP){let y2=TOP;for(const n of list){n.ty=Math.max(n.ty,y2);y2=n.ty+n.h+GAP;}}
  return list.map(n=>{const ay=r2(n.ty+3),sx=NX-8,ang=Math.atan2(ay-n.py,sx-n.px),hx=n.px+Math.cos(ang)*7,hy=n.py+Math.sin(ang)*7,px2=-Math.sin(ang)*2.4,py2=Math.cos(ang)*2.4;
    return `<polyline points="${r2(n.px)},${r2(n.py)} ${sx},${ay} ${NX-2},${ay}" fill="none" stroke="#111" stroke-width=".6"/><polygon points="${r2(n.px)},${r2(n.py)} ${r2(hx+px2)},${r2(hy+py2)} ${r2(hx-px2)},${r2(hy-py2)}" fill="#111"/>`+
      n.lines.map((l,i)=>`<text x="${NX+1}" y="${r2(n.ty+7+i*LH)}" font-size="9.2">${escX(l)}</text>`).join('');}).join('');
}

/* Full single-detail image: drawing, notes, title block, disclaimer. */
function sheet(d){
  const S={out:[],notes:[],maxX:0};
  d.draw((k,ox,oy)=>kit(k,ox,oy,S));
  NX=Math.round(Math.min(560,Math.max(430,S.maxX+34)));
  const tl=String(d.title).toUpperCase(),ts=Math.min(15,430/(tl.length*.64));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif" fill="#111">${DEFS}
<rect width="${W}" height="${H}" fill="#fff"/><rect x="6" y="6" width="${W-12}" height="${H-12}" fill="none" stroke="#111" stroke-width="1.4"/>
<g>${S.out.join('')}</g><g>${layoutNotes(S.notes)}</g>
<line x1="6" y1="536" x2="${W-6}" y2="536" stroke="#111" stroke-width="1"/>
<circle cx="44" cy="566" r="21" fill="#fff" stroke="#111" stroke-width="1.6"/><line x1="23" y1="566" x2="65" y2="566" stroke="#111" stroke-width="1"/>
<text x="44" y="561" font-size="13" font-weight="700" text-anchor="middle">${escX(d.no||'1')}</text><text x="44" y="580" font-size="9" font-weight="700" text-anchor="middle">TYP</text>
<text x="76" y="560" font-size="${r2(ts)}" font-weight="700">${escX(tl)}</text><line x1="76" y1="566" x2="${r2(76+Math.min(440,tl.length*ts*.64))}" y2="566" stroke="#111" stroke-width="2"/>
<text x="76" y="582" font-size="9.5">SCALE: ${escX(d.scale||'')}${d.views?'  ·  '+escX(d.views):''}</text>
<text x="${W-16}" y="553" font-size="9" font-weight="700" text-anchor="end">DRAWUP TYPICAL DETAIL · ${escX(d.code||d.id.toUpperCase())}</text>
<text x="${W-16}" y="567" font-size="8.4" text-anchor="end">LEARNING CONTENT · NOT FOR CONSTRUCTION</text>
<text x="${W-16}" y="580" font-size="8.4" text-anchor="end">ADAPT + VERIFY BY A LICENSED PROFESSIONAL AND THE AHJ</text>
</svg>`;
}

window.DrawUpDetailKit={W,H,sheet,kit};
})();
