/* Orthographic OD projection. The fabrication STEP contains the exact solids. */
const TubePreview=(()=>{
  const canvas=document.getElementById('overlay-canvas'),ctx=canvas.getContext('2d');
  const colors=['#e49a5a','#83c6b4','#b8a9ea','#e2c779','#8eb9df'];
  let bodies=[],yaw=-.7,pitch=.58,zoom=1,center=[0,0,0],extent=1,drag=null;
  const source=document.getElementById('show-source'),pie=document.getElementById('show-pie'),opacity=document.getElementById('source-opacity');
  function project(p){
    const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2];
    const x1=Math.cos(yaw)*x-Math.sin(yaw)*y,y1=Math.sin(yaw)*x+Math.cos(yaw)*y;
    return [x1,Math.cos(pitch)*y1-Math.sin(pitch)*z,Math.sin(pitch)*y1+Math.cos(pitch)*z];
  }
  function setData(data){
    bodies=data||[];
    const points=bodies.flatMap(b=>b.source_points.concat(b.pie_nodes));
    if(points.length){const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1,2].map(i=>Math.max(...points.map(p=>p[i])));
      center=min.map((v,i)=>(v+max[i])/2);extent=Math.max(...max.map((v,i)=>v-min[i]))+4*Math.max(...bodies.map(b=>b.outer_radius_mm));}
    zoom=1;draw();
  }
  function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function draw(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#0e1c25';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(120,155,167,.09)';ctx.lineWidth=1;
    for(let x=0;x<w;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
    for(let y=0;y<h;y+=28){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    if(!bodies.length)return;
    const scale=Math.min(w,h)*.74/Math.max(extent,1)*zoom;
    const screen=p=>{const q=project(p);return [w/2+q[0]*scale,h/2-q[1]*scale,q[2]]};
    const path=points=>{ctx.beginPath();points.forEach((p,i)=>{const q=screen(p);if(i)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1])})};
    if(source.checked){for(const b of bodies){ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=`rgba(184,205,214,${Number(opacity.value)/100})`;ctx.lineWidth=Math.max(2,2*b.outer_radius_mm*scale);path(b.source_points);ctx.stroke();ctx.lineWidth=1.1;ctx.strokeStyle='rgba(222,239,244,.52)';path(b.source_points);ctx.stroke();}}
    if(pie.checked){
      const segments=[];
      bodies.forEach((b,bi)=>b.pie_nodes.slice(0,-1).forEach((p,i)=>segments.push({b,bi,p,q:b.pie_nodes[i+1],i,depth:(screen(p)[2]+screen(b.pie_nodes[i+1])[2])/2})));
      segments.sort((a,b)=>a.depth-b.depth);
      for(const s of segments){const a=screen(s.p),b=screen(s.q),width=Math.max(2,1.7*s.b.outer_radius_mm*scale);ctx.lineCap='butt';ctx.strokeStyle=colors[s.bi%colors.length];ctx.globalAlpha=.86;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.globalAlpha=1;ctx.lineWidth=1.1;ctx.strokeStyle='rgba(24,39,47,.65)';ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
      for(const [bi,b] of bodies.entries())for(let i=1;i<b.pie_nodes.length-1;i++)ring(b.pie_nodes[i],b.pie_normals[i],b.outer_radius_mm,colors[bi%colors.length],screen);
    }
    ctx.fillStyle='#a8bdc5';ctx.font='11px DM Sans, sans-serif';ctx.fillText(`${bodies.length} selected tube${bodies.length===1?'':'s'} · ${bodies.reduce((n,b)=>n+b.piece_kind.length,0)} planned pieces`,16,h-15);
  }
  function ring(point,normal,r,color,screen){
    let ref=Math.abs(normal[2])<.9?[0,0,1]:[1,0,0];
    let u=cross(normal,ref),len=Math.hypot(...u);u=u.map(v=>v/len);const v=cross(normal,u);
    ctx.beginPath();for(let j=0;j<=20;j++){const t=2*Math.PI*j/20,p=point.map((x,i)=>x+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t))),q=screen(p);if(j)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1])}
    ctx.closePath();ctx.lineWidth=1.7;ctx.strokeStyle='#0e1c25';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle=color;ctx.stroke();
  }
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
  canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.008;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag[1])*.008));drag=[e.clientX,e.clientY];draw()});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.25,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));draw()},{passive:false});
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{const views={iso:[-.7,.58],xy:[0,0],xz:[0,Math.PI/2],yz:[Math.PI/2,Math.PI/2]};[yaw,pitch]=views[button.dataset.view];document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===button));draw()}));
  [source,pie,opacity].forEach(el=>el.addEventListener('input',draw));
  new ResizeObserver(resize).observe(canvas);
  return {setData,resize};
})();
