/* CityVetHub feature modules: vanilla JS + Appwrite TablesDB + one secure Function.
 * Records are never granted authority by changing frontend state.
 */
(function(){
 'use strict';
 const h=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const date=s=>s?new Date(s).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}):'—';
 const dateTime=s=>s?new Date(s).toLocaleString('en-PH'):'—';
 const userRoleLabel=r=>({owner:'Pet Owner',officer:'Field Officer',admin:'Administrator'}[r]||r||'Pet Owner');
 const iconFallback=(icon='fa-paw')=>`<span class="CV49_IMAGE_FALLBACK"><i class="fa-solid ${icon}"></i></span>`;
 const blank=(t='No records yet')=>`<div class="CV_EMPTY"><i class="fa-regular fa-folder-open"></i><p>${h(t)}</p></div>`;
 const pill=s=>`<span class="CV_PILL CV_${h(String(s||'pending').toLowerCase().replace(/[^a-z]/g,''))}">${h(s||'—')}</span>`;
 const action=(name,title,icon='fa-plus')=>`<button class="CV_BUTTON PRIMARY_ACTION" type="button" data-ctrl="${name}"><i class="fa-solid ${icon}"></i> ${h(title)}</button>`;
 const soft=(name,title,params='',icon='fa-arrow-right')=>`<button class="CV_BUTTON CV_SOFT" type="button" data-ctrl="${name}" ${params}><i class="fa-solid ${icon}"></i> ${h(title)}</button>`;
 const table=(columns,rows)=>`<div class="CV_TABLE_WRAP"><table class="CV_TABLE"><thead><tr>${columns.map(x=>`<th>${h(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${columns.length}">No matching records.</td></tr>`}</tbody></table></div>`;
 const tr=(cells)=>`<tr>${cells.map(x=>`<td>${x}</td>`).join('')}</tr>`;
 const header=(kicker,title,info,actions='')=>`<div class="CV_HEAD"><div><div class="CV_KICKER">${h(kicker)}</div><h2>${h(title)}</h2><p>${h(info)}</p></div><div class="CV_ACTION_BAR">${actions}</div></div>`;
 const panel=(inner)=>`<div class="CV_WORKSPACE"><div class="CV_MESSAGE" id="cvNotice" role="status" hidden></div>${inner}</div>`;
 const stats=(items)=>`<div class="CV_STATS">${items.map(i=>`<div class="CV_STAT"><span>${h(i[0])}</span><strong>${h(i[1])}</strong></div>`).join('')}</div>`;
 const safeDownload=(name,records)=>{
   const safeCell=v=>{let value=String(v??'');if(/^[\s]*[=+@\-]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};
   const csv=records.map(row=>row.map(safeCell).join(',')).join('\r\n');
   const obj=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=obj;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(obj),1000);
 };
 function modal(title,fields,callback){
   const wrap=document.createElement('div');wrap.className='CV_MODAL';wrap.innerHTML=`<div class="CV_MODAL_CARD" role="dialog" aria-modal="true"><div class="CV_MODAL_HEAD"><h3>${h(title)}</h3><button type="button" aria-label="Close" data-close><i class="fa-solid fa-xmark"></i></button></div><form class="CV_FORM">${fields.map(f=>{
     const common=`name="${h(f.key)}" ${f.required===false?'':'required'} ${f.max?`maxlength="${f.max}"`:''}`;
     if(f.type==='select')return `<label>${h(f.label)}<select ${common}>${(f.options||[]).map(o=>`<option value="${h(o.value??o)}">${h(o.label??o)}</option>`).join('')}</select></label>`;
     if(f.type==='textarea')return `<label class="CV_WIDE">${h(f.label)}<textarea ${common} rows="3" placeholder="${h(f.placeholder||'')}"></textarea></label>`;
     return `<label>${h(f.label)}<input type="${f.type||'text'}" ${common} value="${h(f.value||'')}" ${f.min!==undefined?`min="${f.min}"`:''} ${f.maxValue!==undefined?`max="${f.maxValue}"`:''} ${f.step!==undefined?`step="${f.step}"`:''} placeholder="${h(f.placeholder||'')}"></label>`;
   }).join('')}<div class="CV_FORM_FOOT"><button type="button" class="CV_SOFT CV_BUTTON" data-close>Cancel</button><button type="submit" class="PRIMARY_ACTION CV_BUTTON">Save</button></div></form></div>`;
   const close=()=>wrap.remove();wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.closest('[data-close]'))close();});
   wrap.querySelector('form').addEventListener('submit',async e=>{
     e.preventDefault();const btn=wrap.querySelector('[type=submit]');btn.disabled=true;btn.textContent='Saving…';
     const data=Object.fromEntries(new FormData(e.target).entries());
     try{await callback(data);close();}catch(err){let n=wrap.querySelector('.CV_MODAL_ERROR');if(!n){n=document.createElement('p');n.className='CV_MODAL_ERROR';e.target.prepend(n);}n.textContent=err.message||'Unable to save';}finally{btn.disabled=false;btn.textContent='Save';}
   });document.body.append(wrap);wrap.querySelector('input,select,textarea')?.focus();return wrap;
 }
 function confirmAction({title,description,confirmLabel='Confirm',danger=false,onConfirm}){
   const overlay=document.createElement('div');overlay.className='CV_MODAL CV412_CONFIRM';
   overlay.innerHTML=`<div class="CV_MODAL_CARD CV412_CONFIRM_CARD" role="dialog" aria-modal="true" aria-labelledby="cv412ConfirmTitle"><div class="CV_MODAL_HEAD"><h3 id="cv412ConfirmTitle">${h(title)}</h3><button type="button" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><p class="CV412_CONFIRM_TEXT">${h(description)}</p><div class="CV412_CONFIRM_ERROR" role="alert" hidden></div><div class="CV412_CONFIRM_FOOT"><button type="button" class="CV_SOFT CV_BUTTON" data-close>Cancel</button><button type="button" class="CV_BUTTON ${danger?'CV412_DANGER':'PRIMARY_ACTION'}" data-confirm>${h(confirmLabel)}</button></div></div>`;
   const close=()=>overlay.remove();
   overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))close();});
   overlay.querySelector('[data-confirm]').addEventListener('click',async()=>{
     const button=overlay.querySelector('[data-confirm]');button.disabled=true;
     const label=button.textContent;button.textContent='Processing…';
     try{await onConfirm();close();}catch(error){const out=overlay.querySelector('.CV412_CONFIRM_ERROR');out.hidden=false;out.textContent=error?.message||'Unable to complete this action.';button.disabled=false;button.textContent=label;}
   });
   document.body.append(overlay);overlay.querySelector('[data-confirm]').focus();return overlay;
 }
 // DBSCAN with great-circle distance. Only confirmed cases are analyzed.
 const earthKm=(a,b)=>{const R=6371,r=Math.PI/180,dlat=(a.latitude-b.latitude)*r,dlng=(a.longitude-b.longitude)*r;const x=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlng/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(x)));};
 function dbscan(points,eps=1.5,minPts=3){
   const labels=new Array(points.length).fill(undefined),clusters=[];
   const neighbors=i=>points.map((p,j)=>earthKm(points[i],p)<=eps?j:-1).filter(j=>j>=0);
   points.forEach((_,i)=>{if(labels[i]!==undefined)return;const n=neighbors(i);if(n.length<minPts){labels[i]=-1;return;}const id=clusters.length;clusters.push([]);labels[i]=id;const queue=[...n],queued=new Set(queue);
     for(let cursor=0;cursor<queue.length;cursor++){const j=queue[cursor];if(labels[j]===-1)labels[j]=id;if(labels[j]!==undefined&&labels[j]!==id)continue;labels[j]=id;const around=neighbors(j);if(around.length>=minPts)for(const k of around)if(!queued.has(k)){queue.push(k);queued.add(k);}}
   });labels.forEach((id,i)=>{if(id>=0)clusters[id].push(points[i]);});return clusters;
 }
 // Gaussian kernel density estimate rendered into an image layer over Leaflet.
 function kdeLayer(map,points){
   if(!points.length)return null;
   const b=map.getBounds(),width=160,height=125,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d'),img=ctx.createImageData(width,height);
   const xy=points.map(p=>({x:(p.longitude-b.getWest())/(b.getEast()-b.getWest())*width,y:(b.getNorth()-p.latitude)/(b.getNorth()-b.getSouth())*height}));
   let maximum=0;const density=new Float32Array(width*height),radius=16;
   for(const point of xy){const left=Math.max(0,Math.floor(point.x-radius*3)),right=Math.min(width,Math.ceil(point.x+radius*3)),top=Math.max(0,Math.floor(point.y-radius*3)),bottom=Math.min(height,Math.ceil(point.y+radius*3));for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const dx=x-point.x,dy=y-point.y;const val=Math.exp(-(dx*dx+dy*dy)/(2*radius*radius));density[y*width+x]+=val;}}
   for(const d of density)maximum=Math.max(maximum,d);
   for(let i=0;i<density.length;i++){
     const t=maximum?density[i]/maximum:0,off=i*4;
     if(t<0.04)continue;
     img.data[off]=Math.round(38+217*t);img.data[off+1]=Math.round(137-98*t);img.data[off+2]=Math.round(255-222*t);img.data[off+3]=Math.round(175*Math.sqrt(t));
   }
   ctx.putImageData(img,0,0);return window.L.imageOverlay(canvas.toDataURL(),b,{interactive:false,opacity:.68}).addTo(map);
 }
 function mount({api,current,container}){
   const cfg=api.config, admin=current.role==='admin', officer=current.role==='officer',owner=current.role==='owner';
   let active='',filter='',cache={},map=null,mapLayers=[];
   async function fetchTable(key){const tableId=cfg.tables[key];if(!tableId)throw Error('Unknown table '+key);
     const r=await api.tablesDB.listRows({databaseId:cfg.databaseId,tableId,queries:[window.Appwrite.Query.orderDesc('$createdAt'),window.Appwrite.Query.limit(100)]});return r.rows||[];}
   function message(text,kind='error'){const n=container.querySelector('#cvNotice');if(!n)return;n.hidden=!text;n.textContent=text;n.className='CV_MESSAGE '+(kind==='success'?'is-success':'is-error');}
   function view(s){
     if(map){map.remove();map=null;mapLayers=[];}
     const scroller=document.querySelector('.DASHBOARD_CONTENT')||document.documentElement;
     const scrollTop=scroller.scrollTop;
     const savedControls={};
     ['alertPriority','alertType','alertStatus','adoptionSpecies','adoptionHousing','adoptionBarangay'].forEach(id=>{
       const el=container.querySelector('#'+id);if(el)savedControls[id]=el.value;
     });
     container.innerHTML=panel(s);
     Object.entries(savedControls).forEach(([id,val])=>{
       const el=container.querySelector('#'+id);
       if(el&&val){el.value=val;setTimeout(()=>el.dispatchEvent(new Event('change')),0);}
     });
     scroller.scrollTop=scrollTop;
   }
   function image(fileId,cls='CV49_THUMB',fallback='fa-paw'){
     if(!fileId)return `<span class="${cls}">${iconFallback(fallback)}</span>`;
     let link='';try{link=String(api.storage.getFileView({bucketId:cfg.buckets.media,fileId}));}catch{}
     return `<span class="${cls}">${link?`<img src="${h(link)}" alt="Profile picture" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`:''}<span class="CV49_IMAGE_FALLBACK" ${link?'hidden':''}><i class="fa-solid ${fallback}"></i></span></span>`;
   }
   const petLabel=(pet)=>`${image(pet?.photoFileId,'CV49_THUMB')}<span class="CV49_PET_CELL"><strong>${h(pet?.petName||'Pet record')}</strong><small>${h(pet?.species||'')} · ${h(pet?.breed||'')}</small></span>`;
   const EXP_RE=/\s*\[Exp:\s*(\d{4}-\d{2}-\d{2})\]\s*$/i;
   const splitExpiry=(text,expiryCol)=>{const raw=String(text||'');const m=raw.match(EXP_RE);return{text:m?raw.replace(EXP_RE,'').trim():raw,expiryDate:expiryCol||(m?m[1]:'')};};
   const successMessageFor=act=>({
     createListing:'Listed successfully.',
     listOwnPetForAdoption:'Listed successfully.',
     applyAdoption:'Application submitted successfully.',
     confirmAdoptionTransfer:'Transferred successfully.',
     publishAlert:'Published successfully.',
     submitDisease:'Submitted successfully.',
     createUser:'Created successfully.',
     deleteManagedUser:'Deleted successfully.',
     deleteIdCategory:'Deleted successfully.',
     deleteOutbreak:'Deleted successfully.'
   }[act]||'Saved successfully.');
   function filtered(records,fields){return !filter?records:records.filter(r=>fields.some(k=>String(r[k]??'').toLowerCase().includes(filter)));}
   async function execute(action,payload){await api.operate(action,payload);await refresh(true);message(successMessageFor(action),'success');}
   function bind(fn){container.querySelectorAll('[data-ctrl]').forEach(b=>b.addEventListener('click',()=>fn(b.dataset.ctrl,b)));}
   function renderError(e){view(header('DATA CONNECTION','Unable to load '+active,'Unable to load records right now.')+`<div class="CV_ERROR">${h(api.readableError(e))}</div>`);}
   async function refresh(silent=false){
     if(!active)return;
     const prevNotice=container.querySelector('#cvNotice');
     const savedNotice=prevNotice&&!prevNotice.hidden?{text:prevNotice.textContent,kind:prevNotice.classList.contains('is-success')?'success':'error'}:null;
     if(!silent){
       if(map){map.remove();map=null;mapLayers=[];}
       container.innerHTML='<div class="CV_LOADING"><i class="fa-solid fa-rotate fa-spin"></i> Loading records…</div>';
     }
     try{
       switch(active){case 'medical':await medical();break;case 'surveillance':await surveillance();break;case 'alerts':await alerts();break;case 'adoptions':await adoptions();break;case 'traceability':await traceability();break;case 'users':await users();break;case 'reports':await reports();break;}
       if(silent&&savedNotice)message(savedNotice.text,savedNotice.kind);
     }catch(e){if(!silent)renderError(e);}
   }
   function close(){active='';if(map){map.remove();map=null;mapLayers=[];}}
   function open(key){const same=active===key&&container.querySelector('.CV_WORKSPACE');active=key;filter='';return refresh(Boolean(same));}
   function search(s){filter=s.toLowerCase().trim();if(active)refresh(true);}
   async function medical(){
     const [records,pets,profiles,uploads,staffDirectory]=await Promise.all([
       fetchTable('medical'),fetchTable('pets'),fetchTable('petProfiles').catch(()=>[]),
       owner?fetchTable('petHealthUploads').catch(()=>[]):Promise.resolve([]),
       (admin||officer)?api.operate('getStaffPetDirectory').catch(e=>{console.warn('Staff directory unavailable:',e.message);return {pets:[]};}):Promise.resolve({pets:[]})
     ]);
     const staffById=new Map((staffDirectory.pets||[]).map(p=>[p.$id,p]));
     const authorLookup=(admin||officer)&&records.length?await api.operate('resolveMedicalRecorders',{recordIds:records.slice(0,100).map(r=>r.$id)}).catch(e=>{console.warn('Medical recorder lookup unavailable:',e.message);return {recorders:[]};}):{recorders:[]};
     const recorderByRecord=new Map((authorLookup.recorders||[]).map(r=>[r.recordId,r.recorderName]));
     cache.medical=records;cache.pets=pets;
     const profileById=new Map(profiles.map(p=>[p.$id,p]));
     const petById=new Map(pets.map(p=>[p.$id,p]));
     // A successful adoption changes CURRENT ownership, not the pet or medical IDs.
     // Never infer access to a pet from a historical medical-record permission.
     const ownedProfiles=profiles.filter(p=>p.ownerId===current.user.$id);
     const ownedVerified=pets.filter(p=>p.ownerId===current.user.$id&&
       (!p.petProfileId||profileById.get(p.petProfileId)?.ownerId===current.user.$id));
     const family=[...ownedProfiles,...ownedVerified.filter(p=>!ownedProfiles.some(q=>q.$id===p.petProfileId))];
     const currentPetIds=new Set([...ownedProfiles.map(p=>p.$id),...ownedVerified.map(p=>p.$id)]);
     const currentRecords=owner?records.filter(r=>currentPetIds.has(r.petId)):records;
     const visible=filtered(currentRecords,['petId','recordType','medicineType','description']);
     const selectedPets=new Set(currentRecords.map(r=>r.petId));
     const vaccinePets=new Set(currentRecords.filter(r=>r.recordType==='Vaccination').map(r=>r.petId));
     const byBarangay=new Map();
     for(const pet of owner?ownedVerified:pets){const place=pet.barangay||'Unspecified';const v=byBarangay.get(place)||{total:0,vaccinated:0};v.total++;if(vaccinePets.has(pet.$id)||vaccinePets.has(pet.petProfileId))v.vaccinated++;byBarangay.set(place,v);}
     const coverageRows=[...byBarangay].sort((a,b)=>a[0].localeCompare(b[0])).map(([place,v])=>tr([h(place),h(v.total),h(v.vaccinated),h(v.total?Math.round(v.vaccinated/v.total*100)+'%':'—')]));
     const petPhoto=pet=>profileById.get(pet?.petProfileId)?.photoFileId||pet?.photoFileId||'';
     const staffPhoto=(pet,cls='CV49_DIRECTORY_PHOTO')=>{
       const url=staffById.get(pet?.$id)?.imageUrl;
       return url?`<span class="${cls}"><img src="${h(url)}" alt="${h(pet.petName)} photo" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden class="CV49_IMAGE_FALLBACK"><i class="fa-solid fa-paw"></i></span></span>`:image(pet?.photoFileId||petPhoto(pet),cls);
     };
     const petRow=record=>petById.get(record.petId)||profileById.get(record.petId)||{petName:'Pet record',species:'',breed:''};
     const roster=owner?family:pets;
     view(header('CLINICAL WORKSPACE','Medical & Vaccination',owner?'Your pets and their authorized CVO records. Personal photo documents are shown separately from official medical records.':'Pet-centered CVO medical history, vaccinations and treatment activity.',(admin||officer)?action('addMedical','Record treatment','fa-notes-medical'):'')+
       
       `<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>${owner?'My pets':'Pet directory'}</h3><span>${roster.length} accessible pets</span></div><div class="CV49_PET_DIRECTORY">${roster.length?roster.map(p=>`<article class="CV49_DIRECTORY_CARD">${owner?image(p.photoFileId||petPhoto(p),'CV49_DIRECTORY_PHOTO'):staffPhoto(p)}<div><strong>${h(p.petName)}</strong><small>${h(p.species)} · ${h(p.breed)}</small><span>${h(p.barangay||'Barangay unspecified')}</span></div>${p.verificationStatus==='verified'||petById.has(p.$id)?pill('Verified'):pill('Personal profile')}</article>`).join(''):blank('Your pet records will appear here.')}</div></div>`+
       `<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>Official veterinary records</h3><span>CVO / authorized field staff entries</span></div>${table(['Pet','Record','Medicine / vaccine','Date','Expiry','Recorded by'],visible.map(r=>{const exp=splitExpiry(r.description,r.expiryDate).expiryDate;return tr([`<span class="CV49_CELL_FLEX">${owner?image(petPhoto(petRow(r)),'CV49_THUMB'):staffPhoto(petRow(r),'CV49_THUMB')}<span class="CV49_PET_CELL"><strong>${h(petRow(r).petName)}</strong><small>${h(petRow(r).breed||'')}</small></span></span>`,pill(r.recordType),h(r.medicineType),h(date(r.dateAdministered)),h(exp?date(exp):'—'),h(recorderByRecord.get(r.$id)||r.recorderNameSnapshot||(owner?'CVO staff':'Unknown staff member'))]);}))}</div>`+
       (owner?`<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>My uploaded health documents</h3><span>Personal evidence · not clinical certification</span></div><div class="CV49_DOC_GRID">${uploads.filter(x=>x.ownerId===current.user.$id&&currentPetIds.has(x.petProfileId)).map(x=>{const parsed=splitExpiry(x.title,x.expiryDate);return `<article class="CV49_DOC_CARD">${image(x.fileId,'CV49_DIRECTORY_PHOTO','fa-file-medical')}<div><strong>${h(parsed.text)}</strong><small>${h(date(x.recordDate))}${parsed.expiryDate?` · Expires ${h(date(parsed.expiryDate))}`:''}</small><span>${x.sharePublic?'Shared on QR with consent':'Private to your account'}</span></div></article>`;}).join('')||'<p class="CV_HINT">Add dated health documents from My Pets → View profile.</p>'}</div></div>`:'')+
       `<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>Vaccination records by barangay</h3><span>Accessible verified-pet sample</span></div>${table(['Barangay','Verified pets','With vaccination entry','Coverage'],coverageRows)}</div>`+
       '<p class="CV_HINT">Vaccination coverage is based on the presence of an accessible record, not whether a vaccine is clinically up to date. Views are limited to the first 100 accessible rows per table.</p>');
     bind(ctrl=>{if(ctrl==='addMedical')modal('Record official treatment',[
       {key:'petId',label:'Verified pet',type:'select',options:pets.map(p=>({value:p.$id,label:p.petName+' — '+p.ownerName}))},
       {key:'recordType',label:'Record type',type:'select',options:['Vaccination','Treatment']},
       {key:'medicineType',label:'Vaccine or treatment name',max:100},
       {key:'dateAdministered',label:'Date administered',type:'date',value:new Date().toISOString().slice(0,10)},
       {key:'expiryDate',label:'Expiry of vaccination / treatment (optional)',type:'date',required:false},
       {key:'description',label:'Clinical notes (optional)',type:'textarea',required:false,max:1000}
     ],d=>{const exp=String(d.expiryDate||'').trim(),desc=String(d.description||'').trim();return execute('addMedical',{...d,description:exp?`${desc?desc+' ':''}[Exp: ${exp}]`:desc,expiryDate:exp});});});
   }
   async function surveillance(){
     const staff=admin||officer;
     const [cases,reports]=await Promise.all([staff?fetchTable('diseaseIncidents'):Promise.resolve([]),fetchTable('diseaseReports')]);
     cache.cases=cases;cache.reports=reports.filter(r=>r.status!=='archived');
     const valid=cases.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>0&&p.longitude>0);
     const activeReports=reports.filter(r=>r.status!=='archived');
     const groups=dbscan(valid),visible=filtered(activeReports,['diseaseType','barangay','status','description']);
     view(header('SPATIAL INTELLIGENCE','Disease Surveillance','Leaflet map with confirmed incidents, KDE density estimates and DBSCAN cluster detection.',action('reportDisease','Report disease','fa-plus'))+
     stats([['Confirmed cases',valid.length],['DBSCAN clusters',groups.length],['Awaiting CVO review',activeReports.filter(r=>r.status==='pending').length]])+
     `<div class="CV_MAP_TOOLS"><span><i class="fa-solid fa-circle-info"></i> KDE Gaussian density • DBSCAN radius 1.5 km / minimum 3 cases</span><label><input type="checkbox" id="kdeToggle" checked> KDE heatmap</label><label><input type="checkbox" id="caseToggle" checked> Case markers</label></div><div id="surveillanceMap" class="CV_MAP"></div>`+
     '<div class="CV_LEGEND">Heat intensity: <b class="CV_COLD"></b> Lower density <b class="CV_HOT"></b> Higher density. Cluster boundaries are indicative, not clinical diagnoses.</div>'+
     (`<div class="CV_SECTION"><h3>${staff?'Submitted disease reports':'Your submitted reports'}</h3>${table(['Disease','Barangay','Reported','Status','Actions'],visible.map(r=>tr([h(r.diseaseType),h(r.barangay),h(dateTime(r.reportedAt)),pill(r.status),admin&&r.status==='pending'?soft('confirmDisease','Confirm',`data-id="${h(r.$id)}"`,'fa-check')+' '+soft('rejectDisease','Reject',`data-id="${h(r.$id)}"`,'fa-xmark'):'—'])))}</div>`));
     if(window.L){
       map=window.L.map('surveillanceMap',{scrollWheelZoom:false}).setView([8.228,124.245],11);
       window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:18}).addTo(map);
       const markerGroup=window.L.layerGroup().addTo(map);
       for(const r of valid){window.L.circleMarker([r.latitude,r.longitude],{radius:6,color:'#234fdb',weight:2,fillColor:'#4791ff',fillOpacity:.9}).bindPopup(`<strong>${h(r.diseaseType)}</strong><br>${h(r.barangay)}<br>Confirmed ${h(date(r.confirmedAt))}`).addTo(markerGroup);}
       groups.forEach((group,i)=>{const center={lat:group.reduce((a,p)=>a+p.latitude,0)/group.length,lng:group.reduce((a,p)=>a+p.longitude,0)/group.length};window.L.circle([center.lat,center.lng],{radius:1500,color:'#e24f37',weight:2,fillColor:'#ffae8b',fillOpacity:.10}).bindTooltip(`Cluster ${i+1}: ${group.length} reports`).addTo(markerGroup);});
       let layer=null;const draw=()=>{if(layer)map.removeLayer(layer);layer=container.querySelector('#kdeToggle')?.checked?kdeLayer(map,valid):null;};
       const bound=valid.length?window.L.latLngBounds(valid.map(p=>[p.latitude,p.longitude])).pad(.4):null;
       if(bound?.isValid()&&valid.length>1)map.fitBounds(bound,{maxZoom:12});
       setTimeout(()=>{if(map){map.invalidateSize();draw();}},70);
       map.on('moveend',draw);container.querySelector('#kdeToggle')?.addEventListener('change',draw);
       container.querySelector('#caseToggle')?.addEventListener('change',e=>e.target.checked?map.addLayer(markerGroup):map.removeLayer(markerGroup));
     }else{container.querySelector('#surveillanceMap').textContent='Leaflet unavailable. Check internet access for the map library.';}
     bind((ctrl,b)=>{
       if(ctrl==='reportDisease')modal('Report animal incident',[
         {key:'diseaseType',label:'Suspected disease',type:'select',options:['Rabies','Canine Parvovirus','Ringworm']},
         {key:'barangay',label:'Barangay',max:100},
         {key:'latitude',label:'Latitude',type:'number',step:'any',placeholder:'8.228'},
         {key:'longitude',label:'Longitude',type:'number',step:'any',placeholder:'124.245'},
         {key:'description',label:'Description',type:'textarea',required:false,max:1000}
       ],d=>execute('submitDisease',d));
       if(['confirmDisease','rejectDisease'].includes(ctrl)){
         if(confirm('Review this disease report?'))execute('reviewDisease',{reportId:b.dataset.id,status:ctrl==='confirmDisease'?'confirmed':'rejected'}).catch(e=>message(e.message));
       }
     });
   }
   async function alerts(){
     const [records,categories]=await Promise.all([fetchTable(owner?'ownerAlerts':'diseaseAlerts'),fetchTable('incidentCategories').catch(()=>[])]);
     const visible=filtered(records,['title','message','barangay','diseaseType']);
     const activeCategories=categories.filter(c=>c.isActive).map(c=>c.name);
     const desc=owner?'Official CVO advisories that the administrator specifically chose to share with Pet Owners.':'Outbreak declarations are automatically visible to Field Officers. Administrators may notify Pet Owners separately.';
     view(header('VETERINARY PUBLIC HEALTH','Outbreak Alerts',desc,admin?action('publishAlert','Publish alert','fa-bullhorn'):'')+
       stats([['Alerts available',records.length],['Active advisories',records.filter(r=>r.isActive).length],['Declared outbreaks',records.filter(r=>r.isOutbreak&&r.isActive).length],['High priority',records.filter(r=>r.severity==='high'&&r.isActive).length]])+
       `<div class="CV49_ALERT_FILTERS"><label>Alert priority<select id="alertPriority"><option value="">All priorities</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Type<select id="alertType"><option value="">All alerts</option><option value="outbreak">Declared outbreak</option><option value="advisory">Health advisory</option></select></label><label>Status<select id="alertStatus"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></div>`+
       `<div class="CV49_ALERT_LIST" id="alertCards">${visible.length?visible.map(r=>`<article class="CV49_ALERT_CARD CV411_ALERT_CARD" data-severity="${h(r.severity)}" data-kind="${r.isOutbreak?'outbreak':'advisory'}" data-active="${r.isActive?'active':'inactive'}"><div class="CV49_ALERT_ICON"><i class="fa-solid ${r.isOutbreak?'fa-triangle-exclamation':'fa-bullhorn'}"></i></div><div class="CV49_ALERT_BODY"><div class="CV49_ALERT_BADGES">${pill(r.isOutbreak?'Declared outbreak':'Advisory')} ${pill(r.severity)} ${pill(r.isActive?'active':'inactive')} ${!owner?pill(r.notifyOwners?'Pet Owners notified':'Field Officers only'):''}</div><h3>${h(r.title)}</h3><p>${h(r.message)}</p><small><i class="fa-solid fa-location-dot"></i> ${h(r.barangay)} · ${h(r.diseaseType)} · ${h(date(r.issuedAt))}</small></div>${admin?`<div class="CV49_ALERT_ACTIONS">${!r.notifyOwners?soft('notifyOwners','Notify Pet Owners',`data-id="${h(r.$id)}"`,'fa-bell'):''}${r.isActive?soft('deactivateAlert','Deactivate',`data-id="${h(r.$id)}"`,'fa-ban'):''}${r.isOutbreak?soft('deleteOutbreak','Delete outbreak',`data-id="${h(r.$id)}"`,'fa-trash-can'):''}</div>`:''}</article>`).join(''):blank(owner?'No advisories have been sent to Pet Owners.':'No staff alerts or outbreaks have been published.')}</div>`+
       `<p class="CV_HINT">${owner?'Your app displays only owner-directed alerts.':'Field Officers receive every new CVO declaration in their accessible alerts feed. In-app updates work while logged in; mobile-device push notification delivery requires the Android app to configure Appwrite Push.'}</p>`);
     const filters=['alertPriority','alertType','alertStatus'].map(id=>container.querySelector('#'+id));
     const apply=()=>container.querySelectorAll('#alertCards .CV49_ALERT_CARD').forEach(card=>{card.hidden=!!(filters[0].value&&card.dataset.severity!==filters[0].value||filters[1].value&&card.dataset.kind!==filters[1].value||filters[2].value&&card.dataset.active!==filters[2].value);});
     filters.forEach(f=>f.addEventListener('change',apply));
     bind((c,b)=>{
       if(c==='publishAlert'){
         if(!activeCategories.length){message('Create an incident category under Incident Surveillance before publishing an alert.');return;}
         modal('Publish CVO health advisory',[
           {key:'title',label:'Headline',max:120},{key:'message',label:'Official message',type:'textarea',max:1500},
           {key:'diseaseType',label:'Incident category',type:'select',options:activeCategories},
           {key:'barangay',label:'Affected barangay',max:100},{key:'severity',label:'Alert priority',type:'select',options:['low','medium','high']},
           {key:'notifyOwners',label:'Notify Pet Owners too?',type:'select',options:[{value:'',label:'No — Field Officers only'},{value:'yes',label:'Yes — Pet Owners too'}]}
         ],d=>execute('publishAlert',{...d,notifyOwners:d.notifyOwners==='yes'}));
       }
       if(c==='deactivateAlert'&&confirm('Deactivate this official alert?'))execute('deactivateAlert',{alertId:b.dataset.id}).catch(e=>message(e.message));
       if(c==='deleteOutbreak'&&confirm('Permanently delete this outbreak declaration and its linked Pet Owner alert? This removes the active red boundary animation and cannot be undone.'))execute('deleteOutbreak',{alertId:b.dataset.id}).catch(e=>message(e.message));
       if(c==='notifyOwners'&&confirm('Publish this alert to Pet Owners as well?'))execute('notifyPetOwners',{alertId:b.dataset.id}).catch(e=>message(e.message));
     });
   }
   async function adoptions(){
     const [listings,applications,ownerPets,verifiedPets,ownersIncoming,matchingPrefs,matchingAlerts]=await Promise.all([
       fetchTable('adoptionListings'),fetchTable('adoptionApplications'),owner?fetchTable('petProfiles'):Promise.resolve([]),admin?fetchTable('pets'):Promise.resolve([]),
       owner?api.operate('listOwnListingApplications').catch(()=>({applications:[]})):Promise.resolve({applications:[]}),
       owner?api.operate('getAdoptionPreferences').catch(e=>{console.warn('Adoption preference load:',e.message);return null;}):Promise.resolve(null),
       owner?fetchTable('petMatchNotifications').catch(()=>[]):Promise.resolve([])
     ]);
     // Preserve readable pet names for completed adoption applications even
     // after a successful ownership transfer deletes their public listing.
     // The Function may resolve only the signed-in applicant's applications
     // (or an administrator's), so no private pet-owner information is leaked.
     const liveListingIds=new Set(listings.map(l=>l.$id));
     const historyIds=(admin||owner)?applications.filter(a=>!liveListingIds.has(a.listingId)||(!a.petNameSnapshot&&!a.listingTitleSnapshot)).map(a=>a.$id):[];
     const adoptionLabels=new Map();
     if(historyIds.length){
       try{
         const resolved=await api.operate('resolveAdoptionApplicationNames',{applicationIds:historyIds});
         for(const item of resolved?.labels||[])adoptionLabels.set(item.applicationId,item);
       }catch(err){
         console.warn('CityVetHub adoption pet-name lookup:',err.message);
       }
     }
     const petFallback=new Map([
       ...ownerPets.map(p=>[p.$id,p]),
       ...verifiedPets.map(p=>[p.$id,p])
     ]);
     const petLabel=(application)=>{
       const listing=listings.find(l=>l.$id===application.listingId);
       const resolved=adoptionLabels.get(application.$id);
       const pet=petFallback.get(application.petId)||ownerPets.find(p=>p.latestRequestId===application.petId);
       const name=application.petNameSnapshot||resolved?.petName||pet?.petName||'';
       const title=application.listingTitleSnapshot||listing?.title||resolved?.listingTitle||'';
       const primary=name||title||'Pet name not recoverable';
       return `<div class="CV419_ADOPTION_PET"><strong>${h(primary)}</strong>${title&&title!==primary?`<span>${h(title)}</span>`:''}${!listing&&application.status==='completed'?'<small><i class="fa-solid fa-circle-check"></i> Adoption completed · listing removed</small>':''}</div>`;
     };
     // Adopted listings are NOT current listings. They must never reappear in
     // the previous owner's public, private, or administrator adoption cards.
     // History and applications are retained separately for traceability.
     const currentListings=listings.filter(l=>l.status!=='adopted');
     const myPets=ownerPets.filter(p=>p.ownerId===current.user.$id);
     const unlistedPets=myPets.filter(p=>!currentListings.some(l=>l.petProfileId===p.$id));
     const myPetById=new Map(myPets.map(p=>[p.$id,p]));
     const received=(ownersIncoming.applications||[]).filter(a=>currentListings.some(l=>l.$id===a.listingId));
     const available=currentListings.filter(l=>l.isActive&&l.status==='available');
     const visible=filtered(admin?currentListings:owner?[...available,...currentListings.filter(l=>l.postedById===current.user.$id&&!available.some(a=>a.$id===l.$id))]:available,
       ['title','description','requirements','species','breed','barangay']);
     const renderCard=x=>`<article class="CV_RECORD P47_ADOPT_CARD" tabindex="0" role="button" data-listing="${h(x.$id)}" aria-label="View ${h(x.title)}"><div class="CV_RECORD_TOP">${pill(x.status)}${!x.isActive?pill('inactive'):''}${x.postedById===current.user.$id?pill('my listing'):''}</div><div class="P47_ADOPT_PICTURE">${image(x.photoFileId||(x.postedById===current.user.$id?myPetById.get(x.petProfileId)?.photoFileId:''),'CV49_ADOPT_PHOTO')}</div><h3>${h(x.title)}</h3><p>${h(x.description)}</p><div class="CV49_LISTING_OWNER">${image(x.ownerAvatarFileId,'CV49_OWNER_AVATAR','fa-user')}<span><small>Posted by</small><strong>${h(x.ownerDisplayName||'Pet Owner')}</strong></span></div><div class="P47_ADOPT_FACTS"><span>${h(x.species||'Pet')}</span><span>${h(x.breed||'Breed not provided')}</span><span>${h(x.barangay||'Barangay unknown')}</span><span>${h(x.verificationStatus==='verified'?'CVO verified':'Not CVO verified')}</span></div><div class="CV_RECORD_BOTTOM"><span>${x.postedById===current.user.$id?'Your listing':'View pet details'}</span>${soft('viewListing','View pet',`data-id="${h(x.$id)}"`,'fa-eye')}${owner&&x.postedById===current.user.$id?soft('listingPhotos','Photos',`data-id="${h(x.$id)}"`,'fa-camera'):''}${owner&&x.postedById===current.user.$id?soft('toggleListing',x.isActive?'Withdraw':'Reopen',`data-id="${h(x.$id)}"`,'fa-toggle-on'):admin?soft('toggleListing',x.isActive?'Deactivate':'Activate',`data-id="${h(x.$id)}"`,'fa-toggle-on'):''}</div></article>`;
     const incomingTable=owner?`<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>Applications for my pets</h3><span>Approve or decline requests yourself. After approval, confirm the final handover.</span></div>${table(['Applicant','Pet','Contact','Reason','Status','Action'],received.map(a=>tr([h(a.applicantName),petLabel(a),h(a.contactNumber||'Not supplied'),h(a.message),pill(a.status==='owner_approved'?'Approved by owner':a.status),a.status==='pending'?`<div class="CV412_ROW_ACTIONS">${soft('ownerApprove','Approve',`data-id="${h(a.$id)}"`,'fa-check')}${soft('ownerDecline','Decline',`data-id="${h(a.$id)}"`,'fa-xmark')}</div>`:['owner_approved','approved'].includes(a.status)?soft('confirmTransfer','Confirm transfer',`data-id="${h(a.$id)}"`,'fa-handshake'):'—'])))}</div>`:'';
     const applicationTable=`<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>${admin?'CVO adoption applications':'My adoption applications'}</h3><span>Records remain linked to the original pet identity</span></div>${table(admin?['Applicant','Contact','Reason','Pet / listing','Submitted','Status','Action']:['Pet / listing','Applicant','Reason','Submitted','Status'],applications.map(a=>admin?tr([h(a.applicantName),h(a.contactNumber||'Not recorded'),h(a.message),petLabel(a),h(date(a.submittedAt)),pill(a.status),a.status==='pending'?'Awaiting Pet Owner decision':['owner_approved','approved'].includes(a.status)?'Awaiting owner handover':'—']):tr([petLabel(a),h(a.applicantName||'Applicant not recorded'),h(a.message),h(date(a.submittedAt)),pill(a.status)])))}</div>`;
     const matchingPanel=owner?`<section class="CV422_MATCH_PANEL"><div class="CV422_MATCH_HEADER"><div><span class="CV422_MATCH_EYEBROW"><i class="fa-solid fa-heart-pulse"></i> PET MATCHING</span><h3>Find your future companion</h3><p>Choose your preferred species, breed, color, gender, and age. We'll notify you when a new adoption listing matches.</p></div>${soft('matchingPreferences',matchingPrefs?'Edit preferences':'Set preferences','','fa-sliders')}</div><div class="CV422_MATCH_CHIPS"><span>${h(matchingPrefs?.species||'Any pet')}</span><span>${h(matchingPrefs?.breed||'Any breed')}</span><span>${h(matchingPrefs?.color||'Any color')}</span><span>${h(matchingPrefs?.sex||'Any gender')}</span><span>${h(matchingPrefs?`${matchingPrefs.minAgeYears??0}–${matchingPrefs.maxAgeYears??40} years`:'Any age')}</span><span class="${matchingPrefs?.isEnabled?'CV422_MATCH_ON':''}">${matchingPrefs?.isEnabled?'Matching active':'Matching not configured'}</span></div><div class="CV422_MATCH_UPDATES"><strong><i class="fa-regular fa-bell"></i> Adoption match alerts</strong>${matchingAlerts.length?matchingAlerts.slice(0,12).map(n=>`<div class="CV422_MATCH_NOTE ${n.isRead?'CV422_MATCH_READ':''}"><span><i class="fa-solid fa-paw"></i></span><div><b>${h(n.petName||n.title)}</b><small>${h(n.title)} · ${h(date(n.createdAt))}</small></div>${!n.isRead?soft('markMatchRead','Mark read',`data-id="${h(n.$id)}"`,'fa-check'):pill('Read')}</div>`).join(''):'<p>No adoption matches yet. Matches will appear here when eligible new listings are published.</p>'}</div><small>Android background push requires the mobile app to subscribe through Appwrite Push in a development build. New matches are saved here regardless of push availability.</small></section>`:'';
     view(header('PET ADOPTIONS','Adoptions','Explore pet profiles, review adoption requests, and complete an owner-approved handover.',
       admin?action('createListing','CVO listing','fa-plus'):owner&&unlistedPets.length?action('listOwnPet','List my pet','fa-heart'):' ')+matchingPanel+
       `<div class="CV_FILTER_BOX"><label>Species <select id="adoptionSpecies"><option value="">Any species</option><option>Dog</option><option>Cat</option></select></label><label>Housing <select id="adoptionHousing"><option value="">Any</option><option>apartment</option><option>house</option><option>yard</option></select></label><label>Barangay <input id="adoptionBarangay" placeholder="e.g. Bagong Silang"></label><button class="CV_SOFT CV_BUTTON" id="matchAdoptions" type="button">Find matches</button></div>`+
       `<div class="CV49_SECTION_HEAD"><h3>Pets looking for a home</h3><span>${available.length} currently available</span></div><div class="CV_CARDS P47_ADOPTION_GRID" id="adoptionCards">${visible.length?visible.map(renderCard).join(''):blank('No pets are listed for adoption yet.')}</div>`+incomingTable+applicationTable+
       '<p class="CV_HINT">Transfer is recorded automatically when the current Pet Owner approves and confirms the selected adopter. The listing then disappears from public browsing. Original pet and medical record IDs remain unchanged.</p>');
     if(admin)container.querySelector('.CV_FILTER_BOX').hidden=true;
     else container.querySelector('#matchAdoptions')?.addEventListener('click',()=>{
       const species=container.querySelector('#adoptionSpecies').value;
       const housing=container.querySelector('#adoptionHousing').value;
       const barangay=container.querySelector('#adoptionBarangay').value.trim().toLowerCase();
       const compatible=req=>!req||req==='any'||!housing||req===housing||(housing==='yard'&&['house','apartment'].includes(req))||(housing==='house'&&req==='apartment');
       const scored=visible.filter(l=>compatible(l.housingRequirement)).map(l=>({l,score:(species&&l.species===species?4:0)+(housing&&l.housingRequirement===housing?2:0)+(barangay&&String(l.barangay||'').toLowerCase().includes(barangay)?2:0)})).sort((a,b)=>b.score-a.score);
       container.querySelector('#adoptionCards').innerHTML=scored.length?scored.map(x=>renderCard(x.l)).join(''):blank('No compatible pet listings.');
     });
     function adoptForm(listing){
       const formOverlay=modal(`Adoption application · ${listing.title}`,[
         {key:'contactNumber',label:'Contact number',type:'tel',max:40,placeholder:'e.g. 09XXXXXXXXX'},
         {key:'message',label:'Reason for adoption',type:'textarea',max:1000,placeholder:'Why would you like to adopt this pet?'}
       ],async d=>{if(d.message.trim().length<10)throw Error('Please write at least 10 characters explaining your reason.');await execute('applyAdoption',{listingId:listing.$id,contactNumber:d.contactNumber,message:d.message});});
       formOverlay.querySelector('[type=submit]').textContent='Submit application';
     }
     function preview(listing){
       const overlay=document.createElement('div');overlay.className='CV_MODAL P47_ADOPTION_MODAL';
       const isMine=listing.postedById===current.user.$id;
       overlay.innerHTML=`<div class="CV_MODAL_CARD P4_DIALOG CV49_ADOPT_DIALOG" role="dialog" aria-modal="true"><div class="CV_MODAL_HEAD"><h3>${h(listing.title)}</h3><button type="button" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="P47_ADOPT_DETAIL"><div class="CV49_ADOPT_PREVIEW">${image(listing.photoFileId||(isMine?myPetById.get(listing.petProfileId)?.photoFileId:''),'CV49_PREVIEW_PET')}<div><span class="P4_STATUS">${h(listing.verificationStatus==='verified'?'CVO verified':'Owner-listed · unverified')}</span><p>${h(listing.description)}</p><div class="CV49_LISTING_OWNER">${image(listing.ownerAvatarFileId,'CV49_OWNER_AVATAR','fa-user')}<span><small>Current listing owner</small><strong>${h(listing.ownerDisplayName||'Pet Owner')}</strong></span></div></div></div><div class="P47_ADOPT_FACTS"><span>${h(listing.species||'Pet')}</span><span>${h(listing.breed||'Breed unavailable')}</span><span>${h(listing.barangay||'Location unavailable')}</span></div><h4>Adoption requirements</h4><p>${h(listing.requirements||'Contact CVO for the next steps.')}</p><p>Housing requirement: ${h(listing.housingRequirement||'Any')}</p><div class="P4_FORM_FOOT">${owner&&!isMine&&listing.isActive&&listing.status==='available'?'<button class="PRIMARY_ACTION" type="button" id="p47ApplyNow">Apply to adopt</button>':''}</div></div></div>`;
       overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))overlay.remove();});
       document.body.append(overlay);overlay.querySelector('#p47ApplyNow')?.addEventListener('click',()=>{overlay.remove();adoptForm(listing);});
     }
     container.querySelector('#adoptionCards').addEventListener('click',e=>{const item=e.target.closest('[data-listing]');if(item&&!e.target.closest('[data-ctrl]')){const listing=listings.find(l=>l.$id===item.dataset.listing);if(listing)preview(listing);}});
     container.querySelector('#adoptionCards').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-listing]')){const item=listings.find(l=>l.$id===e.target.dataset.listing);if(item)preview(item);}});
     bind((ctrl,b)=>{
       if(ctrl==='markMatchRead')execute('markAdoptionMatchRead',{notificationId:b.dataset.id}).catch(err=>message(api.readableError(err))); 
       if(ctrl==='matchingPreferences'){
         const pref=matchingPrefs||{};
         const selection=modal('Your adoption matching preferences',[
           {key:'species',label:'Preferred animal',type:'select',options:[{value:'Any',label:'Any dog or cat'},{value:'Dog',label:'Dog'},{value:'Cat',label:'Cat'}]},
           {key:'breed',label:'Preferred breed (optional)',type:'select',required:false,options:[{value:'',label:'Any breed'}]},
           {key:'color',label:'Coat color',type:'select',required:false,options:[{value:'',label:'Any color'},...(window.CityVetBreedCatalog?.colors||[]).map(v=>({value:v,label:v}))]},
           {key:'sex',label:'Pet gender',type:'select',options:['Any','Male','Female'].map(v=>({value:v,label:v==='Any'?'Any gender':v}))},
           {key:'minAgeYears',label:'Minimum age (years)',type:'number',min:0,maxValue:40,value:pref.minAgeYears??0},
           {key:'maxAgeYears',label:'Maximum age (years)',type:'number',min:0,maxValue:40,value:pref.maxAgeYears??40},
           {key:'isEnabled',label:'Matching status',type:'select',options:[{value:'true',label:'Enabled'},{value:'false',label:'Paused'}]},
           {key:'pushEnabled',label:'Android push notifications',type:'select',options:[{value:'true',label:'Notify on new matching listings'},{value:'false',label:'In-app notifications only'}]}
         ],async d=>{
           await execute('saveAdoptionPreferences',{species:d.species,breed:d.species==='Any'?'':d.breed,color:d.color,sex:d.sex,minAgeYears:Number(d.minAgeYears),maxAgeYears:Number(d.maxAgeYears),isEnabled:d.isEnabled==='true',pushEnabled:d.pushEnabled==='true'});
         });
         const species=selection.querySelector('[name=species]'),breed=selection.querySelector('[name=breed]');
         selection.querySelector('[name=species]').value=pref.species||'Any';
         selection.querySelector('[name=color]').value=pref.color||'';
         selection.querySelector('[name=sex]').value=pref.sex||'Any';
         selection.querySelector('[name=isEnabled]').value=String(pref.isEnabled??true);
         selection.querySelector('[name=pushEnabled]').value=String(!!pref.pushEnabled);
         const populate=async(value='')=>{
           if(species.value==='Any'){breed.innerHTML='<option value="">Any breed</option>';return;}
           try{await window.CityVetBreedCatalog?.populate(api,species.value,breed,value);}catch(e){console.warn(e.message);}
           breed.insertAdjacentHTML('afterbegin','<option value="">Any breed</option>');breed.value=value||'';
         };
         species.addEventListener('change',()=>populate());populate(pref.breed||'');
       }

       if(ctrl==='createListing')modal('Publish CVO adoption listing',[
         {key:'petId',label:'Verified pet',type:'select',options:verifiedPets.map(p=>({value:p.$id,label:p.petName+' — '+p.species}))},
         {key:'title',label:'Listing title',max:150},{key:'description',label:'Pet story',type:'textarea',max:1500},
         {key:'requirements',label:'Adoption requirements',type:'textarea',required:false,max:1000},
         {key:'housingRequirement',label:'Housing',type:'select',options:['any','apartment','house','yard']}
       ],d=>execute('createListing',d));
       if(ctrl==='listOwnPet')modal('List my pet for adoption',[
         {key:'petProfileId',label:'My pet',type:'select',options:unlistedPets.map(p=>({value:p.$id,label:p.petName+' — '+p.breed}))},
         {key:'title',label:'Listing title',max:150},{key:'description',label:'Pet story',type:'textarea',max:1500},
         {key:'requirements',label:'Adoption requirements',type:'textarea',required:false,max:1000},
         {key:'housingRequirement',label:'Housing',type:'select',options:['any','apartment','house','yard']},
         {key:'publishPetPhoto',label:'Show pet photo on public adoption listing?',type:'select',options:[{value:'yes',label:'Yes, share the pet photo'},{value:'',label:'No, hide photo'}]},
         {key:'showOwnerName',label:'Show my name publicly?',type:'select',options:[{value:'',label:'No, use Pet Owner'},{value:'yes',label:'Yes, show my name'}]},
         {key:'publishOwnerPhoto',label:'Show my profile picture publicly?',type:'select',options:[{value:'',label:'No, keep my picture private'},{value:'yes',label:'Yes, show my profile picture'}]}
       ],d=>execute('listOwnPetForAdoption',{...d,publishPetPhoto:d.publishPetPhoto==='yes',showOwnerName:d.showOwnerName==='yes',publishOwnerPhoto:d.publishOwnerPhoto==='yes'}));
       if(ctrl==='viewListing'){const item=listings.find(l=>l.$id===b.dataset.id);if(item)preview(item);}
       if(ctrl==='listingPhotos'){
         const listing=listings.find(l=>l.$id===b.dataset.id);
         if(listing&&listing.postedById===current.user.$id)modal('Adoption listing photo sharing',[
           {key:'publishPetPhoto',label:'Show pet photo publicly?',type:'select',options:[{value:'yes',label:'Yes — allow adopters to see this pet'},{value:'',label:'No — keep this photo private'}]},
           {key:'publishOwnerPhoto',label:'Show my profile picture publicly?',type:'select',options:[{value:'',label:'No — keep my avatar private'},{value:'yes',label:'Yes — share my avatar'}]}
         ],d=>execute('updateListingPhotos',{listingId:listing.$id,publishPetPhoto:d.publishPetPhoto==='yes',publishOwnerPhoto:d.publishOwnerPhoto==='yes'}));
       }
       if(ctrl==='toggleListing'&&confirm('Change the listing visibility?'))execute('toggleListing',{listingId:b.dataset.id}).catch(e=>message(e.message));
       if(['ownerApprove','ownerDecline'].includes(ctrl)){
         const application=received.find(a=>a.$id===b.dataset.id);
         if(!application||application.status!=='pending')return message('This application is no longer pending review.');
         const approving=ctrl==='ownerApprove';
         confirmAction({title:approving?'Approve adoption request?':'Decline adoption request?',
           description:approving?`Are you sure you want to approve ${application.applicantName} for ${listings.find(l=>l.$id===application.listingId)?.title||'your pet'}? Once approved, you can confirm the handover without CVO intervention.`:`Are you sure you want to decline ${application.applicantName}'s adoption request? This decision cannot be reversed from this page.`,
           confirmLabel:approving?'Yes, approve request':'Yes, decline request',danger:!approving,
           onConfirm:()=>execute('reviewOwnAdoption',{applicationId:application.$id,decision:approving?'approve':'decline'})});
       }
       if(ctrl==='confirmTransfer'){
         const app=received.find(a=>a.$id===b.dataset.id);
         if(!app||!['approved','owner_approved'].includes(app.status))return message('Approve the request as the current Pet Owner first.');
         if(!confirm(`Transfer this pet to ${app.applicantName}? This will transfer ownership and private medical data, and permanently hide the adoption listing.`))return;
         execute('confirmAdoptionTransfer',{applicationId:app.$id}).catch(e=>message(e.message));
       }
     });
   }
   async function traceability(){
     const [verified,history,profiles,passports,applications]=await Promise.all([
       fetchTable('pets'),fetchTable('ownership'),fetchTable('petProfiles').catch(()=>[]),
       fetchTable('passports').catch(()=>[]),fetchTable('adoptionApplications').catch(()=>[])
     ]);
     const profileIndex=new Map(profiles.map(p=>[p.$id,p]));
     const petNameById=new Map();
     for(const p of [...passports,...profiles,...verified]){
       if(p?.petName){
         if(p.$id)petNameById.set(p.$id,p.petName);
         if(p.petId)petNameById.set(p.petId,p.petName);
         if(p.petProfileId)petNameById.set(p.petProfileId,p.petName);
         if(p.requestId)petNameById.set(p.requestId,p.petName);
         if(p.latestRequestId)petNameById.set(p.latestRequestId,p.petName);
       }
     }
     for(const a of applications){
       const snap=a?.petNameSnapshot||a?.listingTitleSnapshot;
       if(snap&&a?.petId&&!petNameById.has(a.petId))petNameById.set(a.petId,snap);
     }
     const ownPets=profiles.filter(p=>p.ownerId===current.user.$id);
     // Require BOTH registry and inventory ownership when a verified registry
     // references an inventory pet. An old row with stale permissions must not
     // display a pet that the account has already transferred.
     const ownedVerified=verified.filter(p=>p.ownerId===current.user.$id&&
       (!p.petProfileId||profileIndex.get(p.petProfileId)?.ownerId===current.user.$id));
     const allPets=owner?[...ownPets,...ownedVerified.filter(p=>!ownPets.some(q=>q.$id===p.petProfileId))]:verified;
     const visibleHistory=owner?history.filter(r=>r.previousOwnerId===current.user.$id||r.newOwnerId===current.user.$id):history;
     const label=pet=>pet.petName||'Unnamed pet';
     view(header('PET IDENTITIES','Ownership & Traceability','Live owners, persistent QR passport IDs, and automatic handover history. Adoption transfers require owner approval and final confirmation.')+
       stats([['Pet profiles accessible',allPets.length],['CVO verified',owner?ownedVerified.length:verified.length],['Tracked ownership changes',visibleHistory.length],['Recent transfers',visibleHistory.filter(r=>new Date(r.transferDate)>new Date(Date.now()-30*86400000)).length]])+
       `<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>My pet passports & registered pets</h3><span>${owner?'Your pet identities':'Verified CVO registry'}</span></div><div class="CV49_PET_DIRECTORY">${allPets.map(p=>`<article class="CV49_DIRECTORY_CARD">${image(p.photoFileId||profileIndex.get(p.petProfileId)?.photoFileId,'CV49_DIRECTORY_PHOTO')}<div class="CV410_DIRECTORY_DETAILS"><strong>${h(label(p))}</strong><small>${h(p.breed||p.species)} · ${h(p.barangay)}</small><span>${h(p.officialRegistryId||'Personal QR · Unverified')}</span></div><div class="CV410_DIRECTORY_ACTIONS">${soft('qrPassport','View QR passport',`data-id="${h(p.petProfileId||p.$id)}"`,'fa-qrcode')}</div></article>`).join('')||blank('No pet passports accessible yet.')}</div></div>`+
       `<div class="CV49_MODULE_SECTION"><div class="CV49_SECTION_HEAD"><h3>Automatically recorded ownership history</h3><span>No manual history entry needed for adoptions</span></div><div class="CV49_HISTORY_FEED">${visibleHistory.length?visibleHistory.map(r=>`<div class="CV49_HISTORY_EVENT"><span class="CV49_HISTORY_DOT"><i class="fa-solid fa-right-left"></i></span><div><strong>${h(r.previousOwnerName||r.previousOwnerId)} <i class="fa-solid fa-arrow-right"></i> ${h(r.newOwnerName||r.newOwnerId)}</strong><small>Pet: ${h(r.petName||petNameById.get(r.petId)||'Registered pet')} · ${h(r.transferType)} · ${h(dateTime(r.transferDate))}</small></div>${pill(r.transferType)}</div>`).join(''):blank('No recorded ownership transfers yet.')}</div></div>`+
       '<div class="CV49_INFO_STRIP"><i class="fa-solid fa-shield-halved"></i><span>Medical and vaccination records remain linked to the same pet after ownership changes. The new owner receives access to private records while past owner access is revoked. Public sharing choices are reset for privacy.</span></div>');
     bind((ctrl,b)=>{
       if(ctrl==='qrPassport'){
         const selected=allPets.find(p=>(p.petProfileId||p.$id)===b.dataset.id);if(!selected)return;
         const box=document.createElement('div');box.className='CV_MODAL';box.innerHTML=`<div class="CV_MODAL_CARD CV_QR"><div class="CV_MODAL_HEAD"><h3>${h(selected.petName)} · QR Profile</h3><button type="button" data-close><i class="fa-solid fa-xmark"></i></button></div><div id="cvQR"></div><p class="CV_HINT">This is the pet's persistent personal QR identity. CVO verification is a separate status.</p></div>`;
         document.body.append(box);box.addEventListener('click',e=>{if(e.target===box||e.target.closest('[data-close]'))box.remove();});
         const base=cfg.publicSiteUrl||document.baseURI;
         const url=new URL('passport.html',base);url.searchParams.set('pet',selected.petProfileId||selected.$id);
         if(window.QRCode)new window.QRCode(box.querySelector('#cvQR'),{text:url.href,width:180,height:180});else box.querySelector('#cvQR').textContent=url.href;
       }
     });
   }
   async function users(){
     if(!admin)throw Error('Administrator access required');
     const [result,idCategories,verificationRequests]=await Promise.all([
       api.operate('listUsers'),fetchTable('idCategories').catch(()=>[]),fetchTable('ownerVerificationRequests').catch(()=>[])
     ]);
     const roster=result.users||[];
     const userLookup=new Map(roster.map(u=>[u.$id,u]));
     const people=filtered(roster,['name','email','requestedRole','effectiveRole']);
     view(header('STAFF AND CITIZENS','Account Management','Review user access, approve Field Officers, and create new CityVetHub accounts.',action('createUser','Create user','fa-user-plus'))+
       stats([['Users loaded',roster.length],['Pet Owners',roster.filter(u=>u.effectiveRole==='owner').length],['Field Officers',roster.filter(u=>u.effectiveRole==='officer').length],['Administrators',roster.filter(u=>u.effectiveRole==='admin').length]])+
       table(['User','Email','Role','Requested role','Officer access','Action'],people.map(u=>tr([`<span class="CV49_CELL_FLEX">${image(u.profileImageId,'CV49_USER_AVATAR','fa-user')}<span class="CV49_PET_CELL"><strong>${h(u.name||'User')}</strong><small>${h(u.$id)}</small></span></span>`,h(u.email),pill(userRoleLabel(u.effectiveRole)),h(userRoleLabel(u.requestedRole)),pill(u.officerApproved?'approved':u.requestedRole==='officer'?'pending':'n/a'),(u.requestedRole==='officer'&&!u.officerApproved?soft('approveOfficer','Approve officer',`data-id="${h(u.$id)}"`,'fa-check'):'')+soft('changeRole','Change role',`data-id="${h(u.$id)}"`,'fa-user-gear')+(u.$id!==current.user.$id?soft('deleteUser','Delete',`data-id="${h(u.$id)}"`,'fa-trash'):'')])))+
       '<p class="CV_HINT">Staff roles are granted only through CVO approval. Deletion is irreversible and blocked while pet, incident or adoption data still belongs to the account. First 100 accounts shown.</p>'+
       `<section class="CV411_ADMIN_VERIFICATION"><div class="CV49_SECTION_HEAD"><div><h3><i class="fa-solid fa-id-card-clip"></i> Pet Owner Account Verification</h3><span>CVO verification requires an existing owned pet and a private government ID image.</span></div>${action('addIdCategory','Create ID category','fa-plus')}</div><div class="CV411_ID_CATEGORIES">${idCategories.length?[...idCategories].sort((a,b)=>String(a.categoryType||'Secondary').localeCompare(String(b.categoryType||'Secondary'))||a.name.localeCompare(b.name)).map(c=>`<span class="CV411_ID_CATEGORY CV422_ID_CATEGORY"><span class="CV422_ID_LABEL"><strong>${h(c.name)}</strong><small>${h(c.categoryType||'Custom')} · ${c.isActive?'Active':'Inactive'}</small></span>${soft('toggleIdCategory',c.isActive?'Disable':'Enable',`data-id="${h(c.$id)}"`,'fa-toggle-on')}${soft('deleteIdCategory','Delete',`data-id="${h(c.$id)}"`,'fa-trash')}</span>`).join(''):'<small>No government ID categories. Create one to enable owner verification requests.</small>'}</div><h4>Account verification requests</h4>${table(['Pet Owner','Government ID','Pet on account','Submitted','Review status','Actions'],verificationRequests.map(r=>tr([`<strong>${h(userLookup.get(r.ownerId)?.name||r.ownerId)}</strong>`,h(r.idCategoryName),h(r.petProfileId),h(date(r.submittedAt)),pill(r.status),`<div class="CV411_REVIEW_ACTIONS">${r.documentFileId?soft('viewPrivateID','View private ID',`data-id="${h(r.$id)}"`,'fa-eye'):''}${r.status==='pending'?soft('reviewOwnerVerification','Review request',`data-id="${h(r.$id)}"`,'fa-shield-halved'):''}</div>`])))}</section>`);

     bind((c,b)=>{
       if(c==='addIdCategory')modal('Create an accepted Government ID category',[
         {key:'name',label:'ID category name',max:90,placeholder:'e.g. Philippine National ID'},
         {key:'categoryType',label:'Category classification',type:'select',options:['Primary','Secondary']},
         {key:'categoryCode',label:'Optional ID code',max:40,required:false,placeholder:'e.g. local_government_id'},
         {key:'description',label:'Instructions or accepted ID details',type:'textarea',max:240,required:false}
       ],async d=>execute('createIdCategory',d));
       if(c==='toggleIdCategory'&&confirm('Change this government ID category availability?'))execute('toggleIdCategory',{categoryId:b.dataset.id}).catch(e=>message(api.readableError(e)));
       if(c==='deleteIdCategory'){
         const cat=idCategories.find(x=>x.$id===b.dataset.id);if(!cat)return;
         confirmAction({title:'Delete Government ID category?',description:`Delete “${cat.name}”? Categories already used in any identity verification cannot be deleted for audit integrity. Disable those instead.`,confirmLabel:'Delete unused category',danger:true,
           onConfirm:()=>execute('deleteIdCategory',{categoryId:cat.$id})});
       }
       if(c==='viewPrivateID'){
         const request=verificationRequests.find(r=>r.$id===b.dataset.id);
         if(!request)return;
         b.disabled=true;
         api.operate('openVerificationDocument',{requestId:request.$id}).then(({url,expiresAt})=>{
           const overlay=document.createElement('div');overlay.className='CV_MODAL';
           overlay.innerHTML=`<div class="CV_MODAL_CARD CV413_PRIVATE_ID" role="dialog" aria-modal="true"><div class="CV_MODAL_HEAD"><h3>Private government ID</h3><button type="button" data-close aria-label="Close">×</button></div><p>Administrator-only review link. Expires in 5 minutes. Do not forward or share this URL.</p><a class="CV_BUTTON PRIMARY_ACTION" href="${h(url)}" target="_blank" rel="noopener noreferrer">Open private ID image</a><p class="CV_HINT">If the file is missing, ask the owner to replace their ID from My Profile.</p></div>`;
           overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))overlay.remove();});
           document.body.append(overlay);
         }).catch(error=>message('Unable to open identity document: '+api.readableError(error))).finally(()=>b.disabled=false);
       }
       if(c==='reviewOwnerVerification'){
         const request=verificationRequests.find(r=>r.$id===b.dataset.id);if(!request)return;
         modal('Review Pet Owner identity · '+(userLookup.get(request.ownerId)?.name||request.ownerId),[
           {key:'status',label:'Decision',type:'select',options:[{value:'approved',label:'Approve — grant verified Pet Owner badge'},{value:'rejected',label:'Reject — request new documents'}]},
           {key:'reviewNote',label:'Internal review note',type:'textarea',required:false,max:500}
         ],async d=>{
           if(!confirm('Confirm the CVO verification decision? Only approved Pet Owners may report incidents.'))return;
           await execute('reviewAccountVerification',{requestId:request.$id,status:d.status,reviewNote:d.reviewNote});
         });
       }
       if(c==='approveOfficer'&&confirm('Have you verified this person as an authorized Field Officer?'))execute('approveOfficer',{userId:b.dataset.id}).catch(e=>message(e.message));
       if(c==='changeRole'){
         const target=roster.find(u=>u.$id===b.dataset.id);if(!target)return;
         modal('Change role — '+(target.name||target.email),[
           {key:'role',label:'New authorized account role',type:'select',options:[{value:'owner',label:'Pet Owner'},{value:'officer',label:'Field Officer'},{value:'admin',label:'Administrator'}]}
         ],async d=>{
           if(d.role===target.effectiveRole)throw Error('The user already has that role.');
           if(!confirm(`Change ${target.email} from ${userRoleLabel(target.effectiveRole)} to ${userRoleLabel(d.role)}? The user's access will change immediately.`))return;
           await execute('setUserRole',{userId:target.$id,role:d.role});
         });
       }
       if(c==='deleteUser'){
         const target=roster.find(u=>u.$id===b.dataset.id);if(!target)return;
         const typed=prompt(`Delete account ${target.email}? This is irreversible, signs the user out, and is blocked if they have linked pets or case/adoption records.\nType the email to confirm:`);
         if(typed!==target.email)return;
         execute('deleteManagedUser',{userId:target.$id,confirmEmail:typed}).catch(e=>message(api.readableError(e)));
       }
       if(c==='createUser')modal('Create user account',[
         {key:'name',label:'Full name',max:128,placeholder:'e.g. Juan Dela Cruz'},
         {key:'email',label:'Email address',type:'email',max:160,placeholder:'name@example.com'},
         {key:'role',label:'Role',type:'select',options:[{value:'owner',label:'Pet Owner'},{value:'officer',label:'Field Officer'},{value:'admin',label:'Administrator'}]},
         {key:'password',label:'Temporary password',type:'password',max:256,placeholder:'At least 8 characters'},
         {key:'confirmPassword',label:'Confirm password',type:'password',max:256}
       ],async d=>{
         if((d.password||'').length<8)throw Error('Password must be at least 8 characters.');
         if(d.password!==d.confirmPassword)throw Error('Passwords do not match.');
         await execute('createUser',{name:d.name,email:d.email,password:d.password,role:d.role});
       });
     });
   }
   async function reports(){
     if(!admin)throw Error('Administrator access required');
     const names=['petRequests','pets','medical','diseaseReports','diseaseIncidents','diseaseAlerts','adoptionListings','adoptionApplications','ownership'];
     const entries=await Promise.all(names.map(async n=>[n,await fetchTable(n)]));
     const data=Object.fromEntries(entries);cache.reportData=data;
     const labels={petRequests:'Registration requests',pets:'Verified pets',medical:'Medical records',diseaseReports:'Disease reports',diseaseIncidents:'Confirmed incidents',diseaseAlerts:'Published alerts',adoptionListings:'Adoption listings',adoptionApplications:'Adoption applications',ownership:'Ownership transfers'};
     view(header('CVO INTELLIGENCE','Administrative Reports','Current operational summaries across the system.',action('exportReport','Export CSV','fa-file-csv'))+
       stats([['Verified pets',data.pets.length],['Vaccination entries',data.medical.filter(r=>r.recordType==='Vaccination').length],['Active alerts',data.diseaseAlerts.filter(r=>r.isActive).length]])+
       `<div class="CV_REPORT_GRID">${names.map(k=>`<div class="CV_REPORT_ROW"><span>${labels[k]}</span><strong>${data[k].length}</strong></div>`).join('')}</div>`+
       '<p class="CV_HINT">Each table is limited to the first 100 accessible records; these are snapshot counts, not guaranteed municipality-wide totals. CSV exports contain only aggregate counts.</p>');
     bind(c=>{if(c==='exportReport')safeDownload('cityvethub-report-'+new Date().toISOString().slice(0,10)+'.csv',[['Module','Records sampled'],...names.map(k=>[labels[k],data[k].length])]);});
   }
   return {open,search,refresh,close};
 }
 window.CityVetFeatures={mount};
})();
