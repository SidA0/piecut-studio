const $=id=>document.getElementById(id);
const API_BASE='http://127.0.0.1:8765';
const apiUrl=route=>API_BASE+route;
let engineReady=false;
let connectionChecking=false,pendingAnalysis=false;
async function checkConnection(){
  if(connectionChecking)return;
  connectionChecking=true;
  if(!engineReady)$('connection-message').textContent='Checking for the local engine at 127.0.0.1:8765…';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),4000);
  try{
    const response=await fetch(apiUrl('/api/health'),{cache:'no-store',signal:controller.signal});
    const result=await response.json();
    if(!response.ok||result.status!=='ready')throw Error('CAD engine unavailable');
    engineReady=true;
    $('engine-status').textContent='LOCAL CAD ENGINE READY';
    $('connection-message').textContent='Connected. Choose a STEP or STP file below.';
    $('connection-message').classList.add('ready');
    if(pendingAnalysis&&encoded){pendingAnalysis=false;analyze()}
  }catch(error){
    engineReady=false;
    $('engine-status').textContent='DIRECT CONNECTION UNAVAILABLE';
    $('connection-message').textContent='Start the companion on this computer. This page checks again automatically. If your browser blocks the connection, use Open local workspace below.';
    $('connection-message').classList.remove('ready');
  }finally{
    clearTimeout(timeout);
    connectionChecking=false;
  }
}
$('retry-connection').addEventListener('click',checkConnection);
window.addEventListener('focus',()=>{if(!engineReady)checkConnection()});
setInterval(()=>{if(!engineReady&&document.visibilityState==='visible')checkConnection()},5000);
checkConnection();
let selectedFile=null,encoded=null,analysis=null,selectedBodies=null,counts=null,bendAngles=null,timer=null,revision=0,tradeOptions=[],tradeSelected=0,generatedTradeKey=null,generatedDownload=null;
const mm=n=>Number(n).toFixed(2),inch=n=>(Number(n)/25.4).toFixed(2);
const prec=n=>Number(n).toFixed(3);
function message(s,error=false){$('message').textContent=s;$('message').classList.toggle('error',error)}
function requestData(extra={}){return {filename:selectedFile.name,data:encoded,options:{max_angle:Number($('max-angle').value),selected_bodies:selectedBodies,segments:counts,bend_angles:bendAngles,jig:$('jig').checked,id_holes:$('id-holes').checked,trade_study:$('trade-study-toggle').checked,experimental_standard_radius:$('standard-radius').checked,profile_weight:Number($('profile-weight').value),...extra}}}
async function post(route,data){const response=await fetch(apiUrl(route),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result}
async function readFile(file){
  if(!file)return;
  if(timer){clearInterval(timer);timer=null}
  selectedFile=file;encoded=null;analysis=null;selectedBodies=null;counts=null;bendAngles=null;generatedTradeKey=null;generatedDownload=null;pendingAnalysis=false;revision++;
  $('generate').disabled=true;$('solve').disabled=true;$('results').classList.add('hidden');$('analysis').classList.add('hidden');$('bodies').classList.add('hidden');$('visualization').classList.add('hidden');$('trade-study').classList.add('hidden');$('progress-panel').classList.add('hidden');$('solver-results').innerHTML='';
  $('file-name').textContent=file.name;$('bend-controls').innerHTML='<p>Detecting bodies and bends…</p>';
  if(!/\.(step|stp)$/i.test(file.name)){message('Choose a STEP or STP file.',true);return}
  if(file.size>50*1024*1024){message('File exceeds the 50 MB limit.',true);return}
  message('Reading CAD file…');
  try{const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));encoded=btoa(binary);if(engineReady)await analyze();else{pendingAnalysis=true;message('STEP file selected. Start the local CAD companion to analyze it. The page will continue automatically.')}}
  catch(e){message(e.message||String(e),true)}
}
async function analyze(){
  if(!encoded)return;const run=++revision;$('generate').disabled=true;$('solve').disabled=true;
  message('Inspecting selected tube bodies…');
  try{const result=await post('/api/analyze',requestData());if(run!==revision)return;analysis=result;
    if(!selectedBodies)selectedBodies=[...result.selected_body_ids];
    if(!counts||result.standardization)counts=result.counts_per_body.map(row=>[...row]);
    if(result.standardization)bendAngles=result.bend_angles_per_body;
    showBodies();showAnalysis();showBends();TubePreview.setData(result.preview);$('visualization').classList.remove('hidden');TubePreview.resize();renderTradeStudy(result.trade_study);return true;
  }catch(e){if(run===revision)message(e.message||String(e),true);return false}
}
function showBodies(){
  if(!analysis)return;
  $('bodies').innerHTML='<h3>STEP solids · '+analysis.bodies.length+' found</h3><p>Select the tubes to process. Unsupported solids stay excluded. Center coordinates help identify bodies in the original CAD.</p>'+analysis.bodies.map(b=>`<label class="body-row ${b.supported?'':'unsupported'}"><input type="checkbox" data-body="${b.body}" ${selectedBodies.includes(b.body)?'checked':''} ${b.supported?'':'disabled'}><span><strong>${b.label}</strong><small>${b.supported?`${mm(b.outside_diameter_mm)} mm OD · ${mm(b.wall_mm)} mm wall · ${b.bend_count} bends · ${mm(b.centerline_length_mm)} mm path · center (${[0,1,2].map(i=>mm((b.bounds_mm[i]+b.bounds_mm[i+3])/2)).join(', ')}) mm`:b.error}</small></span></label>`).join('');
  $('bodies').classList.remove('hidden');
  $('bodies').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
    selectedBodies=[...$('bodies').querySelectorAll('input:checked')].map(el=>Number(el.dataset.body));counts=null;bendAngles=null;$('solver-results').innerHTML='';
    if(!selectedBodies.length){revision++;$('generate').disabled=true;$('solve').disabled=true;$('analysis').classList.add('hidden');$('visualization').classList.add('hidden');$('trade-study').classList.add('hidden');$('bend-controls').innerHTML='<p>Select at least one supported tube body.</p>';message('Select at least one supported tube body.',true);return}
    analyze();
  }));
}
function showAnalysis(){
  if(!analysis||!selectedBodies?.length)return;const a=analysis,m=a.plan_metrics;
  let warning='';if($('jig').checked&&a.jig_fit_issues.length){const i=a.jig_fit_issues[0];warning=`<p class="jig-warning">Body ${i.body}, piece ${i.piece}: ${mm(i.available_clamp_mm)} mm jig grip available; 7 mm needed. Reduce segments or turn off the jig.</p>`;$('generate').disabled=true;message('The experimental jig needs more grip on one or more pieces.',true)}
  else{$('generate').disabled=false;message('Ready. Adjust counts, run the shared cut solver, or generate the package.')}
  $('solve').disabled=$('id-holes').checked||$('standard-radius').checked;
  if($('id-holes').checked)message('Physical ID holes make every numbered part distinct; turn them off to optimize shared cut profiles.');
  const standard=a.standardization;
  const standardSummary=standard?`<div class="standard-summary"><h3>Experimental standard cuts</h3><div class="analysis-line"><span>Reusable middle pieces</span><strong>${standard.standard_piece_count}</strong></div><div class="analysis-line"><span>Custom end / transition pieces</span><strong>${standard.custom_pie_piece_count}</strong></div>${standard.families.map(f=>`<p><strong>R ${mm(f.radius_mm)} mm · ${f.pitch_deg?mm(f.pitch_deg)+'° pitch':'no shared middle cut'}</strong><br>${f.bends.join(', ')} · ${f.standard_piece_count} standard · ${f.end_piece_count} end · ${f.transition_piece_count} transition · ${f.standard_profile_count} middle profile${f.standard_profile_count===1?'':'s'}</p>`).join('')}${standard.short_piece_issues.length?`<p class="jig-warning">${standard.short_piece_issues.length} pieces have a chord shorter than the tube OD. Confirm laser handling and fit before ordering.</p>`:''}<small>The exact source end planes are retained. Standard cuts require matching OD, wall, chord, and both miter orientations.</small></div>`:'';
  $('analysis').innerHTML=`<h3>Selected geometry</h3><div class="analysis-line"><span>Tube bodies</span><strong>${a.selected_body_count} of ${a.bodies.length}</strong></div><div class="analysis-line"><span>Circular bends</span><strong>${a.bend_count}</strong></div><div class="analysis-line"><span>Current unique cuts</span><strong>${m?m.unique_cut_profiles:'—'}</strong></div><div class="analysis-line"><span>Current pie cuts</span><strong>${a.recommended_total_pie_cuts}</strong></div><div class="analysis-line"><span>Estimated centerline RMS</span><strong>${m?mm(m.centerline_rms_deviation_mm)+' mm':'—'}</strong></div>${standardSummary}${warning}`;
  $('analysis').classList.remove('hidden');
}
function showBends(){
  if(!analysis)return;const rows=[];
  analysis.selected_body_ids.forEach((body,bi)=>{
    rows.push(`<div class="bend-summary">Body ${body} · ${analysis.counts_per_body[bi].length} bends</div>`);
    analysis.bends.filter(b=>b.body===body).forEach(b=>{const sectors=bendAngles?.[bi]?.[b.bend-1];rows.push(`<label class="bend-row"><span><strong>Bend ${b.bend}</strong><small>R ${mm(b.radius_mm)} mm · ${mm(b.sweep_deg)}°${sectors?' · shared-pitch sectors: '+sectors.map(mm).join(', ')+'°':''}</small></span><input type="number" min="1" max="100" step="1" value="${b.recommended_segments}" data-body="${body}" data-bend="${b.bend-1}" aria-label="Segments for body ${body}, bend ${b.bend}"></label>`)});
  });
  $('bend-controls').innerHTML=rows.join('');
  $('bend-controls').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
    const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>100){message('Use a whole number from 1 to 100 for every bend.',true);$('generate').disabled=true;return}
    const next=counts.map(row=>[...row]);next[analysis.selected_body_ids.indexOf(Number(input.dataset.body))][Number(input.dataset.bend)]=n;counts=next;bendAngles=null;$('standard-radius').checked=false;$('id-holes').disabled=false;$('solver-results').innerHTML='';analyze();
  }));
}
async function solve(){
  if(!encoded||!selectedBodies?.length||$('standard-radius').checked)return;const run=revision;$('solve').disabled=true;$('solver-results').innerHTML='<p>Searching shared cut pitches across selected bends…</p>';
  try{const result=await post('/api/solve',requestData({segments:null,bend_angles:null,profile_weight:Number($('profile-weight').value),extra_segments:Number($('extra-segments').value)}));if(run!==revision)return;showSolutions(result);message(`Compared ${result.evaluated_plans} plans. Select one or keep editing individual bends.`)}
  catch(e){if(run===revision){$('solver-results').innerHTML='';message(e.message||String(e),true)}}finally{if(run===revision)$('solve').disabled=$('id-holes').checked||$('standard-radius').checked}
}
function showSolutions(result){
  const base=result.baseline;
  $('solver-results').innerHTML=`<p>Automatic plan: <strong>${base.unique_cut_profiles} profiles · ${base.total_pie_cuts} pie cuts</strong>. Searched ${result.evaluated_plans} plans. Counts are in bend order within each body.</p>`+result.alternatives.map((p,i)=>`<button type="button" class="solution" data-solution="${i}"><span><strong>${i===0?'Recommended':'Alternative '+(i+1)}${p.shared_pitch_deg?' · '+mm(p.shared_pitch_deg)+'° shared pitch':''}</strong><small>${p.counts.map((row,bi)=>`B${selectedBodies[bi]}: ${row.join(', ')}`).join(' · ')}</small></span><span><strong>${p.unique_cut_profiles} profiles</strong><small>${p.total_pie_cuts} pie cuts · RMS ${mm(p.centerline_rms_deviation_mm)} mm<br>Max ${mm(p.centerline_max_deviation_mm)} mm · length Δ ${mm(p.centerline_length_delta_mm)} mm</small></span></button>`).join('');
  $('solver-results').querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{const plan=result.alternatives[Number(button.dataset.solution)];counts=plan.counts.map(row=>[...row]);bendAngles=plan.bend_angles_deg;analyze()}));
}
function renderTradeStudy(study){
  if(!study?.options?.length){$('trade-study').classList.add('hidden');tradeOptions=[];return}
  tradeOptions=study.options;tradeSelected=Math.max(0,tradeOptions.findIndex(o=>o.current));
  const left=70,right=595,top=27,bottom=280;
  const welds=tradeOptions.map(o=>o.weld_length_mm),errors=tradeOptions.map(o=>o.centerline_rms_deviation_mm);
  const minX=Math.min(...welds),maxX=Math.max(...welds),padX=Math.max((maxX-minX)*.08,1);
  const loX=minX-padX,hiX=maxX+padX,hiY=Math.max(...errors)*1.16||.001;
  const x=v=>left+(v-loX)/(hiX-loX)*(right-left),y=v=>bottom-v/hiY*(bottom-top);
  const ticks=[0,.25,.5,.75,1];
  const grid=ticks.map(t=>`<line x1="${left}" y1="${y(hiY*t)}" x2="${right}" y2="${y(hiY*t)}" stroke="#35505c" stroke-dasharray="3 5"/><text x="${left-9}" y="${y(hiY*t)+4}" text-anchor="end" fill="#a8bbc2" font-size="11">${prec(hiY*t)}</text><line x1="${x(loX+(hiX-loX)*t)}" y1="${top}" x2="${x(loX+(hiX-loX)*t)}" y2="${bottom}" stroke="#273f49"/><text x="${x(loX+(hiX-loX)*t)}" y="${bottom+18}" text-anchor="middle" fill="#a8bbc2" font-size="11">${Math.round(loX+(hiX-loX)*t)}</text>`).join('');
  const line=tradeOptions.map((o,i)=>`${i?'L':'M'} ${x(o.weld_length_mm)} ${y(o.centerline_rms_deviation_mm)}`).join(' ');
  const points=tradeOptions.map((o,i)=>`<g class="trade-point" data-option="${i}" tabindex="0" role="button" aria-label="${o.label}, ${mm(o.weld_length_mm)} millimeters weld, ${prec(o.centerline_rms_deviation_mm)} millimeters RMS error"><circle cx="${x(o.weld_length_mm)}" cy="${y(o.centerline_rms_deviation_mm)}" r="${o.current?10:8}" fill="${o.current?'#83c6b4':'#e49a5a'}" stroke="#0e1c25" stroke-width="2"/><text x="${x(o.weld_length_mm)}" y="${y(o.centerline_rms_deviation_mm)-15}" text-anchor="middle" fill="#edf1ee" font-size="11">${i+1}</text></g>`).join('');
  $('trade-chart').innerHTML=`${grid}<path d="${line}" fill="none" stroke="#9aabb3" stroke-width="2"/><line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#78909b"/><line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#78909b"/>${points}<text x="330" y="323" text-anchor="middle" fill="#d5e0e3" font-size="12">Estimated full weld length (mm) →</text><text transform="translate(15 155) rotate(-90)" text-anchor="middle" fill="#d5e0e3" font-size="12">Centerline RMS error (mm) →</text>`;
  $('trade-rows').innerHTML=tradeOptions.map((o,i)=>`<tr data-option="${i}"><td>${i+1}. ${o.label}</td><td>${o.total_pie_cuts}</td><td>${o.unique_cut_profiles}</td><td>${mm(o.weld_length_mm)} mm</td><td>${prec(o.centerline_rms_deviation_mm)} mm</td><td>${prec(o.centerline_max_deviation_mm)} mm</td><td>${prec(o.centerline_length_delta_mm)} mm</td><td><button type="button" data-generate="${i}">Generate STEP ↗</button></td></tr>`).join('');
  $('trade-chart').querySelectorAll('[data-option]').forEach(el=>{el.addEventListener('click',()=>showTradeOption(Number(el.dataset.option)));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showTradeOption(Number(el.dataset.option))}})});
  $('trade-rows').querySelectorAll('tr').forEach(row=>row.addEventListener('click',()=>showTradeOption(Number(row.dataset.option))));
  $('trade-rows').querySelectorAll('[data-generate]').forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();applyTradeOption(Number(button.dataset.generate),true)}));
  $('trade-study').classList.remove('hidden');showTradeOption(tradeSelected);
}
function showTradeOption(index){
  tradeSelected=index;const o=tradeOptions[index];if(!o)return;
  $('trade-chart').querySelectorAll('[data-option]').forEach(el=>el.classList.toggle('selected',Number(el.dataset.option)===index));
  $('trade-rows').querySelectorAll('tr').forEach(row=>row.classList.toggle('selected',Number(row.dataset.option)===index));
  $('trade-detail').innerHTML=`<p class="kicker">OPTION ${index+1}${o.current?' · CURRENT PLAN':''}</p><h3>${o.label}</h3><strong>${prec(o.centerline_rms_deviation_mm)} mm RMS error</strong><p>${mm(o.weld_length_mm)} mm full weld · ${o.joint_count} joints · ${o.total_pie_cuts} pie cuts · ${o.unique_cut_profiles} custom profiles</p><p>Path length Δ: ${prec(o.centerline_length_delta_mm)} mm (pie-piece centerlines minus original tube centerline)</p><p class="trade-counts">${o.counts.map((row,bi)=>`Body ${selectedBodies[bi]}: ${row.join(', ')||'straight only'}`).join('<br>')}</p><button type="button" id="trade-use" class="secondary">Use this resolution</button><button type="button" id="trade-generate" class="primary">Generate this STEP package ↗</button>`;
  $('trade-use').addEventListener('click',()=>applyTradeOption(index,false));$('trade-generate').addEventListener('click',()=>applyTradeOption(index,true));
  if(generatedDownload&&JSON.stringify([o.counts,o.bend_angles_deg])===generatedTradeKey){const link=document.createElement('a');link.href=generatedDownload;link.className='trade-download';link.textContent='Download generated STEP ZIP ↓';$('trade-detail').appendChild(link)}
}
async function applyTradeOption(index,generateAfter){
  const option=tradeOptions[index];if(!option)return;
  if(!option.current){$('standard-radius').checked=false;$('id-holes').disabled=false}
  counts=option.counts.map(row=>[...row]);bendAngles=option.bend_angles_deg;$('solver-results').innerHTML='';
  const ready=await analyze();
  if(generateAfter&&ready){if($('generate').disabled)message('This resolution needs different jig settings before STEP generation.',true);else generate()}
}
async function generate(){
  if(!encoded||!selectedBodies?.length)return;$('generate').disabled=true;$('results').classList.add('hidden');$('progress-panel').classList.remove('hidden');updateProgress({phase:'Starting CAD worker',percent:0});message('Generating selected bodies and a shared cut schedule…');
  try{const start=await post('/api/generate',requestData());const id=start.job_id;
    timer=setInterval(async()=>{try{const response=await fetch(apiUrl(`/api/jobs/${id}`));const job=await response.json();if(job.progress)updateProgress(job.progress);if(job.status==='working')return;clearInterval(timer);timer=null;$('generate').disabled=false;
      if(job.status==='error'){updateProgress({phase:'Generation failed',percent:Number($('job-progress').value)});message(job.error,true);return}updateProgress({phase:'Package ready',percent:100});render(job.report,job.download);message('Package ready. The ZIP includes one complete positioned STEP assembly and all individual pieces.')}
      catch(e){clearInterval(timer);timer=null;$('generate').disabled=false;message(e.message,true)}},1200);
  }catch(e){$('generate').disabled=false;$('progress-panel').classList.add('hidden');message(e.message,true)}
}
function updateProgress(p){const percent=Math.round(Number(p.percent)||0);$('job-progress').value=percent;$('job-percent').textContent=percent+'%';$('job-stage').textContent=p.phase||'Working…';$('job-pieces').textContent=p.total?`${p.completed||0} of ${p.total} pieces cut`:''}
function render(r,download){
  download=apiUrl(download);
  $('download').href=download;const e=r.geometry_error,weld=r.weld.expected_full_circumference_mm;
  generatedTradeKey=JSON.stringify([r.segments_per_body,r.bend_angles_per_body]);generatedDownload=download;if(tradeOptions.length)showTradeOption(tradeSelected);
  const items=[['SELECTED BODIES',r.body_count,'tube solids'],['UNIQUE CUTS',r.unique_cut_profile_count,'shared profiles'],['TOTAL PIE CUTS',r.total_pie_cut_count,'pieces'],['TOTAL PARTS',r.piece_count,'incl. straights'],['EXPECTED WELD',mm(weld),'mm · '+inch(weld)+' in'],['CENTERLINE RMS ERROR',mm(e.centerline_rms_deviation_mm),'mm · max '+mm(e.centerline_max_deviation_mm)+' mm'],['OCCUPIED VOLUME ERROR',mm(e.occupied_volume_error_percent)+'%',mm(e.occupied_volume_error_mm3)+' mm³'],['SPLINE LENGTH DELTA',mm(e.centerline_length_delta_mm),'mm · '+inch(e.centerline_length_delta_mm)+' in']];
  if(r.standardization)items.push(['STANDARD MIDDLE CUTS',r.standardization.standard_piece_count,'reusable pieces'],['CUSTOM PIE CUTS',r.standardization.custom_pie_piece_count,'ends and transitions']);
  $('metrics').innerHTML=items.map(([label,value,unit])=>`<div class="metric"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`).join('');
  $('curve-count').textContent=`${r.curve_profiles.length} body profiles`;
  $('curves').innerHTML=r.curve_profiles.map(p=>`<tr><td>${p.profile}</td><td>${p.bends.join(', ')}</td><td>${mm(p.radius_mm)} mm</td><td>${mm(p.sweep_deg)}°</td><td>${p.segments_each}</td></tr>`).join('');
  $('cut-count').textContent=`${r.cut_profiles.length} shared types`;
  $('cuts').innerHTML=r.cut_profiles.map(p=>`<tr><td>${p.profile}</td><td>${p.quantity}</td><td>${p.positions.join(', ')}</td><td>${mm(p.chord_length_mm)} mm</td></tr>`).join('');
  $('result-footnote').textContent=`Open all_piecuts_assembly.step from the ZIP to see every selected body and separate pie piece in its original STEP position. Shared profiles match OD, wall, chord, bevels, and relative bevel orientation. Confirm interchangeability with the laser shop. Volume error is the wall-volume symmetric difference; thin walls can exceed 100%. ${r.jig.enabled?'An experimental jig is included for each selected body.':'Jigs off.'} ${r.standardization?'The ZIP includes standard_radius_schedule.csv with shared middle profile IDs, end pieces, and transitions.':''}`;
  $('results').classList.remove('hidden');$('results').scrollIntoView({behavior:'smooth',block:'start'});
}
$('file').addEventListener('change',e=>readFile(e.target.files[0]));
const drop=$('drop');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('drag')});drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');readFile(e.dataTransfer.files[0])});
$('max-angle').addEventListener('change',()=>{counts=null;bendAngles=null;$('solver-results').innerHTML='';if(encoded)analyze()});
$('trade-study-toggle').addEventListener('change',async()=>{if(!$('trade-study-toggle').checked){$('trade-study').classList.add('hidden');return}if(encoded&&await analyze())$('trade-study').scrollIntoView({behavior:'smooth',block:'start'})});
$('standard-radius').addEventListener('change',()=>{if($('standard-radius').checked)$('id-holes').checked=false;$('id-holes').disabled=$('standard-radius').checked;counts=null;bendAngles=null;$('solver-results').innerHTML='';if(encoded)analyze()});
$('jig').addEventListener('change',showAnalysis);
$('id-holes').addEventListener('change',showAnalysis);
$('profile-weight').addEventListener('input',()=>$('weight-value').textContent=$('profile-weight').value);
$('profile-weight').addEventListener('change',()=>{if(encoded&&$('standard-radius').checked)analyze()});
$('solve').addEventListener('click',solve);$('generate').addEventListener('click',generate);
