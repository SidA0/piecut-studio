(()=>{
  const $=id=>document.getElementById(id);
  const routeUrl=route=>typeof apiUrl==='function'?apiUrl(route):route;
  let file=null,data=null,analysis=null,poll=null;
  const say=(value,error=false)=>{const node=$('assembly-message');node.textContent=value;node.classList.toggle('error',error)};
  const fixed=n=>Number(n).toFixed(2);
  async function post(route,body){
    const response=await fetch(routeUrl(route),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'CAD request failed');return result;
  }
  function render(a){
    $('assembly-analysis').innerHTML=`<h3>Assembly geometry</h3><div class="analysis-line"><span>Separate pie-cut solids</span><strong>${a.piece_count}</strong></div><div class="analysis-line"><span>Matched weld seams</span><strong>${a.joint_count}</strong></div><div class="analysis-line"><span>Connected tube runs</span><strong>${a.connected_run_count}</strong></div><div class="analysis-line"><span>Open tube ends</span><strong>${a.open_end_count}</strong></div><div class="analysis-line"><span>Total outside weld length</span><strong>${fixed(a.outside_weld_length_mm)} mm · ${fixed(a.outside_weld_length_mm/25.4)} in</strong></div><p class="preview-note">${a.method} ${a.limitations}</p>`;
    $('assembly-analysis').classList.remove('hidden');
  }
  async function choose(selected){
    if(!selected)return;file=selected;data=null;analysis=null;$('assembly-generate').disabled=true;$('assembly-results').classList.add('hidden');$('assembly-analysis').classList.add('hidden');$('assembly-file-name').textContent=file.name;
    if(!/\.(step|stp)$/i.test(file.name)){say('Choose a STEP or STP file.',true);return}
    if(file.size>50*1024*1024){say('File exceeds the 50 MB limit.',true);return}
    say('Reading and matching assembly end faces…');
    try{
      const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)});
      data=encoded;analysis=await post('/api/assembly/analyze',{filename:file.name,data,options:{}});render(analysis);$('assembly-generate').disabled=false;say('Ready to generate the weld report'+($('assembly-jig').checked?' and contoured jig.':'.'));
    }catch(error){say(error.message,true)}
  }
  async function generate(){
    if(!data||!analysis)return;$('assembly-generate').disabled=true;$('assembly-results').classList.add('hidden');$('assembly-progress').classList.remove('hidden');say('Building the assembly package…');
    try{
      const started=await post('/api/assembly/generate',{filename:file.name,data,options:{jig:$('assembly-jig').checked}});
      const id=started.job_id;
      poll=setInterval(async()=>{
        try{
          const response=await fetch(routeUrl(`/api/jobs/${id}`),{cache:'no-store'});const result=await response.json();
          if(result.status==='working')return;
          clearInterval(poll);poll=null;$('assembly-progress').classList.add('hidden');$('assembly-generate').disabled=false;
          if(result.status==='error')throw Error(result.error||'Jig generation failed');
          const r=result.report;render(r);const link=routeUrl(result.download);
          $('assembly-results').innerHTML=`<div class="result-header"><div><p class="kicker">PACKAGE READY</p><h2>Weld plan + ${r.jigs.length} one-piece jig${r.jigs.length===1?'':'s'}</h2></div><a class="download" href="${link}">Download STEP + STL ZIP ↓</a></div><p>${r.joint_count} matched welds · ${fixed(r.outside_weld_length_mm)} mm (${fixed(r.outside_weld_length_mm/25.4)} in) total outside seam.</p>`;
          $('assembly-results').classList.remove('hidden');say('Assembly package ready.');
        }catch(error){if(poll){clearInterval(poll);poll=null}$('assembly-progress').classList.add('hidden');$('assembly-generate').disabled=false;say(error.message,true)}
      },1200);
    }catch(error){$('assembly-progress').classList.add('hidden');$('assembly-generate').disabled=false;say(error.message,true)}
  }
  document.querySelectorAll('[data-workflow]').forEach(button=>button.addEventListener('click',()=>{
    const assembly=button.dataset.workflow==='assembly';$('conversion-pane').classList.toggle('hidden',assembly);$('assembly-pane').classList.toggle('hidden',!assembly);
    document.querySelectorAll('[data-workflow]').forEach(b=>b.classList.toggle('active',b===button));
  }));
  $('assembly-file').addEventListener('change',event=>choose(event.target.files[0]));
  const drop=$('assembly-drop');drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragover')});drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragover');choose(event.dataTransfer.files[0])});
  $('assembly-generate').addEventListener('click',generate);
})();
