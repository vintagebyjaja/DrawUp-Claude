/* DrawUp v22 Firm kit: Firm Playbook (standards) + GM Presentation (template builder) in the Portal Firm tab.
   Hooks: drawup-v19.js renderFirmTab adds DrawUpFirmKit.panes to the firm-admin subtabs, calls
   DrawUpFirmKit.mount() for those panes, and DrawUpFirmKit.memberSection() for firm members who are not admins.
   Data (migration 0049): firm_playbooks, firm_kit_files, firm_presentation_templates, private bucket drawup-firmkit.
   RLS: firm members read, firm admins write, everyone else sees nothing.
   Exports: PPTX through PptxGenJS 4.0.1 (public/vendor, MIT), PDF through pdf-lib 1.17.1 (public/vendor, MIT). */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const BUCKET='drawup-firmkit';
const MAXB=50*1024*1024;
const PPTX_MIME='application/vnd.openxmlformats-officedocument.presentationml.presentation';
const VENDOR={pdfjs:'/vendor/pdfjs-3.11.174/pdf.min.js',pdfjsWorker:'/vendor/pdfjs-3.11.174/pdf.worker.min.js',pdflib:'/vendor/pdf-lib-1.17.1.min.js',pptx:'/vendor/pptxgenjs-4.0.1.bundle.js'};
const PANES=[['playbook','Playbook'],['present','GM Presentation']];
const DEFAULT_LABEL="DrawUp general standards, replace with your firm's";
const uuid=()=>crypto.randomUUID?crypto.randomUUID():'x'+Date.now().toString(36)+Math.random().toString(36).slice(2);
const kb=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
const day=d=>d?new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'';
const scripts={};
function loadScript(src){if(!scripts[src])scripts[src]=new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>{delete scripts[src];no(new Error('A DrawUp file tool could not load. Check your connection and try again.'));};document.head.appendChild(s);});return scripts[src];}
async function pdfjs(){if(!window.pdfjsLib)await loadScript(VENDOR.pdfjs);window.pdfjsLib.GlobalWorkerOptions.workerSrc=VENDOR.pdfjsWorker;return window.pdfjsLib;}
async function pdfLib(){if(!window.PDFLib)await loadScript(VENDOR.pdflib);return window.PDFLib;}
async function pptxLib(){if(!window.PptxGenJS)await loadScript(VENDOR.pptx);return window.PptxGenJS;}
const isPdf=f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name);
const isPptx=f=>f.type===PPTX_MIME||/\.pptx$/i.test(f.name);
const isImg=f=>/^image\/(png|jpeg|webp)$/.test(f.type);

/* =========================================================== DrawUp general playbook (default for every firm)
   Written from widely used US practice and the US National CAD Standard (NCS) conventions. No firm-specific claims. */
const DEFAULT_SECTIONS=[
 {key:'fonts',title:'Fonts and text sizes',intro:'One readable family across the whole set. Sizes are plotted heights on the full size sheet.',rows:[
  ['Drawing font','A plain sans-serif such as Arial or Helvetica, or a single-stroke CAD font such as RomanS. Use one family for the whole set.'],
  ['Case','Uppercase for drawing notes, tags and titles is common US practice. Sentence case is fine for specifications and presentation text.'],
  ['Notes, dimensions, tags','3/32 in. (about 2.4 mm) minimum plotted height. Do not go smaller on a full size sheet.'],
  ['Sub-titles and labels','1/8 in. (about 3 mm).'],
  ['Drawing titles','3/16 in. to 1/4 in. (about 5 to 6 mm), heavier weight than notes.'],
  ['Sheet title and number','1/4 in. to 3/8 in. in the title block. The sheet number is the largest text on the sheet.'],
  ['Annotative scale check','Model height = plotted height x scale factor. Example: 3/32 in. text at 1/4 in. = 1 ft-0 in. (factor 48) is 4.5 in. in the model.']]},
 {key:'lines',title:'Line weights and line types',intro:'Pen widths follow the ISO pen series that the NCS uses. Heavier lines read as closer or cut.',rows:[
  ['0.18 mm (fine)','Hatching and patterns, dimension and extension lines, leaders, grid lines.'],
  ['0.25 mm (thin)','Hidden lines, objects beyond, text, door swings, furniture and equipment.'],
  ['0.35 mm (medium)','Objects in elevation, edges of materials, casework, general object lines.'],
  ['0.50 mm (wide)','Walls and elements cut in plan or section.'],
  ['0.70 mm (extra wide)','Primary cut profiles in sections, building outline on site plans, section cut lines.'],
  ['1.00 mm and up','Sheet borders, match lines and special emphasis only.'],
  ['Line types','Continuous for visible, dashed for hidden or overhead, long-short center line for centerlines and grids, phantom for property lines and items by others.'],
  ['Existing and demolition','New work at full weight. Existing to remain screened (about 50 percent) or one weight lighter. Demolition dashed.']]},
 {key:'sheets',title:'Sheet sizes and margins',intro:'Common US architectural sheet sizes. Pick one size for the whole set.',rows:[
  ['ARCH D 24 x 36 in.','The most common full size set for building projects.'],
  ['ARCH E1 30 x 42 in.','Larger projects and site plans that need more room.'],
  ['ARCH E 36 x 48 in.','Very large plans. Hard to handle on site.'],
  ['ANSI D 22 x 34 in.','Prints at exactly half size on ANSI B 11 x 17 in. (tabloid), which suits reduced review sets.'],
  ['Margins','About 1/2 in. on the top, right and bottom, and about 1-1/2 in. on the left binding edge for bound sets.'],
  ['Scales and scale bars','Use standard scales and show a graphic scale bar so half size prints can still be measured.']]},
 {key:'titleblock',title:'Title block',intro:'Same title block on every sheet. The NCS sheet layout places it along the right edge.',rows:[
  ['Location','Vertical strip along the right edge of the sheet (NCS layout), or along the bottom if the firm prefers.'],
  ['Firm and consultants','Firm name, logo, address and contact. Consultant names and disciplines.'],
  ['Project','Project name, address, client or owner, project number.'],
  ['Seal','Space for the professional seal, signature and date where the jurisdiction requires it.'],
  ['Issue and revisions','Issue name and date (for example Permit Set, Bid Set). Revision number, date and description for each revision.'],
  ['Sheet information','Sheet title, sheet number (largest text), scale note, drawn by, checked by, date.'],
  ['Revision clouds','Cloud each change and tag it with a revision delta that matches the revision block.']]},
 {key:'sheetids',title:'Sheet naming (NCS)',intro:'NCS sheet identification: discipline designator, sheet type digit, two digit sequence number.',rows:[
  ['Format','Discipline + sheet type + sequence, for example A-101 or A101. Whether to use the hyphen is a firm choice. Keep it the same across the set.'],
  ['Discipline order','G General, H Hazardous Materials, V Survey and Mapping, B Geotechnical, C Civil, L Landscape, S Structural, A Architectural, I Interiors, Q Equipment, F Fire Protection, P Plumbing, D Process, M Mechanical, E Electrical, T Telecommunications, R Resource, X Other Disciplines, Z Contractor and Shop Drawings, O Operations.'],
  ['Sheet types 0 to 4','0 General (symbols, legends, notes). 1 Plans. 2 Elevations. 3 Sections. 4 Large scale views.'],
  ['Sheet types 5 to 9','5 Details. 6 Schedules and diagrams. 7 and 8 User defined. 9 3D representations (isometrics, perspectives, photos).'],
  ['Firm adaptations','Many firms adapt the type digits, for example a range for wall sections or for door and window schedules. Record your firm version here so everyone numbers sheets the same way.']]},
 {key:'layers',title:'Layer naming (NCS)',intro:'NCS layer names follow the AIA CAD Layer Guidelines: Discipline - Major group - Minor group - Status.',rows:[
  ['Format','Discipline designator (1 or 2 characters), major group (4 characters), optional minor groups (4 characters each), optional status (1 character). Hyphen between fields. Example: A-WALL-FULL-N.'],
  ['Status field','N new work, E existing to remain, D existing to demolish, F future, T temporary, M items to be moved, X not in contract, 1 to 9 phase numbers.'],
  ['Architectural examples','A-WALL, A-WALL-FULL, A-DOOR, A-GLAZ, A-FLOR, A-CLNG, A-EQPM, A-FURN.'],
  ['Annotation examples','A-ANNO-DIMS (dimensions), A-ANNO-TEXT (text), A-ANNO-SYMB (symbols), A-ANNO-NPLT (non-plotting).'],
  ['Other disciplines','S-GRID, S-COLS, M-HVAC-SUPP, E-LITE, E-POWR, C-TOPO, C-PROP, L-PLNT.'],
  ['BIM','Revit uses categories and subcategories instead of layers. Map them to these names in the DWG export settings so consultants get consistent layers.']]},
 {key:'dims',title:'Dimensions and annotation',intro:'Dimension once, in the place a builder will look for it.',rows:[
  ['Units','Feet and inches (12 ft-6 in. written 12\'-6") on imperial projects. Millimeters only on metric projects.'],
  ['Terminators','Architectural tick marks on architectural sheets. Arrows or dots only where the firm standard says so.'],
  ['Text placement','Dimension text above the line, readable from the bottom or the right side of the sheet.'],
  ['Strings','Continuous strings. Overall dimension outermost, then grids and openings, then smaller items nearest the object. Do not repeat a dimension on another drawing.'],
  ['Reference points','State in the general notes whether walls are dimensioned to face of stud, face of masonry or centerline. Columns to grid lines.'],
  ['Notes and leaders','Straight leaders with one bend at most and an arrowhead. Do not cross dimension lines. Keynotes tie to a keynote legend on the sheet.'],
  ['Tags and titles','Section and elevation markers show drawing number over sheet number. Every view has a title, number bubble and scale below it. North arrow on every plan.']]},
 {key:'presentation',title:'Presentation style',intro:'Meeting and marketing decks should look like they came from one firm. Set the details in GM Presentation.',rows:[
  ['Formats','16:9 slides for meetings. Letter or tabloid pages for proposals, leave-behinds and boards.'],
  ['Margins and safe area','At least 0.5 in. margins. Keep text and logos inside the safe area so nothing gets cropped.'],
  ['Logos','Firm logo in the same corner on every slide or page. Partner, client or consultant logos on a footer strip or a credits slide.'],
  ['Type','One heading font and one body font. Body text no smaller than 14 pt on slides and 10 pt on printed pages.'],
  ['Color','Firm primary color plus one accent. Dark text on a light background for anything that will be printed.'],
  ['Images','Full bleed or aligned to the grid. Never stretch an image. Credit photographers.'],
  ['Footer','Firm name, project name, date and page number.']]}
];
const DEF=Object.fromEntries(DEFAULT_SECTIONS.map(s=>[s.key,s]));
function sectionsOf(pb){const ov=pb?.standards?.sections||{};const out=DEFAULT_SECTIONS.map(s=>ov[s.key]?{...s,...ov[s.key],key:s.key,edited:true}:{...s,rows:s.rows.map(r=>r.slice())});
  Object.keys(ov).filter(k=>!DEF[k]).forEach(k=>out.push({key:k,title:ov[k].title||'Firm section',intro:ov[k].intro||'',rows:ov[k].rows||[],edited:true,custom:true}));return out;}

/* =========================================================== storage helpers */
async function uploadKit(c,firm,file,kind,extra){
  if(file.size>MAXB)throw new Error('That file is larger than 50 MB.');
  const pdf=isPdf(file),pptx=isPptx(file),img=isImg(file);
  if(kind!=='asset'&&!pdf&&!pptx)throw new Error('Upload a PDF or a PowerPoint (.pptx) file.');
  if(kind==='asset'&&!img)throw new Error('Use a PNG, JPG or WebP image.');
  const ext=pdf?'pdf':pptx?'pptx':file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const mime=pdf?'application/pdf':pptx?PPTX_MIME:file.type;
  const path=`${firm.id}/${kind}/${uuid()}.${ext}`;
  const up=await c.client.storage.from(BUCKET).upload(path,file,{contentType:mime,upsert:false});if(up.error)throw up.error;
  const row={firm_id:firm.id,kind,storage_path:path,file_name:(file.name||('file.'+ext)).slice(0,200),mime_type:mime,size_bytes:file.size,...(extra||{})};
  const r=await c.client.from('firm_kit_files').insert(row).select('*').single();
  if(r.error){await c.client.storage.from(BUCKET).remove([path]);throw r.error;}
  return r.data;
}
async function fileBytes(c,path){const r=await c.client.storage.from(BUCKET).download(path);if(r.error)throw r.error;return new Uint8Array(await r.data.arrayBuffer());}
async function signed(c,f,download){const r=await c.client.storage.from(BUCKET).createSignedUrl(f.storage_path,600,download?{download:f.file_name}:undefined);if(r.error)throw r.error;return r.data.signedUrl;}
async function readPdfInfo(bytes){const L=await pdfjs();const doc=await L.getDocument({data:bytes.slice()}).promise;const p=await doc.getPage(1);const v=p.getViewport({scale:1});return {doc,pages:doc.numPages,w:v.width/72,h:v.height/72};}
async function readPptx(bytes){await pptxLib();const JSZip=window.JSZip;if(!JSZip)throw new Error('The PowerPoint reader could not load.');
  const zip=await JSZip.loadAsync(bytes);const num=n=>+(n.match(/(\d+)\.xml$/)||[0,0])[1];
  const names=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>num(a)-num(b));
  const titles=[];
  for(const n of names){const doc=new DOMParser().parseFromString(await zip.file(n).async('string'),'application/xml');let t='';
    for(const sp of doc.getElementsByTagNameNS('*','sp')){const ph=sp.getElementsByTagNameNS('*','ph')[0];const ty=ph&&ph.getAttribute('type');if(ty==='title'||ty==='ctrTitle'){t=[...sp.getElementsByTagNameNS('*','t')].map(x=>x.textContent).join('').trim();break;}}
    if(!t)t=[...doc.getElementsByTagNameNS('*','t')].map(x=>x.textContent).join(' ').replace(/\s+/g,' ').trim().slice(0,90);
    titles.push(t||'(slide with no text)');}
  let w=0,h=0;try{const pres=new DOMParser().parseFromString(await zip.file('ppt/presentation.xml').async('string'),'application/xml');const sz=pres.getElementsByTagNameNS('*','sldSz')[0];if(sz){w=+sz.getAttribute('cx')/914400;h=+sz.getAttribute('cy')/914400;}}catch(_e){}
  const media=Object.keys(zip.files).filter(n=>/^ppt\/media\/[^/]+\.(png|jpe?g)$/i.test(n));
  return {zip,titles,media,w,h};
}
function closestFormat(w,h){if(!w||!h)return null;let best=null,bd=1e9;for(const [k,f] of Object.entries(FORMATS)){const d=Math.abs(f.w-w)+Math.abs(f.h-h);if(d<bd){bd=d;best=k;}}return bd<1.2?best:null;}
function loadImg(src){return new Promise((ok,no)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>ok(im);im.onerror=()=>no(new Error('Image could not load.'));im.src=src;});}
function toPng(im){const max=1800,s=Math.min(1,max/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height));const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round((im.naturalWidth||im.width)*s));cv.height=Math.max(1,Math.round((im.naturalHeight||im.height)*s));cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);return {dataUrl:cv.toDataURL('image/png'),w:cv.width,h:cv.height};}
async function blobToPng(blob){const u=URL.createObjectURL(blob);try{return toPng(await loadImg(u));}finally{URL.revokeObjectURL(u);}}
const b64bytes=d=>{const s=atob(d.split(',')[1]);const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;};

/* =========================================================== presentation layout engine
   One layout feeds three renderers (SVG preview, PptxGenJS, pdf-lib) so the exports match the preview. Units: inches, sizes in pt. */
const FORMATS={'16x9':{label:'16:9 slide (13.33 x 7.5 in.)',w:13.333,h:7.5},'letter-l':{label:'Letter page, landscape (11 x 8.5 in.)',w:11,h:8.5},'letter-p':{label:'Letter page, portrait (8.5 x 11 in.)',w:8.5,h:11},'tabloid-l':{label:'Tabloid page, landscape (17 x 11 in.)',w:17,h:11},'tabloid-p':{label:'Tabloid page, portrait (11 x 17 in.)',w:11,h:17}};
const FONTS=[['Arial','sans'],['Helvetica','sans'],['Calibri','sans'],['Segoe UI','sans'],['Verdana','sans'],['Georgia','serif'],['Times New Roman','serif'],['Garamond','serif'],['Courier New','mono']];
const fontKind=f=>(FONTS.find(x=>x[0]===f)||['','sans'])[1];
const cssFont=f=>`"${f}", ${({sans:'Helvetica, Arial, sans-serif',serif:'Georgia, "Times New Roman", serif',mono:'"Courier New", monospace'})[fontKind(f)]}`;
const POS={tl:'Top left',tr:'Top right',bl:'Bottom left',br:'Bottom right',bc:'Bottom center'};
function newSpec(firm){return {format:'16x9',margins:{t:0.5,r:0.5,b:0.5,l:0.5},safe:0.25,guides:true,
  colors:{primary:'#0B2238',accent:'#E8772E',text:'#1B2430',bg:'#FFFFFF'},fonts:{heading:'Arial',body:'Arial'},sizes:{title:40,heading:28,body:18,small:10},
  logo:{src:firm?.logo_url?'firm':'none',path:null,pos:'tr',h:0.55},logos:[],
  header:{on:false,text:'{project}',rule:true},footer:{on:true,text:'{firm}  |  {project}',pageNum:true,numFmt:'{page} / {pages}',rule:true},
  elements:[],background:{type:'color'}};}
function fixSpec(s,firm){const d=newSpec(firm);s=s&&typeof s==='object'?s:{};const o={...d,...s};['margins','colors','fonts','sizes','logo','header','footer','background'].forEach(k=>o[k]={...d[k],...(s[k]||{})});['heading','body'].forEach(k=>{if(!FONTS.some(f=>f[0]===o.fonts[k]))o.fonts[k]=d.fonts[k];});Object.keys(d.colors).forEach(k=>{if(!/^#[0-9a-f]{6}$/i.test(o.colors[k]||''))o.colors[k]=d.colors[k];});o.logos=Array.isArray(s.logos)?s.logos:[];o.elements=Array.isArray(s.elements)?s.elements:[];if(!FORMATS[o.format])o.format='16x9';return o;}
const num=(v,d,lo,hi)=>{const n=parseFloat(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):d;};
function tokens(t,ctx,i,n){return String(t||'').replace(/\{firm\}/g,ctx.firm||'').replace(/\{project\}/g,ctx.project||'').replace(/\{date\}/g,ctx.date||'').replace(/\{title\}/g,ctx.title||'').replace(/\{page\}/g,String(i+1)).replace(/\{pages\}/g,String(n));}
function imgSize(key,ctx,h){const m=ctx.images[key];if(!m)return null;return {w:h*m.w/m.h,h};}
function layoutSlide(spec,ctx,slide,i,n){
  const F=FORMATS[spec.format],W=F.w,H=F.h,m=spec.margins,sf=spec.safe,C=spec.colors,items=[];
  const L=m.l,T=m.t,R=W-m.r,B=H-m.b;
  const bg={color:C.bg,image:spec.background.type==='pdf'||spec.background.type==='image'?'bg':null};
    const small=spec.sizes.small,body=spec.fonts.body,head=spec.fonts.heading;
  // logos (firm logo + secondary) placed at margin corners
  const corners={tl:[],tr:[],bl:[],br:[],bc:[]};
  if(spec.logo.src!=='none'){const key=spec.logo.src==='firm'?'firmlogo':'p:'+spec.logo.path;const s=imgSize(key,ctx,num(spec.logo.h,0.5,0.2,3));if(s)corners[spec.logo.pos||'tr'].push({key,...s});}
  (spec.logos||[]).forEach(g=>{const s=imgSize('p:'+g.path,ctx,num(g.h,0.4,0.15,3));if(s)corners[g.pos||'br'].push({key:'p:'+g.path,...s});});
  const rW={tl:0,tr:0,bl:0,br:0,bc:0},rH={tl:0,tr:0,bl:0,br:0,bc:0};
  for(const [pos,list] of Object.entries(corners)){if(!list.length)continue;const gap=0.18;const tot=list.reduce((a,b)=>a+b.w,0)+gap*(list.length-1);
    let x=pos[1]==='l'?L:pos[1]==='r'?R-tot:(W-tot)/2;const top=pos[0]==='t';
    for(const g of list){items.push({t:'img',key:g.key,x,y:top?T:B-g.h,w:g.w,h:g.h});x+=g.w+gap;}
    rW[pos]=tot+0.25;rH[pos]=Math.max(...list.map(g=>g.h));}
  if(spec.header.on){items.push({t:'text',x:L+rW.tl,y:T,w:Math.max(0.5,R-L-rW.tl-rW.tr),h:0.3,text:tokens(spec.header.text,ctx,i,n),size:small,color:C.text,font:body,valign:'middle'});if(spec.header.rule)items.push({t:'line',x1:L,y1:T+0.38,x2:R,y2:T+0.38,color:C.accent,wpt:0.75});}
  const botH=Math.max(rH.bl,rH.br,rH.bc);let sB=B-Math.max(sf,botH?botH+0.15:0);
  if(spec.footer.on){const fy=B-0.3,ruleY=Math.min(fy,B-botH)-0.1,numW=spec.footer.pageNum?1.6:0;const fx=L+rW.bl;const fEnd=rW.bc?(W-rW.bc)/2:R-rW.br-numW;
    if(spec.footer.rule)items.push({t:'line',x1:L,y1:ruleY,x2:R,y2:ruleY,color:C.accent,wpt:0.75});
    items.push({t:'text',x:fx,y:fy,w:Math.max(0.5,fEnd-fx),h:0.3,text:tokens(spec.footer.text,ctx,i,n),size:small,color:C.text,font:body,valign:'middle'});
    if(spec.footer.pageNum)items.push({t:'text',x:R-rW.br-numW,y:fy,w:numW,h:0.3,text:tokens(spec.footer.numFmt||'{page}',ctx,i,n),size:small,color:C.text,font:body,align:'right',valign:'middle'});
    sB=Math.min(B-sf,ruleY-0.12);}
  const sL=L+sf,sR=R-sf,sT=T+sf+(spec.header.on?0.42:0);
  const tL=sL+(T+rH.tl>sT?rW.tl:0),tR=sR-(T+rH.tr>sT?rW.tr:0);
  if(slide.kind==='title'){
    const th=(spec.sizes.title/72)*2.6,midY=sT+(sB-sT)*0.42;
    items.push({t:'rect',x:sL,y:midY-th/2-0.28,w:Math.min(1.6,(sR-sL)*0.3),h:0.08,fill:C.accent});
    items.push({t:'text',x:sL,y:midY-th/2-0.1,w:sR-sL,h:th,text:slide.title||ctx.title||'Presentation title',size:spec.sizes.title,color:C.primary,font:head,bold:true,valign:'bottom'});
    items.push({t:'text',x:sL,y:midY+th/2,w:sR-sL,h:(spec.sizes.heading/72)*1.5,text:slide.subtitle||ctx.project||'',size:Math.round(spec.sizes.heading*0.75),color:C.text,font:body,valign:'top'});
    items.push({t:'text',x:sL,y:midY+th/2+(spec.sizes.heading/72)*1.5,w:sR-sL,h:0.4,text:ctx.date||'',size:spec.sizes.small+2,color:C.text,font:body,valign:'top'});
  }else{
    const th=(spec.sizes.heading/72)*1.35;
    items.push({t:'text',x:tL,y:sT,w:tR-tL,h:th,text:slide.title||'Slide title',size:spec.sizes.heading,color:C.primary,font:head,bold:true,valign:'top'});
    items.push({t:'rect',x:sL,y:sT+th+0.06,w:Math.min(1.1,(sR-sL)*0.2),h:0.05,fill:C.accent});
    items.push({t:'text',x:sL,y:sT+th+0.32,w:sR-sL,h:Math.max(0.5,sB-(sT+th+0.32)),bullets:(slide.bullets||[]).filter(Boolean),text:'',size:spec.sizes.body,color:C.text,font:body,valign:'top'});
  }
  for(const [k,e] of (spec.elements||[]).entries()){if(e.on&&e.on!=='all'&&e.on!==slide.kind)continue;
    const x=num(e.x,1,0,W),y=num(e.y,1,0,H),w=num(e.w,2,0.05,W),h=num(e.h,0.5,0,H);
    if(e.type==='text')items.push({t:'text',x,y,w,h,text:tokens(e.text,ctx,i,n),size:num(e.size,14,6,120),color:e.color||C.text,font:e.bold?head:body,bold:!!e.bold,align:e.align||'left',valign:'top',el:k});
    else if(e.type==='rect')items.push({t:'rect',x,y,w,h,fill:e.fill||C.accent,el:k});
    else if(e.type==='line')items.push({t:'line',x1:x,y1:y,x2:x+w,y2:y,color:e.color||C.accent,wpt:num(e.wpt,1.5,0.25,12),el:k});
    else if(e.type==='image'&&e.path){const m2=ctx.images['p:'+e.path];if(m2){const ih=Math.min(h||w*m2.h/m2.w,H);items.push({t:'img',key:'p:'+e.path,x,y,w:ih*m2.w/m2.h,h:ih,el:k});}}}
  return {W,H,bg,items,guides:{L,T,R,B,sL,sT:T+sf,sR,sB:B-sf}};
}
function wrapLines(text,maxW,measure){const out=[];for(const para of String(text||'').split('\n')){const words=para.split(/\s+/).filter(Boolean);if(!words.length){out.push('');continue;}let line='';
  for(const w of words){const t=line?line+' '+w:w;if(measure(t)<=maxW||!line)line=t;else{out.push(line);line=w;}}out.push(line);}return out;}
let mctx=null;function cssMeasure(font,bold,pt){if(!mctx)mctx=document.createElement('canvas').getContext('2d');mctx.font=`${bold?'700 ':''}${pt}px ${cssFont(font)}`;return s=>mctx.measureText(s).width/72;}
function textBlocks(it,measure){const lh=it.size/72*1.25;const lines=[];
  if(it.bullets){const ind=it.size/72*1.1;for(const b of it.bullets){const ls=wrapLines(b,it.w-ind,measure);ls.forEach((l,j)=>lines.push({x:it.x+ind,text:l,bullet:j===0}));lines.push({gap:true});}}
  else wrapLines(it.text,it.w,measure).forEach(l=>lines.push({x:it.x,text:l}));
const totalH=lines.reduce((a,l)=>a+(l.gap?lh*0.35:lh),0)-(lines.length&&lines[lines.length-1].gap?lh*0.35:0);
  let y=it.valign==='middle'?it.y+(it.h-totalH)/2:it.valign==='bottom'?it.y+it.h-totalH:it.y;const out=[];
  for(const l of lines){if(l.gap){y+=lh*0.35;continue;}if(y+lh>it.y+it.h+lh*0.2&&out.length)break;out.push({...l,y,lh});y+=lh;}return out;}

/* ---------- SVG preview */
function svgSlide(spec,ctx,slide,i,n,opts){const Lr=layoutSlide(spec,ctx,slide,i,n);const parts=[];
  parts.push(`<rect x="0" y="0" width="${Lr.W}" height="${Lr.H}" fill="${esc(Lr.bg.color)}"/>`);
  if(Lr.bg.image&&ctx.images.bg)parts.push(`<image href="${ctx.images.bg.dataUrl}" x="0" y="0" width="${Lr.W}" height="${Lr.H}" preserveAspectRatio="none"/>`);
  for(const it of Lr.items){const dg=it.el!=null&&opts?.drag?` data-el="${it.el}" class="fk-drag"`:'';
    if(it.t==='rect')parts.push(`<rect${dg} x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="${esc(it.fill)}"/>`);
    else if(it.t==='line')parts.push(`<line${dg} x1="${it.x1}" y1="${it.y1}" x2="${it.x2}" y2="${it.y2}" stroke="${esc(it.color)}" stroke-width="${it.wpt/72}"/>${dg?`<rect${dg} x="${it.x1}" y="${it.y1-0.08}" width="${it.x2-it.x1}" height="0.16" fill="transparent"/>`:''}`);
    else if(it.t==='img'){const m=ctx.images[it.key];if(m)parts.push(`<image${dg} href="${m.dataUrl}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}"/>`);}
    else if(it.t==='text'){const ms=cssMeasure(it.font,it.bold,it.size);const fs=it.size/72;const anchor=it.align==='right'?'end':it.align==='center'?'middle':'start';
      const ax=x=>it.align==='right'?it.x+it.w:it.align==='center'?it.x+it.w/2:x;
      const tx=textBlocks(it,ms).map(l=>`${l.bullet?`<text x="${it.x}" y="${l.y+fs*0.95}" font-size="${fs}" fill="${esc(it.color)}" font-family='${cssFont(it.font)}'>•</text>`:''}<text x="${ax(l.x)}" y="${l.y+fs*0.95}" font-size="${fs}" fill="${esc(it.color)}" font-family='${cssFont(it.font)}' font-weight="${it.bold?700:400}" text-anchor="${anchor}">${esc(l.text)}</text>`).join('');
      parts.push(dg?`<g${dg}><rect x="${it.x}" y="${it.y}" width="${it.w}" height="${Math.max(it.h,fs*1.3)}" fill="transparent" stroke="#7fe7ff" stroke-width="0.01" stroke-dasharray="0.06 0.05"/>${tx}</g>`:tx);}}
  if(opts?.guides&&spec.guides){const g=Lr.guides;parts.push(`<rect x="${g.L}" y="${g.T}" width="${g.R-g.L}" height="${g.B-g.T}" fill="none" stroke="#00a9d6" stroke-width="0.015" stroke-dasharray="0.08 0.06"/><rect x="${g.sL}" y="${g.sT}" width="${g.sR-g.sL}" height="${g.sB-g.sT}" fill="none" stroke="#e8772e" stroke-width="0.012" stroke-dasharray="0.03 0.05"/>`);}
  return `<svg class="fk-slide" viewBox="0 0 ${Lr.W} ${Lr.H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(slide.kind==='title'?'Title slide preview':'Content slide preview')}">${parts.join('')}</svg>`;}

/* ---------- image context for a template */
async function buildCtx(c,firm,spec,base){const ctx={firm:firm.name,project:'Project name',date:new Date().toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}),title:'',...(base||{}),images:{},warnings:[]};
  const want=new Set();if(spec.logo.src==='upload'&&spec.logo.path)want.add(spec.logo.path);(spec.logos||[]).forEach(g=>g.path&&want.add(g.path));(spec.elements||[]).forEach(e=>e.type==='image'&&e.path&&want.add(e.path));
  const jobs=[...want].map(async p=>{try{const b=await c.client.storage.from(BUCKET).download(p);if(b.error)throw b.error;ctx.images['p:'+p]=await blobToPng(b.data);}catch(_e){ctx.warnings.push('An uploaded image could not be read.');}});
  if(spec.logo.src==='firm'&&firm.logo_url)jobs.push((async()=>{try{const r=await fetch(firm.logo_url);if(!r.ok)throw 0;ctx.images.firmlogo=await blobToPng(await r.blob());}catch(_e){try{ctx.images.firmlogo=toPng(await loadImg(firm.logo_url));}catch(_e2){ctx.warnings.push('The firm profile logo could not be loaded here. Upload the logo in this template instead.');}}})());
  const bgk=spec.background;if(bgk.type==='image'&&bgk.path)jobs.push((async()=>{try{const b=await c.client.storage.from(BUCKET).download(bgk.path);if(b.error)throw b.error;ctx.images.bg=await blobToPng(b.data);}catch(_e){ctx.warnings.push('The background image could not be read.');}})());
  if(bgk.type==='pdf'&&bgk.path)jobs.push((async()=>{try{const bytes=await fileBytes(c,bgk.path);ctx.bgPdf=bytes;const info=await readPdfInfo(bytes);const pg=await info.doc.getPage(Math.min(info.pages,bgk.page||1));const v0=pg.getViewport({scale:1});const sc=1800/Math.max(v0.width,v0.height);const v=pg.getViewport({scale:sc});const cv=document.createElement('canvas');cv.width=Math.round(v.width);cv.height=Math.round(v.height);await pg.render({canvasContext:cv.getContext('2d'),viewport:v}).promise;ctx.images.bg={dataUrl:cv.toDataURL('image/png'),w:cv.width,h:cv.height};}catch(_e){ctx.warnings.push('The background PDF could not be read.');}})());
  await Promise.all(jobs);return ctx;}

/* ---------- exports */
function deckFromText(title,txt){const slides=[{kind:'title',title}];String(txt||'').split(/\n\s*\n/).map(b=>b.split('\n').map(x=>x.trim()).filter(Boolean)).filter(b=>b.length).forEach(b=>slides.push({kind:'content',title:b[0].replace(/^#+\s*/,''),bullets:b.slice(1).map(x=>x.replace(/^[-*•]\s*/,''))}));return slides;}
const hex=c=>String(c||'#000000').replace('#','').slice(0,6).toUpperCase();
async function exportPptx(spec,ctx,slides){const P=await pptxLib();const pptx=new P();const F=FORMATS[spec.format];pptx.defineLayout({name:'DRAWUP',width:F.w,height:F.h});pptx.layout='DRAWUP';pptx.author=ctx.firm||'DrawUp';pptx.company=ctx.firm||'';pptx.title=ctx.title||'Presentation';
  slides.forEach((sl,i)=>{const Lr=layoutSlide(spec,ctx,sl,i,slides.length);const s=pptx.addSlide();s.background={color:hex(Lr.bg.color)};
    if(Lr.bg.image&&ctx.images.bg)s.addImage({data:ctx.images.bg.dataUrl,x:0,y:0,w:F.w,h:F.h});
    for(const it of Lr.items){
      if(it.t==='rect')s.addShape('rect',{x:it.x,y:it.y,w:it.w,h:it.h,fill:{color:hex(it.fill)},line:{color:hex(it.fill),width:0}});
      else if(it.t==='line')s.addShape('line',{x:it.x1,y:it.y1,w:Math.max(0.01,it.x2-it.x1),h:0,line:{color:hex(it.color),width:it.wpt}});
      else if(it.t==='img'){const m=ctx.images[it.key];if(m)s.addImage({data:m.dataUrl,x:it.x,y:it.y,w:it.w,h:it.h});}
      else if(it.t==='text'){const o={x:it.x,y:it.y,w:it.w,h:Math.max(it.h,it.size/72*1.3),fontFace:it.font,fontSize:it.size,color:hex(it.color),bold:!!it.bold,align:it.align||'left',valign:it.valign||'top',margin:0,fit:'none'};
        if(it.bullets){if(it.bullets.length)s.addText(it.bullets.map(b=>({text:b,options:{bullet:true,paraSpaceAfter:6}})),o);}else if(it.text)s.addText(it.text,o);}}});
  return await pptx.write({outputType:'uint8array'});}
const WINANSI=/[^\x20-\x7E\xA0-\xFF‘’“”•–—…€™]/g;
async function exportPdf(spec,ctx,slides){const PL=await pdfLib();const doc=await PL.PDFDocument.create();const F=FORMATS[spec.format];doc.setTitle(ctx.title||'Presentation');doc.setAuthor(ctx.firm||'DrawUp');doc.setCreator('DrawUp GM Presentation');
  const SF=PL.StandardFonts,fm={sans:[SF.Helvetica,SF.HelveticaBold],serif:[SF.TimesRoman,SF.TimesRomanBold],mono:[SF.Courier,SF.CourierBold]};const fcache={};
  const font=async(f,b)=>{const k=fontKind(f)+(b?1:0);if(!fcache[k])fcache[k]=await doc.embedFont(fm[fontKind(f)][b?1:0]);return fcache[k];};
  const imgs={};const img=async k=>{if(!imgs[k]&&ctx.images[k])imgs[k]=await doc.embedPng(b64bytes(ctx.images[k].dataUrl));return imgs[k];};
  const col=h=>{const v=hex(h);return PL.rgb(parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255);};
  let bgPage=null;if(spec.background.type==='pdf'&&ctx.bgPdf){try{[bgPage]=await doc.embedPdf(ctx.bgPdf,[Math.max(0,(spec.background.page||1)-1)]);}catch(_e){bgPage=null;}}
  const W=F.w*72,H=F.h*72,Y=y=>H-y*72;
  for(const [i,sl] of slides.entries()){const Lr=layoutSlide(spec,ctx,sl,i,slides.length);const pg=doc.addPage([W,H]);
    pg.drawRectangle({x:0,y:0,width:W,height:H,color:col(Lr.bg.color)});
    if(Lr.bg.image){if(bgPage)pg.drawPage(bgPage,{x:0,y:0,width:W,height:H});else{const bi=await img('bg');if(bi)pg.drawImage(bi,{x:0,y:0,width:W,height:H});}}
    for(const it of Lr.items){
      if(it.t==='rect')pg.drawRectangle({x:it.x*72,y:Y(it.y+it.h),width:it.w*72,height:it.h*72,color:col(it.fill)});
      else if(it.t==='line')pg.drawLine({start:{x:it.x1*72,y:Y(it.y1)},end:{x:it.x2*72,y:Y(it.y2)},thickness:it.wpt,color:col(it.color)});
      else if(it.t==='img'){const e=await img(it.key);if(e)pg.drawImage(e,{x:it.x*72,y:Y(it.y+it.h),width:it.w*72,height:it.h*72});}
      else if(it.t==='text'){const f=await font(it.font,it.bold);const clean=s=>String(s).replace(WINANSI,'?');const ms=s=>f.widthOfTextAtSize(clean(s),it.size)/72;
        const blocks=textBlocks({...it,text:clean(it.text),bullets:it.bullets?.map(clean)},ms);
        for(const l of blocks){const w=ms(l.text);let x=l.x*72;if(it.align==='right')x=(it.x+it.w)*72-w*72;else if(it.align==='center')x=(it.x+it.w/2)*72-w*36;
          if(l.bullet)pg.drawText('•',{x:it.x*72,y:Y(l.y)-it.size*0.95,size:it.size,font:f,color:col(it.color)});
          if(l.text)pg.drawText(l.text,{x,y:Y(l.y)-it.size*0.95,size:it.size,font:f,color:col(it.color)});}}}}
  return await doc.save();}
function download(bytes,name,mime){const u=URL.createObjectURL(new Blob([bytes],{type:mime}));const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);}
const slug=s=>String(s||'presentation').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'presentation';

/* =========================================================== Playbook pane */
async function renderPlaybook(body,c,firm,admin){
  body.innerHTML='<div class="du-loading">LOADING PLAYBOOK…</div>';
  const [pbR,fR]=await Promise.all([c.client.from('firm_playbooks').select('*').eq('firm_id',firm.id).maybeSingle(),c.client.from('firm_kit_files').select('*').eq('firm_id',firm.id).eq('kind','playbook').order('created_at',{ascending:false})]);
  if(pbR.error)throw pbR.error;if(fR.error)throw fR.error;
  const pb=pbR.data,files=fR.data||[];const secs=sectionsOf(pb);
  const primary=pb?.mode==='upload'&&pb.primary_file_id?files.find(f=>f.id===pb.primary_file_id):null;
  const status=primary?`Using ${esc(firm.name)}'s uploaded playbook`:pb?.mode==='edited'?`Edited by ${esc(firm.name)} from the DrawUp general standards`:DEFAULT_LABEL;
  body.innerHTML=`<div class="fk-wrap" data-fk="playbook">
  <article class="du-glass fk-head"><div><span class="du-kicker">FIRM PLAYBOOK · STANDARDS</span><h2>${esc(firm.name)} standards</h2><p class="fk-status ${primary||pb?.mode==='edited'?'firm':'drawup'}">${status}</p>
   <p class="du-muted">Fonts, text sizes, line weights, margins, sheet sizes, title block, sheet and layer naming, dimensions and presentation style. ${admin?'You can edit any section or upload your firm\'s own playbook as a PDF or PowerPoint.':'Only firm admins can change it.'}</p></div>
   ${admin?`<div class="fk-actions"><button class="du-btn primary" type="button" data-fk-act="edit">Edit standards</button><label class="du-btn ghost fk-file">Upload firm playbook<input type="file" id="fk-pb-file" accept=".pdf,.pptx,application/pdf,${PPTX_MIME}" hidden></label><label class="fk-check"><input type="checkbox" id="fk-pb-replace" checked> Replace the DrawUp playbook with the upload</label><span class="fk-st" id="fk-pb-st" role="status"></span></div>`:''}</article>
  ${primary?`<article class="du-glass fk-viewer-card"><div class="fk-row-head"><div><span class="du-kicker">FIRM PLAYBOOK FILE</span><h3>${esc(primary.file_name)}</h3></div>${admin?`<button class="du-btn ghost" type="button" data-fk-act="use-drawup">Show DrawUp standards instead</button>`:''}</div><div class="fk-viewer" data-file="${primary.id}"></div></article>`:''}
  <div class="fk-chips">${secs.map(s=>`<button type="button" data-fk-jump="${esc(s.key)}">${esc(s.title)}</button>`).join('')}</div>
  ${primary?`<p class="fk-sub">${esc(DEFAULT_LABEL)}. Shown for reference below your firm's file.</p>`:''}
  <div class="fk-secs">${secs.map(s=>`<article class="du-glass fk-sec" id="fk-sec-${esc(s.key)}" data-key="${esc(s.key)}"><div class="fk-row-head"><h3>${esc(s.title)}</h3><span class="fk-tag ${s.edited?'firm':''}">${s.edited?'Firm standard':'DrawUp general'}</span></div>${s.intro?`<p class="du-muted">${esc(s.intro)}</p>`:''}<dl class="fk-dl">${s.rows.map(r=>`<div><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl></article>`).join('')}</div>
  <p class="fk-src">${esc(DEFAULT_LABEL)}. Written from widely used US practice and the US National CAD Standard (NCS) conventions. It makes no claim about any particular firm. Confirm details against the current NCS edition and your firm's own standards.</p>
  <article class="du-glass fk-files"><span class="du-kicker">PLAYBOOK FILES</span><h3>${files.length?files.length+' file'+(files.length===1?'':'s'):'No playbook files yet'}</h3>
   ${files.map(f=>`<div class="fk-file-row" data-id="${f.id}"><div><b>${esc(f.file_name)}</b><small>${/pdf/.test(f.mime_type||'')?'PDF':'PowerPoint'} · ${kb(f.size_bytes||0)}${f.page_count?' · '+f.page_count+(/pdf/.test(f.mime_type||'')?' pages':' slides'):''} · ${day(f.created_at)}${primary&&primary.id===f.id?' · <span class="fk-tag firm">Firm playbook</span>':''}</small></div><div class="fk-btns"><button class="du-btn ghost" type="button" data-fk-view="${f.id}">View</button><button class="du-btn ghost" type="button" data-fk-dl="${f.id}">Download</button>${admin&&!(primary&&primary.id===f.id)?`<button class="du-btn ghost" type="button" data-fk-primary="${f.id}">Use as firm playbook</button>`:''}${admin?`<button class="du-btn ghost" type="button" data-fk-del="${f.id}">Remove</button>`:''}</div><div class="fk-viewer fk-inline" hidden></div></div>`).join('')||`<p class="du-muted">${admin?'Upload your firm\'s playbook (PDF or PowerPoint) to replace or sit alongside the DrawUp standards.':'Your firm has not uploaded a playbook file.'}</p>`}
  </article></div>`;
  const reload=()=>renderPlaybook(body,c,firm,admin);
  body.querySelectorAll('[data-fk-jump]').forEach(b=>b.onclick=()=>body.querySelector('#fk-sec-'+CSS.escape(b.dataset.fkJump))?.scrollIntoView({behavior:'smooth',block:'start'}));
  if(primary)viewFile(c,primary,body.querySelector('.fk-viewer-card .fk-viewer'));
  body.querySelectorAll('[data-fk-view]').forEach(b=>b.onclick=()=>{const row=b.closest('.fk-file-row'),v=row.querySelector('.fk-inline');if(!v.hidden){v.hidden=true;v.innerHTML='';b.textContent='View';return;}v.hidden=false;b.textContent='Hide';viewFile(c,files.find(f=>f.id===b.dataset.fkView),v);});
  body.querySelectorAll('[data-fk-dl]').forEach(b=>b.onclick=async()=>{try{location.assign(await signed(c,files.find(f=>f.id===b.dataset.fkDl),true));}catch(e){c.toast(e.message||String(e),true);}});
  if(!admin)return;
  const st=body.querySelector('#fk-pb-st');
  const savePb=async patch=>{const row={firm_id:firm.id,mode:pb?.mode||'drawup',standards:pb?.standards||{},primary_file_id:pb?.primary_file_id||null,...patch,updated_at:new Date().toISOString(),updated_by:c.user.id};const r=await c.client.from('firm_playbooks').upsert(row,{onConflict:'firm_id'}).select('*').single();if(r.error)throw r.error;return r.data;};
  body.querySelector('#fk-pb-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;
    try{if(!isPdf(file)&&!isPptx(file))throw new Error('Upload a PDF or a PowerPoint (.pptx) file. Older .ppt files need to be saved as .pptx first.');
      st.textContent='Reading '+file.name+'…';const bytes=new Uint8Array(await file.arrayBuffer());let extra={};
      if(isPdf(file)){const info=await readPdfInfo(bytes);extra={page_count:info.pages};}else{const px=await readPptx(bytes);extra={page_count:px.titles.length,slide_titles:px.titles.slice(0,200).map(t=>t.slice(0,200))};}
      st.textContent='Uploading…';const row=await uploadKit(c,firm,file,'playbook',extra);
      const replace=body.querySelector('#fk-pb-replace').checked;
      if(replace)await savePb({mode:'upload',primary_file_id:row.id});
      c.toast(replace?'Firm playbook uploaded. It now replaces the DrawUp playbook for your firm.':'Playbook file added.');reload();}catch(err){st.textContent='Not uploaded: '+(err.message||err);}};
  body.querySelectorAll('[data-fk-primary]').forEach(b=>b.onclick=async()=>{try{await savePb({mode:'upload',primary_file_id:b.dataset.fkPrimary});c.toast('That file is now your firm playbook.');reload();}catch(e){c.toast(e.message||String(e),true);}});
  body.querySelector('[data-fk-act="use-drawup"]')?.addEventListener('click',async()=>{try{const ov=pb?.standards?.sections||{};await savePb({mode:Object.keys(ov).length?'edited':'drawup',primary_file_id:null});c.toast('Showing the standards below as your playbook. The uploaded file is kept.');reload();}catch(e){c.toast(e.message||String(e),true);}});
  body.querySelectorAll('[data-fk-del]').forEach(b=>b.onclick=async()=>{const f=files.find(x=>x.id===b.dataset.fkDel);if(!confirm('Remove “'+f.file_name+'” from your firm playbook files?'))return;
    try{if(primary&&primary.id===f.id){const ov=pb?.standards?.sections||{};await savePb({mode:Object.keys(ov).length?'edited':'drawup',primary_file_id:null});}
      const d=await c.client.from('firm_kit_files').delete().eq('id',f.id).select('id');if(d.error)throw d.error;if(!d.data?.length)throw new Error('The database did not confirm the removal.');await c.client.storage.from(BUCKET).remove([f.storage_path]);c.toast('File removed.');reload();}catch(e){c.toast(e.message||String(e),true);}});
  body.querySelector('[data-fk-act="edit"]').onclick=()=>editStandards(body,c,firm,pb,savePb,reload);
}
async function viewFile(c,f,el){if(!f||!el)return;el.innerHTML='<p class="du-muted">Opening…</p>';
  try{if(/pdf/.test(f.mime_type||'')||/\.pdf$/i.test(f.file_name)){const info=await readPdfInfo(await fileBytes(c,f.storage_path));el.innerHTML=`<div class="fk-pages"></div><p class="fk-more-wrap"></p>`;const box=el.querySelector('.fk-pages');let shown=0;
      const more=async k=>{const end=Math.min(info.pages,shown+k);for(let p=shown+1;p<=end;p++){const pg=await info.doc.getPage(p);const v0=pg.getViewport({scale:1});const cssW=Math.max(280,Math.min(980,el.clientWidth||700));const v=pg.getViewport({scale:cssW/v0.width*Math.min(2,window.devicePixelRatio||1)});const cv=document.createElement('canvas');cv.width=Math.round(v.width);cv.height=Math.round(v.height);cv.className='fk-page';cv.setAttribute('aria-label','Page '+p);box.appendChild(cv);await pg.render({canvasContext:cv.getContext('2d'),viewport:v}).promise;}shown=end;
        const mw=el.querySelector('.fk-more-wrap');mw.innerHTML=shown<info.pages?`<button class="du-btn ghost" type="button">Show more pages (${shown} of ${info.pages})</button>`:`<span class="du-muted">${info.pages} page${info.pages===1?'':'s'}</span>`;mw.querySelector('button')?.addEventListener('click',()=>more(4));};
      await more(2);}
    else{const url=await signed(c,f,true);const titles=f.slide_titles||[];el.innerHTML=`<div class="fk-pptx"><p><a class="du-btn primary" href="${esc(url)}" download="${esc(f.file_name)}">Download PowerPoint</a> <span class="du-muted">Opens in PowerPoint, Keynote or Google Slides.</span></p>${titles.length?`<span class="du-kicker">SLIDE TITLES FOUND IN THE FILE</span><ol class="fk-titles">${titles.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>`:'<p class="du-muted">DrawUp could not find slide titles in this file.</p>'}</div>`;}}
  catch(e){el.innerHTML=`<p class="du-muted">This file could not be opened here: ${esc(e.message||e)}</p>`;}}
function editStandards(body,c,firm,pb,savePb,reload){
  const secs=sectionsOf(pb);const wrap=body.querySelector('.fk-secs');body.querySelector('.fk-chips').hidden=true;
  const rowHTML=r=>`<div class="fk-erow"><input data-r="0" value="${esc(r[0])}" aria-label="Item"><textarea data-r="1" rows="2" aria-label="Standard">${esc(r[1])}</textarea><button class="du-btn ghost" type="button" data-fk-rm aria-label="Remove row">×</button></div>`;
  const secHTML=s=>`<article class="du-glass fk-sec fk-editing" data-key="${esc(s.key)}"><div class="fk-row-head">${s.custom?`<input class="fk-etitle" value="${esc(s.title)}" aria-label="Section title">`:`<h3>${esc(s.title)}</h3>`}${DEF[s.key]?`<button class="du-btn ghost" type="button" data-fk-reset>Reset to DrawUp default</button>`:`<button class="du-btn ghost" type="button" data-fk-rmsec>Remove section</button>`}</div><textarea class="fk-eintro" rows="2" aria-label="Section note">${esc(s.intro||'')}</textarea><div class="fk-erows">${s.rows.map(rowHTML).join('')}</div><button class="du-btn ghost" type="button" data-fk-addrow>Add row</button></article>`;
  wrap.innerHTML=secs.map(secHTML).join('')+`<div class="fk-savebar"><button class="du-btn ghost" type="button" data-fk-addsec>Add a firm section</button><button class="du-btn ghost" type="button" data-fk-cancel>Cancel</button><button class="du-btn primary" type="button" data-fk-save>Save standards</button><span class="fk-st" role="status"></span></div>`;
  const bind=root=>{root.querySelectorAll('[data-fk-rm]').forEach(b=>b.onclick=()=>b.closest('.fk-erow').remove());
    root.querySelectorAll('[data-fk-addrow]').forEach(b=>b.onclick=()=>{b.previousElementSibling.insertAdjacentHTML('beforeend',rowHTML(['','']));bind(b.previousElementSibling.lastElementChild);});
    root.querySelectorAll('[data-fk-reset]').forEach(b=>b.onclick=()=>{const k=b.closest('.fk-sec').dataset.key;const tmp=document.createElement('div');tmp.innerHTML=secHTML({...DEF[k],rows:DEF[k].rows.map(r=>r.slice())});const n=tmp.firstElementChild;b.closest('.fk-sec').replaceWith(n);bind(n);});
    root.querySelectorAll('[data-fk-rmsec]').forEach(b=>b.onclick=()=>b.closest('.fk-sec').remove());};
  bind(wrap);
  wrap.querySelector('[data-fk-addsec]').onclick=()=>{const tmp=document.createElement('div');tmp.innerHTML=secHTML({key:'firm-'+Date.now().toString(36),title:'Firm section',intro:'',rows:[['','']],custom:true});const n=tmp.firstElementChild;wrap.querySelector('.fk-savebar').before(n);bind(n);n.querySelector('.fk-etitle').focus();};
  wrap.querySelector('[data-fk-cancel]').onclick=reload;
  wrap.querySelector('[data-fk-save]').onclick=async()=>{const st=wrap.querySelector('.fk-savebar .fk-st');st.textContent='Saving…';
    try{const ov={};wrap.querySelectorAll('.fk-sec').forEach(a=>{const k=a.dataset.key;const rows=[...a.querySelectorAll('.fk-erow')].map(r=>[r.querySelector('[data-r="0"]').value.trim().slice(0,120),r.querySelector('[data-r="1"]').value.trim().slice(0,1200)]).filter(r=>r[0]||r[1]);const intro=a.querySelector('.fk-eintro').value.trim().slice(0,600);
        if(DEF[k]){const d=DEF[k];if(intro===d.intro&&JSON.stringify(rows)===JSON.stringify(d.rows))return;ov[k]={title:d.title,intro,rows};}
        else ov[k]={title:(a.querySelector('.fk-etitle')?.value.trim()||'Firm section').slice(0,120),intro,rows};});
      const keepUpload=pb?.mode==='upload'&&pb.primary_file_id;await savePb({standards:{version:1,sections:ov},mode:keepUpload?'upload':Object.keys(ov).length?'edited':'drawup'});c.toast('Firm standards saved.');reload();}
    catch(e){st.textContent='Not saved: '+(e.message||e);}};
}

/* =========================================================== GM Presentation pane */
async function renderPresent(body,c,firm,admin,selId){
  body.innerHTML='<div class="du-loading">LOADING TEMPLATES…</div>';
  const r=await c.client.from('firm_presentation_templates').select('*').eq('firm_id',firm.id).order('is_default',{ascending:false}).order('updated_at',{ascending:false});if(r.error)throw r.error;
  const list=r.data||[];
  let cur=selId==='new'?null:list.find(t=>t.id===selId)||list[0]||null;
  const editing=admin&&(selId==='new'||!!cur||!list.length);
  let spec=fixSpec(cur?.spec,firm);if(!cur&&admin)spec=newSpec(firm);
  let name=cur?.name||'Meeting deck';let isDef=cur?cur.is_default:!list.length;let bgFileId=cur?.background_file_id||null;
  body.innerHTML=`<div class="fk-wrap" data-fk="present">
  <article class="du-glass fk-head"><div><span class="du-kicker">GM PRESENTATION · TEMPLATES</span><h2>Presentation templates</h2><p class="du-muted">Keep meeting and marketing presentations consistent: logo, other logos, colors, fonts, margins, safe area, header, footer, page numbers and placeholders. Export a new presentation to PowerPoint or PDF.${admin?'':' Only firm admins can change templates.'}</p></div>
  <div class="fk-actions">${admin?`<button class="du-btn ghost" type="button" data-fk-new>New template</button>`:''}${cur||editing?`<button class="du-btn primary" type="button" data-fk-make>Make a presentation</button>`:''}</div></article>
  ${list.length?`<div class="fk-tlist">${list.map(t=>`<button type="button" class="fk-tcard ${cur&&cur.id===t.id?'active':''}" data-fk-pick="${t.id}"><b>${esc(t.name)}</b><small>${esc(FORMATS[fixSpec(t.spec).format].label.split(' (')[0])}${t.is_default?' · Firm default':''}</small></button>`).join('')}</div>`:''}
  ${!cur&&!admin?`<article class="du-glass"><p class="du-muted">Your firm has not set up a presentation template yet. Ask a firm admin to add one.</p></article>`:''}
  ${cur||editing?`<div class="fk-gm ${editing?'':'fk-readonly'}">${editing?`<div class="fk-form"></div>`:''}<div class="fk-prev-col"><div class="fk-prev-tabs" role="tablist"><button type="button" class="active" data-fk-pv="title">Title slide</button><button type="button" data-fk-pv="content">Content slide</button>${editing?`<label class="fk-check"><input type="checkbox" data-fk-guides ${spec.guides?'checked':''}> Margins and safe area</label>`:''}</div><div class="fk-prev"></div><p class="fk-legend">${editing?'<i class="m"></i> margin <i class="s"></i> safe area · drag a placeholder to move it':''}</p><p class="fk-warn" hidden></p></div></div>`:''}
  </div>`;
  body.querySelector('[data-fk-new]')?.addEventListener('click',()=>renderPresent(body,c,firm,admin,'new'));
  body.querySelectorAll('[data-fk-pick]').forEach(b=>b.onclick=()=>renderPresent(body,c,firm,admin,b.dataset.fkPick));
  if(!cur&&!editing)return;
  body.querySelector('[data-fk-make]')?.addEventListener('click',()=>makeDeck(c,firm,spec,name));
  let pv='title',ctx=await buildCtx(c,firm,spec);
  const prev=body.querySelector('.fk-prev'),warn=body.querySelector('.fk-warn');
  const sample=k=>k==='title'?{kind:'title',title:'Project kickoff meeting'}:{kind:'content',title:'Schedule and next steps',bullets:['Design development review in two weeks','Consultant coordination meeting on site','Owner sign-off on the finish palette']};
  const draw=()=>{prev.innerHTML=svgSlide(spec,ctx,sample(pv),pv==='title'?0:1,8,{guides:editing,drag:editing});warn.hidden=!ctx.warnings.length;warn.textContent=[...new Set(ctx.warnings)].join(' ');if(editing)bindDrag();};
  const refreshImages=async()=>{ctx=await buildCtx(c,firm,spec);draw();};
  body.querySelectorAll('[data-fk-pv]').forEach(b=>b.onclick=()=>{pv=b.dataset.fkPv;body.querySelectorAll('[data-fk-pv]').forEach(x=>x.classList.toggle('active',x===b));draw();});
  body.querySelector('[data-fk-guides]')?.addEventListener('change',e=>{spec.guides=e.target.checked;draw();});
  let form=null;
  function bindDrag(){const svg=prev.querySelector('svg');svg.querySelectorAll('.fk-drag').forEach(n=>n.addEventListener('pointerdown',ev=>{ev.preventDefault();const k=+n.dataset.el,e=spec.elements[k];const pt=p=>{const sv=prev.querySelector('svg')||svg;const m=sv.getScreenCTM().inverse();const q=sv.createSVGPoint();q.x=p.clientX;q.y=p.clientY;return q.matrixTransform(m);};const p0=pt(ev),x0=+e.x,y0=+e.y;
    const mv=m=>{const p=pt(m);const FF=FORMATS[spec.format];e.x=Math.max(0,Math.min(FF.w-0.1,Math.round((x0+p.x-p0.x)*20)/20));e.y=Math.max(0,Math.min(FF.h-0.1,Math.round((y0+p.y-p0.y)*20)/20));draw();syncEl(k);};const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);}));}
  function syncEl(k){const row=form?.querySelector(`.fk-el[data-k="${k}"]`);if(!row)return;row.querySelector('[data-f="x"]').value=spec.elements[k].x;row.querySelector('[data-f="y"]').value=spec.elements[k].y;}
  if(!editing){draw();return;}
  form=body.querySelector('.fk-form');
  const sel=(id,opts,v)=>`<select id="${id}">${opts.map(([k,l])=>`<option value="${esc(k)}" ${String(k)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const inch=(id,label,v)=>`<label class="fk-num"><span>${label}</span><input id="${id}" type="number" step="0.05" min="0" max="6" value="${v}" inputmode="decimal"></label>`;
  const fontOpts=FONTS.map(f=>[f[0],f[0]]);
  const elRow=(e,k)=>`<div class="fk-el" data-k="${k}"><div class="fk-row-head"><b>${({text:'Text',image:'Graphic / image',rect:'Box',line:'Line'})[e.type]} ${k+1}</b><button type="button" class="du-btn ghost" data-el-rm="${k}">Remove</button></div>
   ${e.type==='text'?`<label class="fk-wide"><span>Text (tokens: {firm} {project} {date} {title} {page})</span><input data-f="text" value="${esc(e.text||'')}"></label>`:''}
   ${e.type==='image'?`<label class="fk-wide fk-file-inline"><span>Image</span><input data-f="file" type="file" accept="image/png,image/jpeg,image/webp"></label>`:''}
   <div class="fk-grid4"><label class="fk-num"><span>X in.</span><input data-f="x" type="number" step="0.05" value="${e.x}"></label><label class="fk-num"><span>Y in.</span><input data-f="y" type="number" step="0.05" value="${e.y}"></label><label class="fk-num"><span>W in.</span><input data-f="w" type="number" step="0.05" value="${e.w}"></label>${e.type==='line'?`<label class="fk-num"><span>Weight pt</span><input data-f="wpt" type="number" step="0.25" value="${e.wpt||1.5}"></label>`:`<label class="fk-num"><span>H in.</span><input data-f="h" type="number" step="0.05" value="${e.h}"></label>`}</div>
   <div class="fk-grid4">${e.type==='text'?`<label class="fk-num"><span>Size pt</span><input data-f="size" type="number" step="1" value="${e.size||14}"></label><label class="fk-num"><span>Bold</span><input data-f="bold" type="checkbox" ${e.bold?'checked':''}></label>`:''}${e.type!=='image'?`<label class="fk-num"><span>Color</span><input data-f="${e.type==='rect'?'fill':'color'}" type="color" value="${esc(e.type==='rect'?(e.fill||spec.colors.accent):(e.color||spec.colors.text))}"></label>`:''}<label class="fk-num"><span>Show on</span><select data-f="on">${[['all','All slides'],['title','Title slide'],['content','Content slides']].map(([k2,l])=>`<option value="${k2}" ${(e.on||'all')===k2?'selected':''}>${l}</option>`).join('')}</select></label></div></div>`;
  const logoRow=(g,k)=>`<div class="fk-logo-row" data-k="${k}"><span class="fk-logo-name">Logo ${k+1}</span>${sel('fk-lg-pos-'+k,Object.entries(POS),g.pos||'br')}<label class="fk-num"><span>Height in.</span><input id="fk-lg-h-${k}" type="number" step="0.05" min="0.15" max="3" value="${g.h||0.4}"></label><button type="button" class="du-btn ghost" data-lg-rm="${k}">Remove</button></div>`;
  const F=()=>`<details open><summary>Template</summary><label class="fk-wide"><span>Template name</span><input id="fk-name" value="${esc(name)}" maxlength="120"></label><label class="fk-wide"><span>Slide or page size</span>${sel('fk-format',Object.entries(FORMATS).map(([k,f])=>[k,f.label]),spec.format)}</label><label class="fk-check"><input type="checkbox" id="fk-def" ${isDef?'checked':''}> Firm default template</label></details>
  <details open><summary>Margins and safe area</summary><div class="fk-grid4">${inch('fk-mt','Top',spec.margins.t)}${inch('fk-mr','Right',spec.margins.r)}${inch('fk-mb','Bottom',spec.margins.b)}${inch('fk-ml','Left',spec.margins.l)}</div><div class="fk-grid4">${inch('fk-safe','Safe area inset',spec.safe)}</div></details>
  <details open><summary>Colors and fonts</summary><div class="fk-grid4"><label class="fk-num"><span>Primary</span><input type="color" id="fk-c-primary" value="${spec.colors.primary}"></label><label class="fk-num"><span>Accent</span><input type="color" id="fk-c-accent" value="${spec.colors.accent}"></label><label class="fk-num"><span>Text</span><input type="color" id="fk-c-text" value="${spec.colors.text}"></label><label class="fk-num"><span>Background</span><input type="color" id="fk-c-bg" value="${spec.colors.bg}"></label></div>
   <div class="fk-two"><label class="fk-wide"><span>Heading font</span>${sel('fk-f-heading',fontOpts,spec.fonts.heading)}</label><label class="fk-wide"><span>Body font</span>${sel('fk-f-body',fontOpts,spec.fonts.body)}</label></div>
   <div class="fk-grid4"><label class="fk-num"><span>Title pt</span><input id="fk-s-title" type="number" min="18" max="96" value="${spec.sizes.title}"></label><label class="fk-num"><span>Heading pt</span><input id="fk-s-heading" type="number" min="14" max="72" value="${spec.sizes.heading}"></label><label class="fk-num"><span>Body pt</span><input id="fk-s-body" type="number" min="8" max="40" value="${spec.sizes.body}"></label><label class="fk-num"><span>Footer pt</span><input id="fk-s-small" type="number" min="6" max="18" value="${spec.sizes.small}"></label></div>
   <p class="fk-note">PowerPoint uses these font names (the viewer's computer needs the font). PDF uses the closest built-in font: Helvetica, Times or Courier.</p></details>
  <details open><summary>Logos</summary><div class="fk-two"><label class="fk-wide"><span>Firm logo</span>${sel('fk-logo-src',[['firm','Logo from the firm profile'+(firm.logo_url?'':' (none set)')],['upload','Uploaded logo'],['none','No logo']],spec.logo.src)}</label><label class="fk-wide"><span>Position</span>${sel('fk-logo-pos',Object.entries(POS),spec.logo.pos)}</label></div>
   <div class="fk-grid4"><label class="fk-num"><span>Height in.</span><input id="fk-logo-h" type="number" step="0.05" min="0.2" max="3" value="${spec.logo.h}"></label></div>
   <label class="fk-wide fk-file-inline"><span>Upload firm logo (PNG, JPG or WebP)</span><input type="file" id="fk-logo-file" accept="image/png,image/jpeg,image/webp"></label>
   <span class="fk-sublabel">Other logos (partners, clients, consultants)</span><div class="fk-logos">${(spec.logos||[]).map(logoRow).join('')||'<p class="fk-note">None yet.</p>'}</div><label class="fk-wide fk-file-inline"><span>Add logos</span><input type="file" id="fk-logos-file" accept="image/png,image/jpeg,image/webp" multiple></label></details>
  <details open><summary>Header, footer and page numbers</summary><label class="fk-check"><input type="checkbox" id="fk-h-on" ${spec.header.on?'checked':''}> Header</label><label class="fk-wide"><span>Header text</span><input id="fk-h-text" value="${esc(spec.header.text)}"></label>
   <label class="fk-check"><input type="checkbox" id="fk-f-on" ${spec.footer.on?'checked':''}> Footer</label><label class="fk-wide"><span>Footer text</span><input id="fk-f-text" value="${esc(spec.footer.text)}"></label>
   <label class="fk-check"><input type="checkbox" id="fk-f-num" ${spec.footer.pageNum?'checked':''}> Page numbers</label><label class="fk-wide"><span>Page number format</span>${sel('fk-f-fmt',[['{page}','3'],['{page} / {pages}','3 / 12'],['Page {page} of {pages}','Page 3 of 12']],spec.footer.numFmt)}</label>
   <label class="fk-check"><input type="checkbox" id="fk-rules" ${spec.footer.rule?'checked':''}> Accent rule lines</label><p class="fk-note">Tokens: {firm} {project} {date} {title} {page} {pages}</p></details>
  <details open><summary>Text and graphic placeholders</summary><div class="fk-btns"><button type="button" class="du-btn ghost" data-add="text">Add text</button><button type="button" class="du-btn ghost" data-add="image">Add graphic</button><button type="button" class="du-btn ghost" data-add="rect">Add box</button><button type="button" class="du-btn ghost" data-add="line">Add line</button></div><div class="fk-els">${spec.elements.map(elRow).join('')}</div></details>
  <details open><summary>Start from an uploaded template</summary><p class="fk-note">Upload a PDF or PowerPoint template. A PDF page becomes the background (kept as vector art in PDF exports). From a PowerPoint, pick one of its images as the background. PowerPoint masters and layouts are not copied, so check the result.</p>
   <label class="fk-wide fk-file-inline"><span>PDF or PowerPoint template</span><input type="file" id="fk-tpl-file" accept=".pdf,.pptx,application/pdf,${PPTX_MIME}"></label>
   <div class="fk-bg-now">${spec.background.type==='pdf'?`Background: page ${spec.background.page||1} of ${esc(spec.background.name||'uploaded PDF')} ${`<label class="fk-num fk-inl"><span>Page</span><input id="fk-bg-page" type="number" min="1" value="${spec.background.page||1}"></label>`}`:spec.background.type==='image'?`Background: image from ${esc(spec.background.name||'upload')}`:'Background: plain color'}${spec.background.type!=='color'?` <button type="button" class="du-btn ghost" data-bg-clear>Remove background</button>`:''}</div><div class="fk-media"></div>
   <label class="fk-wide fk-file-inline"><span>Or upload a background image</span><input type="file" id="fk-bg-img" accept="image/png,image/jpeg,image/webp"></label></details>
  <div class="fk-savebar"><button type="button" class="du-btn primary" data-fk-save>Save template</button>${cur?`<button type="button" class="du-btn ghost" data-fk-delt>Delete template</button>`:''}<span class="fk-st" role="status"></span></div>`;
  let rebuilding=false;const rebuild=()=>{rebuilding=true;try{if(form.contains(document.activeElement))document.activeElement.blur();}catch(_e){}const open=[...form.querySelectorAll('details')].map(d=>d.open);form.innerHTML=F();form.querySelectorAll('details').forEach((d,i)=>{if(open[i]===false)d.open=false;});rebuilding=false;bindForm();};
  const st=()=>form.querySelector('.fk-savebar .fk-st');
  const upAsset=async(file,kind)=>{st().textContent='Uploading '+file.name+'…';const row=await uploadKit(c,firm,file,kind||'asset');st().textContent='';return row;};
  function readForm(){const v=id=>form.querySelector('#'+id);name=v('fk-name').value;spec.format=v('fk-format').value;isDef=v('fk-def').checked;
    spec.margins={t:num(v('fk-mt').value,0.5,0,6),r:num(v('fk-mr').value,0.5,0,6),b:num(v('fk-mb').value,0.5,0,6),l:num(v('fk-ml').value,0.5,0,6)};spec.safe=num(v('fk-safe').value,0.25,0,3);
    ['primary','accent','text','bg'].forEach(k=>spec.colors[k]=v('fk-c-'+k).value);spec.fonts={heading:v('fk-f-heading').value,body:v('fk-f-body').value};
    ['title','heading','body','small'].forEach(k=>spec.sizes[k]=num(v('fk-s-'+k).value,spec.sizes[k],6,120));
    spec.logo.src=v('fk-logo-src').value;spec.logo.pos=v('fk-logo-pos').value;spec.logo.h=num(v('fk-logo-h').value,0.5,0.2,3);
    (spec.logos||[]).forEach((g,k)=>{g.pos=v('fk-lg-pos-'+k).value;g.h=num(v('fk-lg-h-'+k).value,0.4,0.15,3);});
    spec.header={on:v('fk-h-on').checked,text:v('fk-h-text').value.slice(0,160),rule:v('fk-rules').checked};
    spec.footer={on:v('fk-f-on').checked,text:v('fk-f-text').value.slice(0,160),pageNum:v('fk-f-num').checked,numFmt:v('fk-f-fmt').value,rule:v('fk-rules').checked};
    form.querySelectorAll('.fk-el').forEach(row=>{const e=spec.elements[+row.dataset.k];row.querySelectorAll('[data-f]').forEach(inp=>{const f=inp.dataset.f;if(f==='file')return;e[f]=inp.type==='checkbox'?inp.checked:inp.type==='number'?num(inp.value,e[f]||0,-50,200):inp.value.slice(0,300);});});
    const pg=v('fk-bg-page');if(pg&&spec.background.type==='pdf')spec.background.page=Math.max(1,parseInt(pg.value,10)||1);}
  function bindForm(){
    form.oninput=e=>{if(rebuilding||e.target.type==='file')return;readForm();draw();};
    form.onchange=async e=>{if(rebuilding)return;const t=e.target;if(t.type!=='file'){readForm();if(t.id==='fk-bg-page'||t.id==='fk-logo-src')await refreshImages();else draw();return;}
      const files=[...t.files];t.value='';if(!files.length)return;
      try{if(t.id==='fk-logo-file'){const row=await upAsset(files[0]);spec.logo={...spec.logo,src:'upload',path:row.storage_path};rebuild();await refreshImages();}
        else if(t.id==='fk-logos-file'){for(const f of files.slice(0,8)){const row=await upAsset(f);spec.logos.push({path:row.storage_path,pos:'br',h:0.4});}rebuild();await refreshImages();}
        else if(t.dataset.f==='file'){const k=+t.closest('.fk-el').dataset.k;const row=await upAsset(files[0]);spec.elements[k].path=row.storage_path;await refreshImages();}
        else if(t.id==='fk-bg-img'){const row=await upAsset(files[0]);spec.background={type:'image',path:row.storage_path,name:files[0].name};bgFileId=row.id;rebuild();await refreshImages();}
        else if(t.id==='fk-tpl-file'){const f=files[0];if(!isPdf(f)&&!isPptx(f))throw new Error('Upload a PDF or a PowerPoint (.pptx) file.');st().textContent='Reading '+f.name+'…';const bytes=new Uint8Array(await f.arrayBuffer());
          if(isPdf(f)){const info=await readPdfInfo(bytes);const row=await upAsset(f,'template');await c.client.from('firm_kit_files').update({page_count:info.pages}).eq('id',row.id);const fmt=closestFormat(info.w,info.h);if(fmt)spec.format=fmt;spec.background={type:'pdf',path:row.storage_path,page:1,name:f.name};bgFileId=row.id;rebuild();await refreshImages();c.toast('PDF template set as the background'+(fmt?' and the page size matched.':'.'));}
          else{const px=await readPptx(bytes);const row=await upAsset(f,'template');await c.client.from('firm_kit_files').update({page_count:px.titles.length,slide_titles:px.titles.slice(0,200)}).eq('id',row.id);const fmt=closestFormat(px.w,px.h);if(fmt){spec.format=fmt;}bgFileId=row.id;rebuild();
            const mbox=form.querySelector('.fk-media');const thumbs=[];for(const n of px.media.slice(0,24)){const blob=await px.zip.file(n).async('blob');const typed=new Blob([blob],{type:/png$/i.test(n)?'image/png':'image/jpeg'});thumbs.push({n,typed,url:URL.createObjectURL(typed)});}
            mbox.innerHTML=`<p class="fk-note">${px.titles.length} slide${px.titles.length===1?'':'s'} found${fmt?', page size matched':''}. ${thumbs.length?'Pick an image from the PowerPoint to use as the background:':'No PNG or JPG images were found in it to use as a background.'}</p><div class="fk-thumbs">${thumbs.map((t2,i)=>`<button type="button" data-media="${i}"><img src="${t2.url}" alt="Image ${i+1} from the PowerPoint"></button>`).join('')}</div>`;
            mbox.querySelectorAll('[data-media]').forEach(b=>b.onclick=async()=>{try{const t2=thumbs[+b.dataset.media];const file=new File([t2.typed],f.name.replace(/\.pptx$/i,'')+'-'+t2.n.split('/').pop(),{type:t2.typed.type});const r2=await upAsset(file);spec.background={type:'image',path:r2.storage_path,name:f.name};rebuild();await refreshImages();}catch(err){c.toast(err.message||String(err),true);}});
            draw();}}}
      catch(err){st().textContent='Not uploaded: '+(err.message||err);}};
    form.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{readForm();const F2=FORMATS[spec.format];const t=b.dataset.add;const nEl=spec.elements.length;const base={type:t,x:Math.min(F2.w-2,spec.margins.l+spec.safe+nEl*0.4),y:Math.min(F2.h-1,F2.h/2+nEl*0.4),w:t==='line'?3:t==='text'?4:1.5,h:t==='line'?0:t==='text'?0.5:1,on:'all'};if(t==='text'){base.text='{project}';base.size=14;}spec.elements.push(base);rebuild();draw();});
    form.querySelectorAll('[data-el-rm]').forEach(b=>b.onclick=()=>{readForm();spec.elements.splice(+b.dataset.elRm,1);rebuild();draw();});
    form.querySelectorAll('[data-lg-rm]').forEach(b=>b.onclick=()=>{readForm();spec.logos.splice(+b.dataset.lgRm,1);rebuild();refreshImages();});
    form.querySelector('[data-bg-clear]')?.addEventListener('click',()=>{readForm();spec.background={type:'color'};bgFileId=null;rebuild();refreshImages();});
    form.querySelector('[data-fk-save]').onclick=async()=>{readForm();const s=st();s.textContent='Saving…';
      try{if(!name.trim())throw new Error('Give the template a name.');const row={firm_id:firm.id,name:name.trim().slice(0,120),spec,background_file_id:spec.background.type==='color'?null:bgFileId,is_default:isDef,updated_at:new Date().toISOString(),updated_by:c.user.id};
        if(isDef){const u=await c.client.from('firm_presentation_templates').update({is_default:false}).eq('firm_id',firm.id).eq('is_default',true);if(u.error)throw u.error;}
        const q=cur?await c.client.from('firm_presentation_templates').update(row).eq('id',cur.id).select('id'):await c.client.from('firm_presentation_templates').insert({...row,created_by:c.user.id}).select('id');
        if(q.error)throw q.error;if(!q.data?.length)throw new Error('The database did not confirm the save.');c.toast('Template saved.');renderPresent(body,c,firm,admin,q.data[0].id);}catch(e){s.textContent='Not saved: '+(e.message||e);}};
    form.querySelector('[data-fk-delt]')?.addEventListener('click',async()=>{if(!confirm('Delete the template “'+cur.name+'”?'))return;const d=await c.client.from('firm_presentation_templates').delete().eq('id',cur.id).select('id');if(d.error||!d.data?.length){c.toast(d.error?.message||'Not deleted.',true);return;}c.toast('Template deleted.');renderPresent(body,c,firm,admin);});
  }
  form.innerHTML=F();bindForm();draw();
}
function makeDeck(c,firm,spec0,tplName){
  const spec=JSON.parse(JSON.stringify(spec0));document.getElementById('fk-modal')?.remove();
  const today=new Date().toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
  document.body.insertAdjacentHTML('beforeend',`<div id="fk-modal" class="fk-modal" role="dialog" aria-modal="true" aria-label="Make a presentation"><div class="fk-modal-card"><button type="button" class="fk-x" aria-label="Close">×</button><span class="du-kicker">GM PRESENTATION · ${esc(tplName||'Template')}</span><h2>Make a presentation</h2>
  <div class="fk-two"><label class="fk-wide"><span>Presentation title</span><input id="fkm-title" value="Project kickoff meeting"></label><label class="fk-wide"><span>Project or subtitle</span><input id="fkm-project" value="Project name"></label></div>
  <label class="fk-wide"><span>Date</span><input id="fkm-date" value="${esc(today)}"></label>
  <label class="fk-wide"><span>Slides: first line is the slide title, the next lines are bullet points. Leave a blank line between slides.</span><textarea id="fkm-slides" rows="8">Agenda\nIntroductions\nProject goals\nSchedule\n\nSchedule and next steps\nDesign development review\nConsultant coordination\nOwner sign-off</textarea></label>
  <div class="fk-thumbstrip"></div><p class="fk-warn" hidden></p>
  <div class="fk-savebar"><button type="button" class="du-btn primary" data-fkm="pptx">Download PowerPoint (.pptx)</button><button type="button" class="du-btn ghost" data-fkm="pdf">Download PDF</button><span class="fk-st" role="status"></span></div></div></div>`);
  const m=document.getElementById('fk-modal');const v=id=>m.querySelector('#'+id).value;let ctx=null;
  m.querySelector('.fk-x').onclick=()=>m.remove();m.onclick=e=>{if(e.target===m)m.remove();};
  const deck=()=>deckFromText(v('fkm-title'),v('fkm-slides'));
  const base=()=>({firm:firm.name,project:v('fkm-project'),date:v('fkm-date'),title:v('fkm-title')});
  const thumbs=()=>{if(!ctx)return;Object.assign(ctx,base());const d=deck();m.querySelector('.fk-thumbstrip').innerHTML=d.map((s,i)=>`<figure>${svgSlide(spec,ctx,{...s,subtitle:ctx.project},i,d.length,{})}<figcaption>${i+1}</figcaption></figure>`).join('');const w=m.querySelector('.fk-warn');w.hidden=!ctx.warnings.length;w.textContent=[...new Set(ctx.warnings)].join(' ');};
  m.oninput=thumbs;
  buildCtx(c,firm,spec,base()).then(x=>{ctx=x;thumbs();});
  m.querySelectorAll('[data-fkm]').forEach(b=>b.onclick=async()=>{const st=m.querySelector('.fk-st');const kind=b.dataset.fkm;st.textContent='Building '+(kind==='pdf'?'PDF':'PowerPoint')+'…';
    try{if(!ctx)ctx=await buildCtx(c,firm,spec,base());Object.assign(ctx,base());const d=deck().map(s=>s.kind==='title'?{...s,subtitle:ctx.project}:s);
      const bytes=kind==='pdf'?await exportPdf(spec,ctx,d):await exportPptx(spec,ctx,d);
      download(bytes,slug(ctx.title)+(kind==='pdf'?'.pdf':'.pptx'),kind==='pdf'?'application/pdf':PPTX_MIME);st.textContent=(kind==='pdf'?'PDF':'PowerPoint')+' ready: '+d.length+' slides.';}
    catch(e){st.textContent='Could not build it: '+(e.message||e);}});
}

/* =========================================================== mount points */
async function firmRow(c,firm){const r=await c.client.from('firms').select('id,name,slug,logo_url').eq('id',firm.id).maybeSingle();return {...firm,...(r.data||{})};}
async function mount(body,c,firm,pane,opts){const f=await firmRow(c,firm);const admin=!!opts?.admin;
  if(pane==='playbook')return renderPlaybook(body,c,f,admin);if(pane==='present')return renderPresent(body,c,f,admin);}
async function memberSection(w,c,mine){const firms=(mine||[]).filter(x=>x&&x.id);if(!firms.length)return;
  const host=document.createElement('section');host.className='fk-member';
  host.innerHTML=`<div class="du-section-title"><div><span class="du-kicker">FIRM KIT</span><h2>${firms.length>1?`<select id="fk-mfirm" aria-label="Firm">${firms.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join('')}</select>`:esc(firms[0].name)}</h2></div></div><div class="du-subtabs fk-msub">${PANES.map(([k,l],i)=>`<button type="button" data-fk-mpane="${k}" class="${i?'':'active'}">${l}</button>`).join('')}</div><div class="fk-mbody"></div>`;
  w.appendChild(host);let pane='playbook';
  const go=async()=>{const id=host.querySelector('#fk-mfirm')?.value||firms[0].id;const firm=firms.find(f=>f.id===id);const b=host.querySelector('.fk-mbody');const admin=firm.role==='admin';try{await mount(b,c,firm,pane,{admin});}catch(e){b.innerHTML=`<article class="du-glass"><p>${esc(e.message||e)}</p></article>`;}};
  host.querySelectorAll('[data-fk-mpane]').forEach(b=>b.onclick=()=>{pane=b.dataset.fkMpane;host.querySelectorAll('[data-fk-mpane]').forEach(x=>x.classList.toggle('active',x===b));go();});
  host.querySelector('#fk-mfirm')?.addEventListener('change',go);await go();}
window.DrawUpFirmKit={panes:PANES,owns:p=>PANES.some(x=>x[0]===p),mount,memberSection,defaults:DEFAULT_SECTIONS,_layout:layoutSlide,_newSpec:newSpec};
})();
