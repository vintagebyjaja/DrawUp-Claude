/* DrawUp v21 Detail Library: catalog of individual typical details.
   Each entry is ONE detail with its own drawing (no sheets). Generic, code-aware
   learning content drawn by DrawUp. It is not authored by, or attributed to, any firm.
   Dimensions marked MIN./MAX. reflect common US model-code / 2010 ADA Standards values;
   every detail must be adapted and verified by a licensed professional for the project. */
(function(){
'use strict';
const SC={'3':['3" = 1\'-0"',25],'112':['1 1/2" = 1\'-0"',12.5],'1':['1" = 1\'-0"',25/3],'34':['3/4" = 1\'-0"',6.25],'12':['1/2" = 1\'-0"',25/6],'38':['3/8" = 1\'-0"',3.125]};
/* helpers shared by several details */
const siding=(a,x,y0,y1)=>{for(let y=y0;y<y1-1;y+=6.75)a.poly([[x-.15,Math.min(y+7.25,y1)],[x-.15,y],[x-.95,y]],'white','l');};
const deck=(a,x0,x1,y,h=1.5,p=6)=>{const pts=[];for(let x=x0;x<x1;x+=p)pts.push([x,y+h],[x+1.5,y+h],[x+2.25,y],[x+4.5,y],[x+5.25,y+h]);pts.push([x1,y+h]);a.pl(pts.filter(q=>q[0]<=x1),'m');};
const cstud=(a,x,y,d,f,flip)=>{const s=flip?-1:1;a.pl([[x+s*f,y],[x,y],[x,y+d],[x+s*f,y+d]],'h');};
const D=[];
const add=(o)=>{o.scale=SC[o.sc][0];D.push(o);};

/* ------------------------------------------------------------ WALL SECTIONS */
add({id:'ws-wood-frame',code:'WS-01',cat:'Wall Sections',title:'Exterior Wall Section - Wood Frame on Stem Wall',mat:'Wood',asm:'Wall section',sc:'12',views:'BROKEN SECTION',
kw:'wall section wood frame stud siding stem wall footing slab truss heel eave typical exterior',
draw(K){const k=SC['12'][1],L=K(k,150,390),U=K(k,150,572);
  L.rect(-22,-32,82,32,'earth','x');L.rect(-4,-30,16,8,'conc');L.rect(0,-22,8,30,'conc');[-1.5,4,9.5].forEach(x=>L.dot(x,-26.5,.5));L.ln(4,-27,4,5,'l','hid');
  L.rect(8,0,52,4,'grav');L.ln(8,4,60,4,'m','vr');L.rect(8,4,52,4,'conc');L.ln(-22,-1,0,0,'h');L.ln(-.2,-22,-.2,0,'h','wrb');
  L.ln(3.25,-12,3.25,10.4,'m');L.pl([[3.25,-12],[5,-12]],'m');L.rect(.5,8,5.5,.3,'seal','x');L.blk(.5,8.3,5.5,1.5);L.rect(2.2,9.8,2.1,.5,'steel','x');
  L.batt(.5,9.8,5.5,22.2);L.rect(0,7,.5,25,'ply','l');siding(L,0,8.5,32);L.ln(-.06,7,-.06,32,'l','wrb');L.rect(6,10,.625,22,'gyp','l');L.rect(6.625,8,.6,3.5,'wood','l');
  L.brk(-3,32,9,32);L.brk(60,0,60,8);L.dim(-1,0,-1,8.5,'8" MIN.',-12);
  U.brk(-3,80,9,80);U.batt(.5,80,5.5,14.5);U.blk(.5,94.5,5.5,1.5);U.blk(.5,96,5.5,1.5);U.rect(0,80,.5,26,'ply','l');siding(U,0,80.5,95.5);U.ln(-.06,80,-.06,105,'l','wrb');
  U.rect(6,80,.625,16.9,'gyp','l');U.rect(6.625,96.9,33.4,.6,'gyp','l');U.blk1(0,97.5,40,3.5);U.blk(.5,101,5.5,5);
  const tc=x=>106+.5*x;U.poly([[-18,tc(-18)],[40,tc(40)],[40,tc(40)+3.9],[-18,tc(-18)+3.9]],'white','m');
  U.poly([[-19.5,tc(-19.5)+3.9],[40,tc(40)+3.9],[40,tc(40)+4.5],[-19.5,tc(-19.5)+4.5]],'ply','l');U.pl([[-20.3,tc(-20.3)+4.7],[40,tc(40)+4.95]],'h');
  U.blk1(-19.5,92.5,1.5,8.6);U.rect(-18,95.4,17.05,.6,'ply','l');U.batt(7,101,33,8.5,'h');U.ln(1,104.5,40,124,'m');
  U.pl([[-19.5,99],[-20.4,99],[-20.4,93],[-25.5,93],[-26.6,99.6]],'m');U.brk(40,96,40,130);
  U.note(5,tc(5)+4.6,'Asphalt shingles on underlayment on wood roof sheathing').note(20,114,'Pre-engineered wood trusses @ 24" o.c., uplift ties per structural').note(14,106,'Ceiling insulation per energy code, keep baffle clear')
   .note(-8,96,'Vented soffit + ventilation baffle').note(-23,95,'Gutter + drip edge on fascia').note(3,96.5,'Double top plate').note(28,97.2,'5/8" gyp. bd. ceiling');
  L.note(-.6,24,'Lap siding over water-resistive barrier, WRB lapped shingle-fashion').note(.25,18,'Wood structural panel sheathing').note(3,22,'2x6 studs @ 16" o.c. with batt insulation per energy code').note(6.3,14,'5/8" gyp. bd., vapor retarder per climate zone')
   .note(3,9,'PT sill plate on sill gasket').note(3.25,-5,'Anchor bolt, size + spacing per structural').note(30,6,'4" conc. slab on vapor retarder on 4" gravel').note(4,-12,'Conc. stem wall').note(2,-27,'Conc. footing, rebar per structural, bear below frost depth').note(-12,-.6,'Slope grade away from wall');}});

/* ------------------------------------------------------------ EXTERIOR WALLS */
add({id:'ew-wood-base',code:'EW-01',cat:'Exterior Walls',title:'Wood Wall Base at Thickened Slab Edge',mat:'Wood',asm:'Wall base',sc:'112',
kw:'exterior wall base sill plate slab edge thickened siding clearance grade termite anchor bolt',
draw(K){const k=SC['112'][1],a=K(k,145,224);
  a.rect(-10,-24,40,20,'earth','x');a.poly([[-10,-4.6],[0,-4],[0,-24],[-10,-24]],'earth','x');a.poly([[30,0],[20,0],[16,-4],[30,-4]],'grav');a.poly([[0,4],[30,4],[30,0],[20,0],[12,-8],[0,-8]],'conc');
  a.ln(30,0,20,0,'m','vr');a.dot(3,-5,.3125);a.dot(8,-5,.3125);a.ln(-10,-4.6,0,-4,'h');
  a.ln(3.25,-3,3.25,6.5,'m');a.rect(2.25,5.75,2,.2,'steel','x');a.rect(2.6,5.95,1.3,.5,'steel','x');
  a.rect(.5,4,5.5,.25,'seal','x');a.blk(.5,4.25,5.5,1.5);a.batt(.5,5.75,5.5,10.25);a.rect(0,2,.5,14,'ply','l');a.ln(-.06,2,-.06,16,'l','wrb');siding(a,0,4.5,16);
  a.rect(6,6,.625,10,'gyp','l');a.rect(6.625,4,.6,4,'wood','l');a.ln(6.6,4.05,30,4.05,'l');
  a.brk(-2,16,8,16);a.brk(30,-4.5,30,4.5);a.dim(-1,-4,-1,4.5,'8" MIN.',-6);
  a.note(-.7,12,'Siding over WRB, start siding 8" min. above grade (verify code + termite rules)').note(.25,9,'Sheathing laps 2" past sill onto slab edge').note(3,11,'2x6 studs @ 16" o.c., batt insulation').note(3,5,'PT sill plate on sill gasket (air seal)')
   .note(3.25,1,'Anchor bolt + plate washer, embed + spacing per structural').note(15,1.5,'Conc. slab on vapor retarder').note(6,-6,'Thickened slab edge, size + reinforcing per structural').note(-6,-4.3,'Slope finish grade away from wall').note(6.3,13,'Gyp. bd. + base');}});

add({id:'ew-cmu-control-joint',code:'EW-02',cat:'Exterior Walls',title:'CMU Control Joint - Plan',mat:'Masonry',asm:'Movement joint',sc:'3',views:'PLAN',
kw:'cmu control joint masonry movement joint sealant backer rod sash block shear key plan',
draw(K){const k=SC['3'][1],a=K(k,270,360);
  const unit=(x0,x1,end)=>{a.rect(x0,0,x1-x0,1.25,'cmu','m');a.rect(x0,6.375,x1-x0,1.25,'cmu','m');a.rect(end<0?x1-1:x0,1.25,1,5.125,'cmu','m');};
  unit(-10,-.1875,-1);unit(.1875,10,1);a.ln(-10,0,-10,7.625,'l');a.brk(-10,-1,-10,8.6);a.brk(10,-1,10,8.6);
  a.poly([[-.6,3.3],[.6,3.3],[.6,3.6],[.25,3.6],[.25,4.0],[.6,4.0],[.6,4.3],[-.6,4.3],[-.6,4.0],[-.25,4.0],[-.25,3.6],[-.6,3.6]],'seal','l');
  a.rect(-.1875,0,.375,.375,'seal','x');a.circ(0,.6,.22,'white','l');a.rect(-.1875,7.25,.375,.375,'seal','x');a.circ(0,7.02,.22,'white','l');
  a.ln(-9,3.81,-.8,3.81,'l','hid');a.ln(.8,3.81,9,3.81,'l','hid');a.txt(-5,-1.6,'EXTERIOR',9,'middle',700);a.txt(-5,9,'INTERIOR',9,'middle',700);
  a.dim(-.1875,7.625,.1875,7.625,'3/8"',1.2);
  a.note(-5,.6,'8" CMU, face shell').note(0,.2,'Sealant on backer rod, both faces').note(0,3.95,'Preformed rubber shear key in sash-block grooves').note(-4,3.81,'Joint reinforcement: stop at joint (do not run through)').note(5,7,'Locate + space control joints per structural').note(6,4,'Bond beam reinforcing at joint per structural');}});

/* ------------------------------------------------------------ ROOFS */
add({id:'rf-parapet',code:'RF-01',cat:'Roofs',title:'Parapet with Metal Coping at Low-Slope Roof',mat:'Masonry / Membrane',asm:'Roof edge',sc:'1',
kw:'parapet coping low slope roof membrane cant blocking flashing tpo epdm modified bitumen cmu',
draw(K){const k=SC['1'][1],a=K(k,87,380);
  a.rect(0,-12,7.625,42,'cmu','m');a.ln(3.8,-12,3.8,29,'l','hid');a.rect(-2,-12,2,40,'rigid','l');a.rect(-2.6,-12,.6,40,'alum','l');a.ln(-.08,-12,-.08,30,'l','wrb');
  deck(a,7.625,44,0);a.rect(7.625,1.5,36.4,2.5,'rigid','l');a.poly([[7.625,4],[44,4],[44,7],[7.625,5.6]],'rigid','l');a.poly([[7.625,5.6],[44,7],[44,7.5],[7.625,6.1]],'gyp','l');
  a.poly([[7.7,6.15],[11.5,6.3],[7.7,10]],'rigid','l');a.pl([[44,7.6],[11.6,6.35],[7.75,10.1],[7.75,33]],'h');
  a.blk(0,30,7.625,1.5);a.poly([[-2.6,31.5],[8.4,31.5],[8.4,33],[-2.6,33.8]],'white','m');a.ln(-2.6,31.5,8.4,33,'x');a.pl([[-2.5,33.95],[8.5,33.15]],'l','wrb');
  a.pl([[-4.1,27.2],[-3.1,28],[-3.1,34.1],[9,33.25],[9,29],[9.7,28.3]],'h');a.pl([[-3.1,28.6],[-2.75,28.6],[-2.75,30]],'m');
  a.brk(-3,-12,9,-12);a.brk(44,-.5,44,8.5);
  a.note(3,34,'Prefinished metal coping, slope to roof side, continuous cleat + drips').note(1,33.85,'Self-adhered underlayment under coping').note(4,32.2,'PT wood blocking, anchor per wind design').note(7.75,22,'Membrane base flashing up + over parapet under coping')
   .note(9,7.5,'Cant / transition').note(25,7.2,'Cover board').note(30,4.5,'Tapered rigid insulation, slope 1/4" per ft min.').note(20,1,'Steel roof deck on structure').note(5,10,'CMU parapet, grout + reinforce per structural').note(-1,16,'Continuous exterior insulation').note(-2.3,6,'Metal wall panel system').note(-.1,-6,'Air barrier: make continuous with roof membrane');}});

add({id:'rf-eave-gutter',code:'RF-02',cat:'Roofs',title:'Eave + Gutter at Asphalt Shingle Roof',mat:'Wood / Asphalt',asm:'Roof eave',sc:'112',
kw:'eave gutter fascia soffit drip edge ice barrier shingle roof truss heel ventilation baffle',
draw(K){const k=SC['112'][1],a=K(k,345,1600);const tc=x=>104+.5*x;
  a.batt(.5,88,5.5,6.5);a.blk(.5,94.5,5.5,1.5);a.blk(.5,96,5.5,1.5);a.rect(0,88,.5,16,'ply','l');siding(a,0,88.5,95.4);a.rect(6,88,.625,8.9,'gyp','l');a.rect(6.625,96.9,7.4,.6,'gyp','l');
  a.blk1(0,97.5,14,3.5);a.blk(.5,101,5.5,3);a.poly([[-17,tc(-17)],[14,tc(14)],[14,tc(14)+5.6],[-17,tc(-17)+5.6]],'white','m');
  a.poly([[-18.5,tc(-18.5)+5.6],[14,tc(14)+5.6],[14,tc(14)+6.2],[-18.5,tc(-18.5)+6.2]],'ply','l');a.pl([[-18.5,tc(-18.5)+6.35],[14,tc(14)+6.35]],'m');a.pl([[-19.3,tc(-19.3)+6.7],[14,tc(14)+6.75]],'h');
  a.pl([[-19.6,tc(-19.6)+6.4],[-18.3,tc(-18.3)+6.05],[-18.3,tc(-18.3)+4.2],[-19.1,tc(-18.3)+3.9]],'m');
  a.blk1(-18.5,89.5,1.5,6.6+tc(-18.5)-96);a.rect(-17,94.4,16.05,.6,'ply','l');a.batt(7,101,7,8,'h');a.ln(1,103,14,109.5,'m');
  a.pl([[-18.5,94.5],[-19.3,94.5],[-19.3,89],[-24,89],[-25,95.6]],'m');a.brk(14,96,14,116);a.brk(-1,88,7,88);
  a.note(-10,tc(-10)+6.55,'Asphalt shingles on underlayment').note(-2,tc(-2)+6.4,'Ice barrier membrane from eave up per code where required').note(-19,tc(-19)+6.3,'Drip edge').note(8,tc(8)+2,'Truss top chord / rafter')
   .note(-10,94.7,'Vented soffit').note(5,105,'Ventilation baffle, keep air path open').note(10,104.5,'Insulation full depth over top plate (raised heel)').note(-23,91,'Gutter on fascia + sub-fascia').note(3,95.2,'Double top plate').note(.25,92,'Sheathing + WRB');}});

add({id:'rf-roof-drain',code:'RF-03',cat:'Roofs',title:'Roof Drain at Low-Slope Membrane Roof',mat:'Membrane',asm:'Roof drainage',sc:'112',
kw:'roof drain sump clamping ring strainer dome leader membrane tapered insulation low slope overflow',
draw(K){const k=SC['112'][1],a=K(k,275,250);
  deck(a,-19,-8,0);deck(a,8,19,0);a.rect(-7.2,-.6,2,.6,'steel','x');a.rect(5.2,-.6,2,.6,'steel','x');
  a.poly([[-19,1.5],[-8.2,1.5],[-8.2,4.2],[-19,7.4]],'rigid','l');a.poly([[19,1.5],[8.2,1.5],[8.2,4.2],[19,7.4]],'rigid','l');
  a.poly([[-8,3.2],[8,3.2],[8,2.2],[5,2.2],[3,-4],[-3,-4],[-5,2.2],[-8,2.2]],'gray','h');a.rect(-2,-16,4,12,'white','m');a.brk(-3,-16,3,-16);
  a.pl([[-19,7.5],[-8,4.3],[-6.2,3.4],[6.2,3.4],[8,4.3],[19,7.5]],'h');a.rect(-7.6,3.45,3.4,.55,'steel','x');a.rect(4.2,3.45,3.4,.55,'steel','x');
  const dome=[];for(let t=0;t<=Math.PI;t+=Math.PI/12)dome.push([4*Math.cos(t),4+5*Math.sin(t)]);a.pl(dome,'m');for(let x=-3;x<=3;x+=1.5)a.ln(x,4,x,4+5*Math.sqrt(1-(x/4)**2),'l');
  a.brk(-19,-1,-19,8.5);a.brk(19,-1,19,8.5);
  a.note(-1.5,8.5,'Cast iron / plastic dome strainer').note(5.5,4,'Clamping ring over membrane').note(12,5.5,'Membrane roofing, sump at drain').note(-14,5,'Tapered insulation, slope to drain 1/4" per ft min.')
   .note(-14,.8,'Steel roof deck, reinforce opening per structural').note(-6,-.3,'Under-deck clamp').note(-4,0,'Drain body').note(2,-10,'Insulated leader, size per plumbing code').note(16,6.6,'Provide secondary (overflow) drainage per plumbing code');}});

/* ------------------------------------------------------------ FOUNDATIONS */
add({id:'fd-foundation-wall',code:'FD-01',cat:'Foundations',title:'Foundation Wall + Footing with Footing Drain',mat:'Concrete',asm:'Foundation',sc:'34',
kw:'foundation wall footing drain basement waterproofing dampproofing frost depth rebar keyway gravel',
draw(K){const k=SC['34'][1],a=K(k,207,212);
  a.rect(-30,-50,74,68,'earth','x');a.poly([[-30,17],[0,18],[0,-50],[-30,-50]],'earth','x');a.rect(-20,-48,14,12,'grav','m');a.rect(-20,-48,14,12,'none','l','hid');a.circ(-13,-44,2,'white','m');[-14,-13,-12].forEach(x=>a.dot(x,-45.2,.2));
  a.rect(-6,-48,24,10,'conc');a.rect(0,-38,10,64,'conc');a.rect(3,-38,4,1.5,'none','l','hid');a.ln(6,-46,6,24,'l','hid');[-30,-18,-6,6,18].forEach(y=>a.dot(6,y,.3125));[-2,6,14].forEach(x=>a.dot(x,-45,.3125));
  a.rect(18,-42,26,4,'grav');a.ln(10,-38,44,-38,'m','vr');a.rect(10,-38,34,4,'conc');a.ln(-30,17,0,18,'h');a.ln(-.15,-38,-.15,18,'h','wrb');a.ln(-.7,-38,-.7,16,'m','hid');
  a.blk(.5,26,5.5,1.5);a.ln(3.25,16,3.25,28,'m');a.brk(-2,28.5,12,28.5);a.brk(44,-43,44,-33);a.dim(-24,-48,-24,18,'FROST DEPTH PER LOCAL CODE',-3);
  a.note(-.2,0,'Waterproofing / dampproofing per code + soils report').note(-.7,8,'Drainage board / protection').note(5,-10,'Conc. foundation wall, reinforcing per structural').note(5,-37,'Keyway + dowels per structural')
   .note(10,-46,'Conc. footing, rebar per structural').note(-13,-42,'Perforated footing drain in gravel wrapped in filter fabric, to daylight or sump').note(30,-36,'Conc. slab on vapor retarder on gravel').note(3.25,24,'Sill plate + anchor bolts per structural').note(-15,17.5,'Slope grade away');}});

add({id:'fd-spread-footing',code:'FD-02',cat:'Foundations',title:'Spread Footing + Pier at Steel Column',mat:'Concrete / Steel',asm:'Foundation',sc:'12',
kw:'spread footing pier steel column base plate anchor rods grout isolation joint slab box out',
draw(K){const k=SC['12'][1],a=K(k,215,330);
  a.rect(-40,-44,80,36,'earth','x');a.rect(-40,-8,28,4,'grav');a.rect(12,-8,28,4,'grav');a.rect(-36,-36,72,12,'conc');a.rect(-10,-24,20,18,'conc');
  for(let x=-33;x<=33;x+=6)a.dot(x,-33,.3125);a.ln(-34,-33,34,-33,'l');a.rect(-40,-4,28,4,'conc');a.rect(12,-4,28,4,'conc');a.rect(-12,-6,24,6,'conc','l');
  a.rect(-12.25,-4,.25,4,'seal','x');a.rect(12,-4,.25,4,'seal','x');a.rect(-7,-6,14,1.5,'sand','l');a.rect(-7,-4.5,14,1.5,'steel','x');
  [-5,5].forEach(x=>{a.ln(x,-20,x,-2.6,'m');a.pl([[x,-20],[x+(x<0?-2:2),-20]],'m');a.rect(x-.6,-3,1.2,.5,'steel','x');});
  a.rect(-4,-3,8,43,'white','h');a.ln(-3.4,-3,-3.4,40,'l');a.ln(3.4,-3,3.4,40,'l');a.brk(-6,40,6,40);a.brk(-40,-5,-40,1);a.brk(40,-5,40,1);a.ln(-40,0,-12.25,0,'m');a.ln(12.25,0,40,0,'m');
  a.note(3.5,25,'Steel column, size per structural').note(6.5,-3.7,'Base plate + leveling nuts').note(-6,-5.2,'Non-shrink grout').note(-5,-15,'Anchor rods, size + embed per structural').note(0,-12,'Conc. pier')
   .note(20,-33,'Spread footing, size + bottom bars per structural; bear on soil per geotech report').note(-12.1,-1.5,'Isolation joint around box-out').note(-25,-2,'Slab on grade, infill box-out after column is set').note(30,-30,'Bottom of footing below frost depth');}});

/* ------------------------------------------------------------ SLABS */
add({id:'sl-slab-on-grade',code:'SL-01',cat:'Slabs',title:'Slab on Grade with Vapor Retarder + Control Joint',mat:'Concrete',asm:'Slab',sc:'112',
kw:'slab on grade vapor retarder barrier control joint sawcut base course gravel subgrade reinforcing',
draw(K){const k=SC['112'][1],a=K(k,55,186);
  a.rect(0,-16,36,8,'earth','x');a.rect(0,-8,36,4,'grav');a.ln(0,-4,36,-4,'h','vr');a.rect(0,-4,36,4,'conc');a.gap(17.94,-1,.12,1);a.rect(17.94,-1,.12,1,'seal','x');a.ln(18,-1,18,-3.9,'l','hid');
  [4.5,13.5,22.5,31.5].forEach(x=>a.dot(x,-2.2,.25));a.ln(0,-2.2,36,-2.2,'l','hid');a.brk(0,-17,0,1);a.brk(36,-17,36,1);
  a.dim(36,-4,36,0,'4" (VERIFY)',3);a.dim(36,-8,36,-4,'4"',3);a.dim(17.94,0,18.06,0,'1/8" SAWCUT',2.2);a.dim(18,-1,18,0,'1/4 T',-4);
  a.note(26,-.2,'Conc. slab, strength + thickness per structural').note(18,-.5,'Sawcut control joint 1/4 slab depth, cut as early as possible, fill per spec').note(9,-2.2,'Reinforcing per structural, support in upper third')
   .note(28,-4,'Vapor retarder (ASTM E1745), lap + tape seams, seal penetrations').note(10,-6,'Granular base course, compacted').note(24,-12,'Subgrade compacted per geotech report');}});

add({id:'sl-construction-joint',code:'SL-02',cat:'Slabs',title:'Slab Construction Joint with Smooth Dowels',mat:'Concrete',asm:'Slab joint',sc:'112',
kw:'construction joint dowel slab joint load transfer sleeve bond breaker pour break',
draw(K){const k=SC['112'][1],a=K(k,55,186);
  a.rect(0,-16,36,8,'earth','x');a.rect(0,-8,36,2,'grav');a.ln(0,-6,36,-6,'h','vr');a.rect(0,-6,18,6,'conc');a.rect(18,-6,18,6,'conc');a.ln(18,-6,18,0,'h');
  a.rect(9,-3.375,18,.75,'steel','x');a.rect(18,-3.55,9.5,1.1,'none','m','hid');a.rect(17.9,0-.375,.2,.375,'seal','x');a.brk(0,-17,0,1);a.brk(36,-17,36,1);
  a.dim(9,-3,27,-3,'18" TYP.',-4.5);a.dim(36,-6,36,0,'6" (VERIFY)',3);
  a.note(12,-3,'Smooth dowel at mid-depth, size + spacing per structural').note(24,-3.5,'Dowel sleeve / bond breaker on one side so the joint can open').note(18,-1.5,'Construction joint, align with control joint layout').note(18,-.2,'Joint sealant / filler per spec').note(6,-7,'Vapor retarder on base course');}});

/* ------------------------------------------------------------ DOORS */
add({id:'dr-hm-frame',code:'DR-01',cat:'Doors',title:'Hollow Metal Frame Head + Jamb at Steel Stud Wall',mat:'Steel',asm:'Door frame',sc:'112',views:'HEAD (LEFT) + JAMB PLAN (RIGHT)',
kw:'door frame hollow metal head jamb steel stud partition rabbet stop anchor gypsum',
draw(K){const k=SC['112'][1],h=K(k,70,260),j=K(k,300,420);
  const prof=[[-2,0],[-2,-.4375],[0,-.4375],[0,1.5],[.625,1.5],[.625,3.25],[0,3.25],[0,5.3125],[-2,5.3125],[-2,4.875]];
  j.rect(-14,0,13.85,.625,'gyp','l');j.rect(-14,4.25,13.85,.625,'gyp','l');cstud(j,-.2,.625,3.625,1.625,true);cstud(j,-3.8,.625,3.625,1.625,false);j.pl(prof,'h');j.pl([[-1.9,1.2],[-1.2,1.2],[-1.2,3.6],[-.6,3.6]],'l');
  j.rect(.125,-.25,9,1.75,'wood','m');j.brk(9.1,-1.5,9.1,3);j.brk(-14,-1,-14,6);j.label(-2,-4,'JAMB');j.dim(0,5.3125,.625,5.3125,'5/8"',1.6);
  const hp=prof.map(p=>[p[1],-p[0]]);h.rect(0,.15,.625,13.85,'gyp','l');h.rect(4.25,.15,.625,13.85,'gyp','l');h.pl([[.625,3.8],[.625,2.15],[4.25,2.15],[4.25,3.8]],'h');h.batt(.75,4,3.4,10,'v');h.pl(hp,'h');
  h.rect(-.25,-16,1.75,15.875,'wood','m');h.brk(-1,-16,2.5,-16);h.brk(-1,14,6,14);h.label(2.4,-18.5,'HEAD');h.dim(-.25,-8,1.5,-8,'1 3/4"',-2);
  j.note(-1,-.44,'16 ga. hollow metal frame, double rabbet, sizes per door schedule').note(.4,2.5,'Integral stop').note(-3,2.6,'Double jamb studs + frame anchors per mfr.').note(-8,.3,'5/8" gyp. bd. into frame throat').note(4,.5,'1 3/4" door, hardware per schedule');
  h.note(2.4,2.15,'Header track / box header').note(.3,9,'Gyp. bd. each side, finish per wall type').note(.6,-3,'1/8" clearance at head');}});

add({id:'dr-threshold',code:'DR-02',cat:'Doors',title:'Accessible Exterior Door Threshold',mat:'Aluminum / Concrete',asm:'Door sill',sc:'3',
kw:'threshold door sill accessible ada saddle sweep weatherstrip exterior entry landing slope',
draw(K){const k=SC['3'][1],a=K(k,220,262);
  a.poly([[-8,-6],[-.4,-6],[-.4,-.25],[-8,-.42]],'conc');a.rect(-.4,-6,.4,5.75,'seal','x');a.rect(0,-6,10,6,'conc');a.ln(2.6,0,10,0,'m');
  a.rect(-2.1,-.35,4.6,.1,'seal','x');a.poly([[-2.1,-.25],[-.5,.5],[1.5,.5],[2.5,0],[2.5,-.25]],'alum','m');a.ln(.5,.5,.5,-1.6,'l','hid');
  a.rect(0,1,1.75,8,'wood','m');a.poly([[-.15,1.3],[.05,1.3],[.05,.55],[-.15,.6]],'seal','x');a.brk(-1,9,3,9);a.brk(-8,-6.5,-8,0);a.brk(10,-6.5,10,.5);
  a.dim(2.5,0,2.5,.5,'1/2" MAX.',3.4);a.txt(-5,1.2,'EXTERIOR',9,'middle',700);a.txt(7,1.8,'INTERIOR',9,'middle',700);
  a.note(1,.5,'Thermally broken aluminum threshold, 1/2" max. height, edges beveled 1:2 max. above 1/4"').note(-.05,.9,'Door bottom sweep / weatherstrip').note(1,5,'Exterior door, see door schedule').note(-1.5,-.3,'Set threshold in full sealant bed')
   .note(.5,-1.2,'Fasteners into slab per mfr.').note(-.2,-3,'Isolation joint + sealant').note(-5,-.35,'Exterior landing: slope 1:48 max. away from door').note(6,-3,'Interior slab, flush with threshold base');}});

/* ------------------------------------------------------------ WINDOWS */
add({id:'wn-sill-pan',code:'WN-01',cat:'Windows',title:'Window Sill with Sill Pan Flashing - Wood Frame',mat:'Wood / Vinyl',asm:'Window sill',sc:'3',
kw:'window sill pan flashing back dam end dam flange wood frame weep sealant stool apron',
draw(K){const k=SC['3'][1],a=K(k,150,304);
  a.batt(.5,-6,5.5,4.5);a.blk(.5,-1.5,5.5,1.5);a.rect(0,-6,.5,6,'ply','l');a.ln(-.06,-6,-.06,0,'l','wrb');siding(a,0,-6,-1.4);a.rect(6,-6,.625,5.9,'gyp','l');
  a.poly([[0,0],[5.5,0],[5.5,.45]],'wood','l');a.pl([[-.12,-2.1],[-.12,.06],[5.5,.55],[5.5,1.6]],'h');
  a.rect(-.3,.62,3.3,1.5,'white','h');a.rect(-.5,-.7,.12,2.8,'dark','x');a.rect(.6,2.12,1.6,.9,'white','m');a.rect(.9,3.02,.125,6.5,'glass','l');a.rect(1.75,3.02,.125,6.5,'glass','l');a.rect(1.025,3.02,.725,.45,'dark','x');
  a.rect(3.0,.6,4.5,.75,'wood','m');a.rect(6.625,-2.6,.75,3.2,'wood','m');a.rect(3.0,.0,.5,.6,'seal','x');a.rect(-1.4,-1.4,.9,1.2,'wood','m');a.circ(-.75,.15,.18,'white','l');
  a.brk(-2,9.5,4,9.5);a.brk(-2,-6,8,-6);a.dim(5.5,.55,5.5,1.6,'1" MIN.',1.4);
  a.note(1.4,7,'Insulating glass unit').note(1.5,1.4,'Window frame on shims, per mfr. installation instructions').note(-.44,1,'Nailing flange: do not seal bottom flange so the pan can drain').note(3,.25,'Sill pan flashing sloped to exterior, end dams + back dam')
   .note(4,.2,'Beveled shim to slope pan').note(3.25,.3,'Interior air seal at perimeter (low-expansion foam or sealant)').note(5,1,'Interior stool').note(7,-1.5,'Apron').note(-.75,.15,'Sealant + backer rod, leave weep gaps at sill').note(-.5,-4,'Siding + WRB, WRB laps over pan leg');}});

add({id:'wn-head-flashing',code:'WN-02',cat:'Windows',title:'Window Head Flashing - Wood Frame',mat:'Wood / Vinyl',asm:'Window head',sc:'3',
kw:'window head flashing drip cap header wrb flap shingle lap flange tape casing',
draw(K){const k=SC['3'][1],a=K(k,150,250);
  a.blk1(.5,0,1.5,9.25);a.rect(2,0,2.5,9.25,'rigid','l');a.blk1(4.5,0,1.5,9.25);a.rect(0,0,.5,9.25,'ply','l');a.rect(6,0,.625,9.25,'gyp','l');
  a.pl([[-.06,9.25],[-.06,1.6],[-.6,.9]],'l','wrb');a.rect(-.55,.6,.15,2.2,'seal','x');a.rect(-.5,-2.1,.12,2.9,'dark','x');a.pl([[-.2,4],[-.2,.35],[-1.7,.35],[-1.7,-.05]],'h');
  siding(a,0,.5,9.25);a.rect(-.3,-2,3.3,1.45,'white','h');a.rect(.6,-3,1.6,1,'white','m');a.rect(.9,-9,.125,6,'glass','l');a.rect(1.75,-9,.125,6,'glass','l');
  a.rect(3,-.6,3.625,.6,'wood','m');a.rect(6.625,-3,.75,3.6,'wood','m');a.rect(3,-.6,.5,.6,'seal','x');a.brk(-2,9.25,8,9.25);a.brk(-1,-9,3,-9);a.dim(-.3,-.55,-.3,0,'1/2" SHIM',-2.5);
  a.note(-.06,5,'WRB head flap folded down over head flashing (shingle lap)').note(-.48,1.7,'Flashing tape over head flange').note(-1,.35,'Metal head flashing / drip cap, end dams').note(3,4,'Insulated header per structural')
   .note(1.4,-1.3,'Window head frame').note(1.4,-6,'Insulating glass').note(4.5,-.3,'Jamb extension + interior air seal').note(7,-1.5,'Casing');}});

/* ------------------------------------------------------------ STOREFRONT / CURTAIN WALL */
add({id:'sf-storefront-sill',code:'SF-01',cat:'Storefront / Curtain Wall',title:'Aluminum Storefront Sill with Subsill',mat:'Aluminum / Glass',asm:'Storefront sill',sc:'3',
kw:'storefront sill subsill receptor end dam weep glazing setting block gasket aluminum entrance glass',
draw(K){const k=SC['3'][1],a=K(k,160,374);
  a.poly([[-4,-4],[-.6,-4],[-.6,-.6],[-4,-.85]],'conc');a.rect(-.6,-4,.6,3.4,'seal','x');a.rect(0,-4,10,4,'conc');a.ln(4.8,0,10,0,'m');
  a.rect(.3,0,3.9,.25,'dark','x');a.rect(-.2,.25,4.7,.25,'alum','m');a.rect(-.35,-.4,.15,.9,'alum','m');a.rect(4.35,.5,.15,1.6,'alum','m');a.rect(.05,.5,.12,.6,'alum','m');a.poly([[-.35,0],[-.35,.35],[-.75,0]],'seal','x');a.rect(4.5,.25,.25,.5,'seal','x');
  a.rect(.2,1.05,4.1,1.75,'alum','m');a.rect(.35,1.2,3.8,1.45,'white','l');a.rect(.2,2.8,.5,.9,'alum','m');a.rect(2.9,2.8,.5,.75,'alum','m');
  a.rect(1.25,3.0,.25,9,'glass','l');a.rect(2.0,3.0,.25,9,'glass','l');a.rect(1.5,3.0,.5,.45,'dark','x');a.rect(1.2,2.8,1.1,.2,'seal','x');a.rect(.7,3.3,.55,.25,'seal','x');a.rect(2.25,3.3,.65,.25,'seal','x');
  a.brk(0,12,3.6,12);a.brk(-4,-4.5,-4,0);a.brk(10,-4.5,10,.5);a.txt(-2.5,4,'EXTERIOR',9,'middle',700);a.txt(7.5,4,'INTERIOR',9,'middle',700);
  a.note(1.9,9,'1" insulating glass unit').note(.95,3.42,'Glazing gaskets, exterior + interior').note(1.75,2.9,'Setting blocks at quarter points').note(2.2,1.9,'Sill member, weep holes per mfr.')
   .note(2.6,.4,'Subsill with sealed end dams').note(2,.08,'Shims, sealant at fasteners').note(-.5,.15,'Sealant + backer rod at exterior').note(4.6,.5,'Interior air seal').note(5,-2,'Conc. slab / curb').note(-2.5,-.75,'Slope exterior paving away');}});

add({id:'sf-storefront-head',code:'SF-02',cat:'Storefront / Curtain Wall',title:'Aluminum Storefront Head with Deflection Receptor',mat:'Aluminum / Steel stud',asm:'Storefront head',sc:'3',
kw:'storefront head receptor deflection steel stud header sealant backer rod glazing aluminum',
draw(K){const k=SC['3'][1],a=K(k,170,225);
  a.rect(-1.5,0,.875,7,'sand','m');a.rect(-.625,0,.625,7,'gyp','l');a.ln(-.68,0,-.68,7,'l','wrb');cstud(a,.1,0,6,1.625,false);cstud(a,6.1,0,6,1.625,true);a.rect(6.1,0,.625,7,'gyp','l');
  a.rect(-.2,-.15,4.7,.15,'alum','m');a.rect(-.2,-1.4,.15,1.25,'alum','m');a.rect(4.35,-1.4,.15,1.25,'alum','m');a.rect(.2,-3,4.1,1.75,'alum','m');a.rect(.35,-2.85,3.8,1.45,'white','l');
  a.rect(.2,-3.9,.5,.9,'alum','m');a.rect(2.9,-3.75,.5,.75,'alum','m');a.rect(1.25,-9,.25,5.8,'glass','l');a.rect(2.0,-9,.25,5.8,'glass','l');a.rect(.7,-3.55,.55,.25,'seal','x');a.rect(2.25,-3.55,.65,.25,'seal','x');
  a.circ(-.55,-.4,.22,'white','l');a.rect(-.85,-.4,.6,.25,'seal','x');a.rect(4.5,-.5,.3,.45,'seal','x');a.brk(-2,7,7,7);a.brk(0,-9,3.5,-9);a.dim(4.3,-1.25,4.3,-.15,'DEFLECTION',2.6);
  a.note(-1.1,6,'Exterior cladding over sheathing + WRB').note(3,5,'Steel stud box header, size per structural').note(2,-.08,'Head receptor anchored to header').note(2.2,-1.9,'Head member slides in receptor: allow for structure deflection')
   .note(-.55,-.3,'Sealant + backer rod').note(4.65,-.3,'Interior sealant').note(1.75,-7,'Insulating glass unit').note(.95,-3.42,'Glazing gaskets');}});

add({id:'cw-slab-edge-safing',code:'CW-01',cat:'Storefront / Curtain Wall',title:'Curtain Wall at Slab Edge - Perimeter Fire Safing',mat:'Aluminum / Mineral wool',asm:'Curtain wall',sc:'112',
kw:'curtain wall slab edge safing perimeter fire containment smoke seal spandrel back pan anchor mineral wool',
draw(K){const k=SC['112'][1],a=K(k,145,289);
  a.rect(8,-8,18,8,'conc');a.rect(-1,4.5,1,13.5,'glass','l');a.rect(-1,-14,1,1.2,'glass','l');a.rect(-1,-12,.25,16.5,'gray','m');
  a.rect(-1.6,3,7.1,1.75,'alum','m');a.rect(-1.6,-12.9,7.1,1.75,'alum','m');a.ln(.2,-11.15,.2,3,'l','hid');a.ln(5.5,-11.15,5.5,3,'l','hid');
  a.rect(.5,-11.1,3.5,14.1,'mw','l');a.ln(4,-11.1,4,3,'h');a.rect(4,-4,4,4,'mw','m');a.rect(4,0,4,.3,'seal','x');a.rect(5.5,0,4.5,.375,'steel','x');a.ln(9,.4,9,-3,'m');a.rect(8,-.5,6,.5,'steel','x');
  a.brk(26,-9,26,1);a.brk(-1.5,18,1,18);a.brk(-1.5,-14,1,-14);a.txt(-6,10,'EXTERIOR',9,'middle',700);a.txt(18,6,'INTERIOR',9,'middle',700);
  a.note(-.5,12,'Vision glass').note(-.9,-6,'Spandrel panel').note(2,-8,'Spandrel insulation (mineral wool)').note(4,-10,'Galvanized back pan, sealed').note(6,-2,'Safing: compressed mineral wool at slab edge')
   .note(6,.15,'Smoke seal (listed sealant) over safing').note(11,.2,'Curtain wall anchor to slab embed, per engineer').note(1,3.8,'Transom').note(16,-5,'Floor slab: perimeter system must match the floor rating and be a tested system (ASTM E2307)').note(3,-11.6,'Mullion beyond');}});

/* ------------------------------------------------------------ STAIRS */
add({id:'st-pan-stair',code:'ST-01',cat:'Stairs',title:'Stair Tread + Riser - Concrete-Filled Steel Pan',mat:'Steel / Concrete',asm:'Stair',sc:'1',
kw:'stair tread riser nosing steel pan concrete fill stringer egress ibc riser height tread depth',
draw(K){const k=SC['1'][1],a=K(k,73,300);
  const m=7/11;a.poly([[-3,m*-3-1.5],[38,m*38-1.5],[38,m*38-13.4],[-3,m*-3-13.4]],'white','m');a.pl([[-3,m*-3-2.2],[38,m*38-2.2]],'l','hid');
  a.ln(-8,0,0,0,'h');for(let i=0;i<3;i++){const x=11*i,t=7*(i+1);a.rect(x,t-1.5,11,1.5,'conc','l');a.pl([[x,7*i-1.5],[x,t],[x+.6,t],[x+.6,t-1.5],[x+11,t-1.5]],'h');a.rect(x,t-.25,1.8,.25,'dark','x');a.rect(x+3,t-1.9,1.2,.4,'steel','x');}
  a.brk(33,20,37,26);a.brk(-3,-16,-3,-2);
  a.dim(11,7,11,14,'7" MAX. RISER',-4);a.dim(11,14,22,14,'11" MIN. TREAD',6);
  a.note(13,13.2,'Conc. fill in steel pan').note(23.3,20.4,'Steel pan, gauge per stair engineer').note(.9,6.9,'Abrasive nosing, contrasting where required').note(26,18,'Pan support angle').note(20,6,'Steel channel stringer, delegated design').note(-5,0,'Floor / landing')
   .note(30,14,'Uniform risers + treads (3/8" max. variation), nosing projection 1 1/4" max. where used (IBC)');}});

/* ------------------------------------------------------------ RAILINGS */
add({id:'rl-stair-guard',code:'RL-01',cat:'Railings',title:'Stair Guard + Handrail Elevation',mat:'Steel',asm:'Guard / handrail',sc:'12',views:'ELEVATION',
kw:'guard guardrail handrail stair railing extension 42 inch 34 38 balusters 4 inch sphere',
draw(K){const k=SC['12'][1],a=K(k,76,470);const m=7/11,ny=x=>m*x+7;
  const st=[[-14,0]];for(let i=0;i<7;i++)st.push([11*i,7*i],[11*i,7*(i+1)]);st.push([100,49]);a.pl(st,'h');
  a.pl([[-11,ny(-11)+36-7],[0,ny(0)+36],[66,ny(66)+36],[78,85],[78,82]],'h');a.pl([[0,ny(0)+42],[66,ny(66)+42],[100,91]],'h');a.pl([[0,ny(0)+4],[66,ny(66)+4],[100,53]],'m');
  [0,33,66,98].forEach(x=>{const b=x>66?49:ny(x);a.rect(x-.75,b,1.5,(x>66?91:ny(x)+42)-b,'white','m');});
  for(let x=4.5;x<97;x+=4.5){if(Math.abs(x-33)<2||Math.abs(x-66)<2)continue;const b=x>66?53:ny(x)+4,t=x>66?91:ny(x)+42;a.ln(x,b,x,t,'l');}
  a.circ(49.5,ny(49.5)+20,2,'none','m');a.dim(96,49,96,91,'42" MIN.',6);a.dim(33,ny(33),33,ny(33)+36,'34"-38"',-5);a.dim(66,85,78,85,'12" MIN.',-6);
  a.note(49.5,ny(49.5)+21.5,'Openings must not pass a 4" sphere').note(12,ny(12)+42,'Guard 42" min. above nosing line + landing').note(20,ny(20)+36,'Handrail 34"-38" above nosings, continuous').note(78,84,'Extend 12" min. at top, return to wall/post')
   .note(-11,29,'Extend at bottom one tread depth at slope').note(44,ny(44)+4,'Bottom rail: triangle at tread/riser must not pass a 6" sphere').note(66.5,70,'Post, anchorage per structural (guard + handrail loads)');}});

add({id:'rl-handrail-bracket',code:'RL-02',cat:'Railings',title:'Wall-Mounted Handrail Bracket',mat:'Steel',asm:'Handrail',sc:'3',
kw:'handrail bracket wall mounted blocking grip diameter clearance ada handrail gripping surface',
draw(K){const k=SC['3'][1],a=K(k,230,280);
  a.rect(-4.25,-6,3.625,12,'white','l');a.rect(-.625,-6,.625,12,'gyp','l');a.blk(-2.125,-2.75,1.5,5.5);a.rect(0,-1.25,.25,2.5,'steel','x');
  a.pl([[.25,-.25],[2.25,-.25],[2.25,1.25]],'h');a.circ(2.25,2,.75,'white','h');a.circ(2.25,2,.63,'none','l');a.ln(.25,.6,-2,.6,'m');a.ln(.25,-.8,-2,-.8,'m');
  a.brk(-4.5,6,0,6);a.brk(-4.5,-6,0,-6);a.dim(0,2.75,1.5,2.75,'1 1/2" MIN.',1.2);a.dim(3,-.25,3,1.25,'1 1/2" MIN.',1.6);
  a.note(2.9,2.4,'Circular handrail 1 1/4" - 2" O.D. (verify code), continuous gripping surface').note(1.3,-.25,'Bracket below grip, 1 1/2" min. clear to bracket').note(.12,-1,'Wall flange').note(-1.4,-2,'Solid blocking in wall at each bracket')
   .note(-1,.6,'Fasteners into blocking, design for code handrail loads').note(-.3,-5,'Gyp. bd. on studs').note(-3,5,'Handrail height 34"-38" above stair nosings / ramp surface');}});

/* ------------------------------------------------------------ RESTROOMS / ADA */
add({id:'ada-water-closet',code:'AD-01',cat:'Restrooms / ADA',title:'Accessible Water Closet + Grab Bars',mat:'Fixtures',asm:'Toilet compartment',sc:'12',views:'PLAN + SIDE WALL ELEVATION',
kw:'ada accessible water closet toilet grab bar clearance 60 inch 16 18 centerline toilet paper dispenser restroom',
draw(K){const k=SC['12'][1],p=K(k,58,58),e=K(k,58,500);
  p.rect(-5,0,77,5,'gray','m');p.rect(-5,-62,5,62,'gray','m');p.rect(0,-56,60,56,'none','l','hid');p.rect(9,-8,18,8,'white','m');p.ell(18,-19,7,10.5,'white','m');p.ln(18,2,18,-34,'l','cen');
  p.rect(1.5,-54,1.5,42,'white','m');p.rect(6,-3,36,1.5,'white','m');p.rect(.2,-39,3.5,4,'white','l');p.label(30,-66.5,'PLAN');
  p.dim(0,-38,18,-38,'16"-18"',-6);p.dim(0,-56,60,-56,'60" MIN.',-6);p.dim(60,0,60,-56,'56" MIN.',6);
  e.rect(-5,0,5,40,'gray','m');e.ln(-5,0,64,0,'h');e.poly([[9,0],[21,0],[23,12],[7,12]],'white','m');e.rect(3,12,26,4.5,'white','m');e.rect(3,16.5,25,1.2,'white','m');e.rect(.5,17.7,9,13.5,'white','m');
  e.rect(12,33,42,1.5,'white','m');e.rect(36,19,5,4,'white','l');e.label(30,-5,'SIDE WALL ELEVATION');e.dim(62,0,62,34.5,'33"-36"',3);e.dim(29,0,29,17.7,'17"-19"',5);e.dim(0,33,12,33,'12" MAX.',-4);e.dim(12,33,54,33,'42" MIN.',-4);
  p.note(2.2,-30,'Side grab bar 42" min., 12" max. from rear wall, extend 54" min. from rear wall').note(30,-2.2,'Rear grab bar 36" min., 12" min. one side of CL + 24" min. other side').note(2,-37,'Toilet paper dispenser 7"-9" in front of bowl, 15"-48" AFF')
   .note(45,-30,'Clear floor space, no overlap with other fixtures except as allowed').note(18,-28,'Water closet CL 16"-18" from side wall');
  e.note(40,34,'Grab bars 33"-36" AFF to top of gripping surface').note(20,17,'Seat 17"-19" AFF').note(5,24,'Flush control on open side, 48" max. AFF');}});

add({id:'ada-lavatory',code:'AD-02',cat:'Restrooms / ADA',title:'Accessible Lavatory + Mirror Section',mat:'Fixtures',asm:'Lavatory',sc:'34',
kw:'ada accessible lavatory sink knee clearance toe clearance mirror 40 inch pipe protection restroom vanity',
draw(K){const k=SC['34'][1],a=K(k,140,516);
  a.rect(-6,0,6,76,'gray','m');a.ln(-6,0,40,0,'h');a.poly([[0,34],[22,34],[22,31],[14,29],[5,22],[0,22]],'white','h');a.pl([[11,23],[11,17],[0,17]],'h');a.pl([[11.8,23],[11.8,16.2],[0,16.2]],'l');
  a.pl([[4,34],[4,37],[8,37],[8,36]],'m');a.rect(0,40,.6,30,'glass','m');a.pl([[22,27],[14,27],[14,9],[5,9],[5,0]],'l','hid');
  a.dim(22,0,22,34,'34" MAX.',10);a.dim(14,0,14,27,'27" MIN.',16);a.dim(14,27,22,27,'8"',-3);a.dim(5,0,5,9,'9" MIN.',-9);a.dim(0,0,0,40,'40" MAX.',-12);a.brk(-6,76,0,76);
  a.note(15,34,'Lavatory rim / counter 34" max. AFF').note(0,60,'Mirror over lavatory: reflecting surface bottom 40" max. AFF').note(6,37,'Faucet: operable with one hand, no tight grasping or twisting').note(6,17,'Insulate / protect water + drain pipes under lavatory')
   .note(18,28,'Knee clearance 27" min. high, 8" min. deep').note(10,9,'Toe clearance 9" min. high').note(30,4,'30" x 48" clear floor space, forward approach');}});

/* ------------------------------------------------------------ MILLWORK */
add({id:'mw-base-cabinet',code:'MW-01',cat:'Millwork',title:'Base Cabinet + Countertop Section',mat:'Wood / Solid surface',asm:'Casework',sc:'1',
kw:'base cabinet countertop millwork casework toe kick backsplash adjustable shelf drawer blocking',
draw(K){const k=SC['1'][1],a=K(k,130,450);
  a.rect(-6,0,5.375,44,'white','l');a.rect(-.625,0,.625,44,'gyp','l');a.blk(-2.1,30,1.5,3.5);a.ln(-6,0,30,0,'h');
  a.blk1(3,0,.75,4);a.rect(0,4,24,.75,'ply','m');a.rect(0,4.75,.5,29,'ply','m');a.rect(.5,33.75,4,.75,'ply','m');a.rect(19.75,33.75,4.25,.75,'ply','m');a.rect(.5,18,22.75,.75,'ply','m');
  a.rect(1.5,28.3,21.5,4.7,'none','l');a.rect(24,28,.75,6,'wood','m');a.rect(24,4.5,.75,23.25,'wood','m');a.rect(0,34.5,25.75,1.25,'stone','m');a.rect(0,35.75,.75,4,'stone','m');a.rect(-.05,39.75,.1,.1,'seal','x');
  a.ln(.25,31.5,-2.5,31.5,'m');a.rect(3.75,0,.15,4,'seal','x');a.brk(-6,44,0,44);
  a.dim(27.5,0,27.5,35.75,'36" TYP. (34" MAX. AT ACCESSIBLE PORTION)',2);a.dim(0,2,24,2,'24"',-6);a.dim(3,0,3,4,'4"',-6.5);
  a.note(12,35.2,'Countertop, 1" overhang, material per finish schedule').note(.4,38,'Backsplash, seal to wall').note(-1.4,31.8,'Blocking in wall for cabinet attachment').note(12,33,'Drawer box').note(24.4,15,'Door + drawer fronts per finish schedule')
   .note(10,18.4,'Adjustable shelf').note(.25,10,'Cabinet back').note(3.4,2,'Toe kick base, 4" high x 3" deep, resilient base');}});

add({id:'mw-transaction-counter',code:'MW-02',cat:'Millwork',title:'Accessible Transaction Counter Section',mat:'Wood / Solid surface',asm:'Reception desk',sc:'34',
kw:'transaction counter reception desk accessible counter 36 inch ada service counter millwork knee space',
draw(K){const k=SC['1'][1],a=K(k,190,470);
  a.ln(-14,0,30,0,'h');a.rect(0,4,.75,31,'wood','m');a.rect(.75,0,3.5,35,'white','m');a.ln(.75,0,4.25,35,'x');a.rect(1.5,0,2.75,4,'white','l');a.rect(-.25,0,1,4,'seal','x');
  a.rect(-1.5,35,7,1.25,'stone','m');a.rect(4.25,28.75,22,1.25,'ply','m');a.rect(4.25,30,.75,5,'ply','m');a.pl([[4.25,26],[7,28.75]],'m');a.rect(25.25,0,.75,28.75,'ply','m');a.brk(26,-1,26,30);
  a.dim(-8,0,-8,36.25,'36" MAX.',-2);a.dim(28,0,28,30,'30" TYP.',2);a.txt(-7,40,'CUSTOMER SIDE',9,'middle',700);a.txt(16,40,'STAFF SIDE',9,'middle',700);
  a.note(2,35.6,'Accessible portion: 36" min. long, 36" max. AFF, full counter depth (ADA 904.4)').note(.4,20,'Finish panel on plywood').note(2.5,12,'Framed knee wall, anchor to floor').note(15,29.4,'Staff work surface')
   .note(5.5,27.3,'Steel support bracket').note(.25,2,'Base').note(-10,1,'Clear floor space at accessible portion');}});

/* ------------------------------------------------------------ INTERIORS */
add({id:'in-partition-base',code:'IN-01',cat:'Interiors',title:'Interior Partition Base - Steel Stud on Slab',mat:'Steel stud / Gypsum',asm:'Partition',sc:'3',
kw:'partition base bottom track steel stud gypsum acoustical sealant resilient base cove base flooring carpet lvt',
draw(K){const k=SC['3'][1],a=K(k,210,330);
  a.rect(-6,-3,16,3,'conc');a.pl([[0,1.25],[0,.05],[3.625,.05],[3.625,1.25]],'h');a.batt(.1,.3,3.4,9.7);a.ln(.12,.3,.12,10,'l','hid');a.ln(3.5,.3,3.5,10,'l','hid');
  a.rect(-.625,.5,.625,9.5,'gyp','l');a.rect(3.625,.5,.625,9.5,'gyp','l');a.rect(-.625,0,.625,.5,'seal','x');a.rect(3.625,0,.625,.5,'seal','x');a.ln(1.8,0,1.8,-1.3,'m');a.rect(1.5,.05,.6,.15,'steel','x');
  a.rect(-6,0,5.25,.4,'sand','l');a.rect(-.75,.4,.125,4,'seal','x');a.rect(4.25,0,5.75,.12,'dark','x');a.poly([[4.25,.12],[4.25,4.1],[4.4,4.1],[4.4,.45],[4.8,.12]],'seal','x');
  a.brk(-1,10,5,10);a.brk(-6,-3.5,-6,.6);a.brk(10,-3.5,10,.6);a.dim(-.625,0,-.625,.5,'1/2"',-2.2);
  a.note(1.8,6,'Partition per wall type, sound attenuation batts where scheduled').note(-.3,4,'5/8" gyp. bd. held 1/2" above slab').note(-.3,.25,'Continuous acoustical sealant at base, both sides').note(2.5,.6,'Bottom track, fasten per mfr. + structural')
   .note(-3,.2,'Carpet').note(-.7,3,'4" straight rubber base at carpet').note(4.3,2.5,'4" coved rubber base at resilient flooring').note(7,.06,'Resilient flooring; verify slab moisture + flatness').note(4,-1.5,'Conc. slab');}});

/* ------------------------------------------------------------ CEILINGS */
add({id:'cl-act-wall-angle',code:'CL-01',cat:'Ceilings',title:'Suspended Acoustical Ceiling at Wall Angle',mat:'Acoustical tile',asm:'Suspended ceiling',sc:'3',
kw:'acoustical ceiling act suspended grid wall angle main tee hanger wire seismic perimeter ceiling tile',
draw(K){const k=SC['3'][1],a=K(k,160,345);
  a.rect(-5,-4,4.375,14,'white','l');a.rect(-.625,-4,.625,14,'gyp','l');a.pl([[0,.875],[0,0],[.875,0]],'h');a.ln(0,.5,-.9,.5,'m');
  a.rect(.05,.06,11.45,.75,'act','m');a.pl([[11.53,0],[12.47,0]],'h');a.ln(12,0,12,1.5,'h');a.rect(11.9,1.5,.2,.3,'white','m');a.rect(12.5,.06,2.5,.75,'act','m');a.ln(12,1.8,12,10,'m');a.ln(12,2.4,12.3,2.6,'m');
  a.brk(-5,10,0,10);a.brk(15,-.5,15,1.5);a.brk(11.5,10,12.5,10);
  a.note(.4,.4,'Wall angle, fasten to wall').note(6,.5,'Acoustical ceiling panel, edge per finish schedule').note(12.25,0,'Main runner (15/16" exposed grid)').note(12,7,'12 ga. hanger wire to structure, spacing per ASTM C636')
   .note(-.3,6,'Gyp. bd. partition').note(-.4,.5,'Seismic perimeter: wider angle + clips may be required (ASTM E580, verify seismic category)');}});

add({id:'cl-gyp-soffit',code:'CL-02',cat:'Ceilings',title:'Gypsum Board Soffit at Acoustical Ceiling',mat:'Gypsum / Steel stud',asm:'Soffit',sc:'112',
kw:'soffit bulkhead gypsum ceiling steel stud framing corner bead drop ceiling transition',
draw(K){const k=SC['112'][1],a=K(k,95,260);
  a.rect(-5,-16,4.375,30,'white','l');a.rect(-.625,-16,.625,30,'gyp','l');a.rect(0,-12.6,24.6,.6,'gyp','m');a.rect(24,-12.6,.6,26.6,'gyp','m');
  cstud(a,0,-12,3.625,1.25,false);a.ln(.5,-8.4,23.5,-8.4,'l','hid');a.pl([[20.4,14],[20.4,-12],[24,-12],[24,14]],'m');a.ln(20.4,4,6,14,'m');a.pl([[.5,-12],[.5,-8.4]],'m');
  a.pl([[24.6,.875],[24.6,0],[25.5,0]],'h');a.rect(24.7,.06,9,.75,'act','m');a.rect(24.4,-12.8,.4,.4,'steel','x');a.brk(-5,14,25,14);a.brk(33.7,-.5,33.7,1.5);a.dim(30,-12.6,30,0,'12" (VERIFY)',3);
  a.note(12,-12.3,'5/8" gyp. bd. soffit, finish to match ceiling').note(24.6,-12.6,'Corner bead').note(10,-8.4,'Steel stud ceiling joists @ 16" o.c.').note(22,8,'Steel stud framing to structure above')
   .note(12,8.3,'Diagonal brace to structure where required').note(28,.4,'Wall angle + acoustical ceiling').note(-.3,-4,'Gyp. bd. wall');}});

/* ------------------------------------------------------------ STRUCTURAL */
add({id:'sr-shear-tab',code:'SR-01',cat:'Structural',title:'Steel Beam to Column Shear Tab Connection',mat:'Steel',asm:'Connection',sc:'1',views:'ELEVATION',
kw:'steel beam column shear tab single plate connection bolts weld wide flange structural',
draw(K){const k=SC['1'][1],a=K(k,117,320);
  a.rect(-6,-8,12,34,'white','h');a.ln(-5.4,-8,-5.4,26,'m');a.ln(5.4,-8,5.4,26,'m');a.brk(-7,26,7,26);a.brk(-7,-8,7,-8);
  a.rect(6,4.5,4.5,9,'white','h');a.rect(6.5,0,33.5,.6,'white','h');a.rect(6.5,17.4,33.5,.6,'white','h');a.ln(6.5,.6,6.5,17.4,'m');a.ln(6.5,.6,40,.6,'l');a.ln(6.5,17.4,40,17.4,'l');a.brk(40,-1,40,19);
  [6,9,12].forEach(y=>a.circ(8.25,y,.4375,'white','m'));a.poly([[6,13.5],[6,12.7],[6.8,13.5]],'seal','x');a.poly([[6,4.5],[6,5.3],[6.8,4.5]],'seal','x');
  a.dim(8.25,6,8.25,9,'3"',-3.6);a.dim(8.25,9,8.25,12,'3"',-3.6);a.dim(6,17.4,6.5,17.4,'1/2"',3);
  a.note(0,20,'Steel column, size per structural').note(9,4.8,'Shear plate (single plate) shop welded to column').note(8.25,12,'High-strength bolts, size + count per structural').note(6.4,13.4,'Fillet weld both sides per structural')
   .note(25,17.6,'Steel beam, size per structural').note(25,9,'Connection design by structural engineer of record or delegated connection engineer');}});

add({id:'sr-lintel-veneer',code:'SR-02',cat:'Structural',title:'Steel Lintel at Brick Veneer Opening',mat:'Steel / Masonry',asm:'Lintel',sc:'3',
kw:'steel lintel angle brick veneer opening flashing end dam weep loose lintel masonry head',
draw(K){const k=SC['3'][1],a=K(k,230,324);
  a.rect(-3.625,.375,3.625,10,'brick','m');for(let y=.375+2.667;y<10;y+=2.667)a.ln(-3.625,y,0,y,'l');a.rect(0,0,1,10.4,'none','l');a.rect(1,0,2,10.4,'rigid','l');a.rect(3,-4,.5,14.4,'ply','l');a.ln(2.98,-4,2.98,10.4,'l','wrb');a.rect(3.5,-4,6,14.4,'white','l');a.blk1(3.5,-.1,6,2);
  a.pl([[-3.625,.375],[-3.625,0],[0,0]],'h');a.ln(0,0,0,3.5,'h');a.pl([[-3.9,-.15],[-3.6,.15],[-.2,.15],[-.2,.3],[.3,.3],[2.9,2.6],[2.9,4.5]],'h');a.rect(-1.9,.4,.4,2.2,'white','l');
  a.rect(-3.5,-1.2,7,1,'white','m');a.circ(-2.5,-.4,.18,'white','l');a.rect(-2.9,-.18,.8,.18,'seal','x');a.rect(-.2,-3.2,3.2,2,'white','h');a.brk(-4.5,10.4,10,10.4);a.brk(-1,-3.2,4,-3.2);
  a.note(-2,5,'Brick veneer').note(-1.7,1.5,'Open head joint weeps @ 24" o.c. max. over lintel').note(0,2,'Steel angle lintel, size + bearing per structural, galvanized').note(-3.75,0,'Through-wall flashing with drip edge + end dams').note(1.5,7,'Air space + rigid insulation')
   .note(3.25,8,'Sheathing + air/water barrier, lapped over flashing').note(6,1,'Steel stud header per structural').note(-2.2,-.1,'Sealant + backer rod at window head').note(1,-2,'Window head frame');}});

/* ------------------------------------------------------------ MEP COORDINATION */
add({id:'mep-plenum',code:'MP-01',cat:'MEP Coordination',title:'Ceiling Plenum Coordination Section',mat:'Multiple',asm:'Coordination',sc:'34',views:'BROKEN SECTION',
kw:'mep coordination plenum duct sprinkler light fixture ceiling height clash structure beam',
draw(K){const k=SC['34'][1],a=K(k,40,980),f=K(k,40,505);
  a.rect(0,144,72,4.5,'conc');deck(a,0,72,141,3,12);
  a.poly([[26,141],[33.5,141],[33.5,140.4],[30.05,140.4],[30.05,123.6],[33.5,123.6],[33.5,123],[26,123],[26,123.6],[29.45,123.6],[29.45,140.4],[26,140.4]],'white','m');
  a.rect(40,112,24,14,'white','h');a.ln(40,112,64,126,'l');a.ln(40,126,64,112,'l');a.rect(39,111,26,16,'none','l','hid');
  a.circ(10,130,2,'white','h');a.pl([[10,128],[10,110],[12,110]],'m');a.circ(68,134,1.6,'white','h');
  a.rect(14,108.75,10,4.5,'white','m');a.rect(0,108,72,.75,'act','l');[4,36,70].forEach(x=>a.ln(x,108.75,x,141,'x','hid'));a.ln(29.75,123,29.75,105,'l','cen');
  a.brk(0,105,0,149);a.brk(72,105,72,149);a.dim(72,108.75,72,123,'MEP ZONE',4.5);a.dim(72,123,72,141,'STRUCTURE',4.5);
  f.rect(0,-6,72,6,'conc');f.ln(0,0,72,0,'h');f.brk(0,-7,0,1);f.brk(72,-7,72,1);f.ln(36,0,36,10,'l','hid');f.txt(36,12,'FLOOR TO CEILING PER ARCHITECTURAL (VERIFY)',9,'middle',700);
  a.note(31,133,'Steel beam: lowest structure sets the ceiling zone').note(62,119,'Supply duct, size per mechanical; keep clear of beam').note(10,132,'Sprinkler main + branch, per fire protection (NFPA 13)').note(68,135.6,'Plumbing / drain line: slope governs, route first')
   .note(20,113.2,'Light fixture, depth per electrical').note(50,108.4,'Acoustical ceiling').note(4,125,'Hanger wires independent of ducts + pipes').note(50,146,'Conc. slab on steel deck').note(45,104.5,'Coordinate in 3D model / clash detection before construction');
  f.note(50,-3,'Floor slab');}});

/* ------------------------------------------------------------ SITE */
add({id:'si-curb-sidewalk',code:'SI-01',cat:'Site',title:'Concrete Curb + Gutter at Sidewalk',mat:'Concrete',asm:'Curb + walk',sc:'1',
kw:'curb gutter sidewalk paving expansion joint cross slope base course asphalt site concrete',
draw(K){const k=SC['1'][1],a=K(k,287,215);
  a.rect(-32,-24,58,10,'earth','x');a.rect(-32,-14,58,2,'grav');a.rect(-32,-12,8,4,'grav');a.rect(6.5,-12,19.5,8,'grav');a.poly([[-32,-5.15],[-24,-5],[-24,-8],[-32,-8]],'sand','m');
  a.poly([[-24,-5],[-.5,-6],[0,-.25],[.25,0],[6,0],[6,-12],[-24,-12]],'conc');a.rect(6,-4,.5,4,'seal','x');a.poly([[6.5,-4],[26,-3.6],[26,.4],[6.5,0]],'conc');
  a.brk(-32,-24,-32,-4);a.brk(26,-24,26,1.2);a.dim(-.5,-6,-.5,0,'6" REVEAL',-3.5);a.dim(-24,-5,0,-5,'24" GUTTER',8);
  a.note(-28,-5.4,'Asphalt paving on base').note(-12,-9,'Conc. curb + gutter').note(6.25,-2,'1/2" preformed expansion joint + sealant').note(18,.3,'Conc. sidewalk, cross slope 1:48 (2%) max. toward curb')
   .note(16,-8,'Compacted aggregate base').note(0,-20,'Compacted subgrade').note(-20,-13,'Curb + gutter shape varies: use the local DOT / city standard detail');}});

add({id:'si-pipe-bollard',code:'SI-02',cat:'Site',title:'Concrete-Filled Steel Pipe Bollard',mat:'Steel / Concrete',asm:'Bollard',sc:'12',
kw:'bollard pipe bollard concrete filled steel post footing site protection vehicle barrier',
draw(K){const k=SC['12'][1],a=K(k,215,250);
  a.rect(-20,-46,46,40,'earth','x');a.rect(-20,-6,46,6,'conc');a.rect(-5.7,-42,18,36,'conc');a.rect(0,-36,6.625,78,'conc','h');a.ln(.3,-36,.3,42,'l');a.ln(6.325,-36,6.325,42,'l');
  const dome=[];for(let t=0;t<=Math.PI;t+=Math.PI/12)dome.push([3.31+3.31*Math.cos(t),42+2.5*Math.sin(t)]);a.poly(dome,'conc','h');
  a.rect(-5.95,-42,.25,42,'seal','x');a.brk(-20,-46,-20,0);a.brk(26,-46,26,0);a.dim(10,0,10,42,'36"-48" TYP. (VERIFY)',6);a.dim(-5.7,-42,12.3,-42,'DIA. PER STRUCTURAL',-3);
  a.note(3.3,44,'Conc. dome cap').note(6.5,30,'Steel pipe, size per design, paint or cover per spec').note(3.3,10,'Conc. fill').note(-3,-6,'Paving with isolation joint at footing').note(9,-20,'Conc. footing, depth per structural / impact rating').note(16,-35,'Locate clear of utilities');}});

/* ------------------------------------------------------------ FIRE / LIFE SAFETY */
add({id:'fl-head-of-wall',code:'FL-01',cat:'Fire / Life Safety',title:'Fire-Rated Head-of-Wall Joint at Steel Deck',mat:'Gypsum / Mineral wool',asm:'Rated joint',sc:'3',
kw:'head of wall fire rated joint deflection track mineral wool spray firestop ul 2079 steel deck rated partition',
draw(K){const k=SC['3'][1],a=K(k,210,240);
  a.poly([[-6,0],[-1.5,0],[-.75,3],[5.1,3],[5.875,0],[10,0],[10,6.5],[-6,6.5]],'conc');a.pl([[-6,0],[-1.5,0],[-.75,3],[5.1,3],[5.875,0],[10,0]],'h');a.poly([[-1.5,0],[-.75,3],[5.1,3],[5.875,0]],'mw','m');
  a.pl([[0,-2.5],[0,-.05],[3.625,-.05],[3.625,-2.5]],'h');a.ln(.15,-10,.15,-.75,'l','hid');a.ln(3.47,-10,3.47,-.75,'l','hid');a.batt(.2,-10,3.25,9.1);
  a.rect(-.625,-10,.625,9.25,'gyp','l');a.rect(3.625,-10,.625,9.25,'gyp','l');a.rect(-.625,-.75,.625,.75,'mw','l');a.rect(3.625,-.75,.625,.75,'mw','l');
  a.pl([[-.72,-1.9],[-.72,-.03],[-1.7,-.03]],3.2);a.pl([[4.34,-1.9],[4.34,-.03],[5.3,-.03]],3.2);a.brk(-1,-10,5,-10);a.brk(-6,-.5,-6,7);a.brk(10,-.5,10,7);a.dim(-.625,-.75,-.625,0,'3/4" MAX.',-3);
  a.note(2,1.5,'Mineral wool packed tight into deck flute').note(1.8,-.05,'Deep-leg deflection track, fasten to deck per listing').note(-.72,-1,'Fire-rated spray / sealant over joint, both sides').note(-.3,-.4,'Compressed mineral wool in deflection gap')
   .note(1.8,-6,'Rated partition per listed design (UL or equal)').note(-.3,-8,'Type X gyp. bd. per listed design').note(3,5,'Conc. on steel deck').note(9,2,'Use one listed joint system (UL 2079): do not mix products');}});

add({id:'fl-pipe-penetration',code:'FL-02',cat:'Fire / Life Safety',title:'Metallic Pipe Penetration Firestop - Rated Wall',mat:'Gypsum / Firestop',asm:'Penetration',sc:'3',
kw:'firestop penetration pipe through rated wall annular space sealant mineral wool through penetration ul listed system',
draw(K){const k=SC['3'][1],a=K(k,205,275);
  a.rect(0,1.7,.625,7.3,'gyp','l');a.rect(0,-9,.625,7.3,'gyp','l');a.rect(4.25,1.7,.625,7.3,'gyp','l');a.rect(4.25,-9,.625,7.3,'gyp','l');a.ln(.7,8,4.2,8,'l','hid');a.ln(.7,-8,4.2,-8,'l','hid');
  a.rect(.625,1.19,3.625,.51,'mw','m');a.rect(.625,-1.7,3.625,.51,'mw','m');a.rect(-6,-1.1875,16,2.375,'white','h');a.ln(-6,.95,10,.95,'l');a.ln(-6,-.95,10,-.95,'l');
  [[0,1],[0,-1],[4.875,1],[4.875,-1]].forEach(([x,s])=>{const o=x?1:-1;a.poly([[x,s*1.19],[x,s*1.7],[x+o*.55,s*1.7],[x+o*.55,s*1.19+s*.0],[x+o*1.0,s*1.19]],'seal','x');});
  a.brk(-6,-2,-6,2);a.brk(10,-2,10,2);a.brk(-.5,9,5.4,9);a.brk(-.5,-9,5.4,-9);a.dim(4.875,1.19,4.875,1.7,'ANNULAR SPACE',3);
  a.note(-3,1.19,'Steel / copper pipe').note(-.3,1.6,'Firestop sealant, depth + bead per listed system, both sides').note(2.4,1.45,'Mineral wool packing, depth per listed system').note(.3,5,'Rated gyp. wall per listed design')
   .note(4.9,1.45,'Annular space min./max. per listed system').note(2.4,-8,'Studs beyond').note(5,-1.45,'Use a listed through-penetration system (F + T ratings, UL / Intertek)');}});

/* ------------------------------------------------------------ TYPICAL DETAILS */
add({id:'ty-partition-types',code:'TY-01',cat:'Typical Details',title:'Typical Interior Partition Types - Plan',mat:'Steel stud / Gypsum',asm:'Wall types',sc:'112',views:'PLAN',
kw:'partition types wall types steel stud gypsum sound batt rated wall type tag plan typical',
draw(K){const k=SC['112'][1];const rows=[['A',3.625,1,false,480],['B',3.625,1,true,330],['C',6,2,true,180]];
  rows.forEach(([t,d,n,ins,oy])=>{const a=K(k,40,oy),g=.625*n,T=d+2*g;for(let i=0;i<n;i++){a.rect(0,i*.625,30,.625,'gyp','l');a.rect(0,g+d+i*.625,30,.625,'gyp','l');}
    if(ins)a.batt(0,g+.1,30,d-.2,'h');[4,20].forEach(x=>cstud(a,x,g,d,1.625,false));a.brk(0,-1,0,T+1);a.brk(30,-1,30,T+1);
    a.raw(`<polygon points="${a.X(33)},${a.Y(T/2)} ${a.X(34)},${a.Y(T/2)+8} ${a.X(36)},${a.Y(T/2)+8} ${a.X(37)},${a.Y(T/2)} ${a.X(36)},${a.Y(T/2)-8} ${a.X(34)},${a.Y(T/2)-8}" fill="#fff" stroke="#111" stroke-width="1.2"/>`).txt(35,T/2-.3,t,10,'middle',700);
    a.note(4.5,g+d/2,t==='A'?'Type A: 3 5/8" steel studs @ 16" o.c., 5/8" gyp. bd. each side':t==='B'?'Type B: Type A + sound attenuation batts + acoustical sealant, STC per tested assembly':'Type C: 6" studs, 2 layers 5/8" Type X each side; fire rating only per a listed design (UL or equal)');
    a.note(12,T-.3,'Gyp. bd.');});}});

window.DrawUpDetailCatalog=D;
})();
