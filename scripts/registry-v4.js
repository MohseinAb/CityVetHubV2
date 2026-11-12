/* CityVetHub 4.6: private pet inventory, immediate QR, owner-approved public passport and uploaded evidence. */
(function(){
'use strict';
const H=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}):'—';
const statuses={draft:'Draft / Unverified',pending:'Pending review',verified:'CVO Verified',rejected:'Rejected',approved:'Approved'};
const status=v=>`<span class="P4_STATUS P4_STATUS_${H(v||'draft')}">${H(statuses[v]||v||'Draft')}</span>`;
const EXP_RE=/\s*\[Exp:\s*(\d{4}-\d{2}-\d{2})\]\s*$/i;
const splitExpiry=(text,expiryCol)=>{const raw=String(text||'');const m=raw.match(EXP_RE);return{text:m?raw.replace(EXP_RE,'').trim():raw,expiryDate:expiryCol||(m?m[1]:'')};};
const ANCESTRY2_KEY='cv_pet_ancestry2_v1';
const readLocalAncestry2=()=>{try{return JSON.parse(localStorage.getItem(ANCESTRY2_KEY)||'{}')||{};}catch{return{};}};
const saveLocalAncestry2=(petId,id,name)=>{if(!petId)return;try{const map=readLocalAncestry2();if(id)map[petId]={id,name:name||''};else delete map[petId];localStorage.setItem(ANCESTRY2_KEY,JSON.stringify(map));}catch{}};
const parent2IdOf=pet=>pet?.ancestryParent2Id||(pet?.$id?readLocalAncestry2()[pet.$id]?.id:'')||'';
const parent2NameOf=pet=>pet?.ancestryParent2Name||(pet?.$id?readLocalAncestry2()[pet.$id]?.name:'')||'';
function mount({api,current}){
 const box=document.getElementById('registryPanel'),owner=current.role==='owner',admin=current.role==='admin';
 const cfg=api.config,Q=window.Appwrite.Query,A=window.Appwrite;
 let pets=[],requests=[],approved=[],evidence=[],clinician=[],staffInventory=[],staffOwners=[],existingListings=[],staffDirectory=[],term='';
 const action=(label,cmd,id='',icon='fa-arrow-right',primary=false)=>`<button type="button" class="${primary?'PRIMARY_ACTION':'CV_SOFT CV_BUTTON'}" data-p46="${cmd}" data-id="${H(id)}"><i class="fa-solid ${icon}"></i> ${H(label)}</button>`;
 const safeImage=id=>{if(!id)return'';try{return String(api.storage.getFileView({bucketId:cfg.buckets.media,fileId:id}));}catch{return'';}};
 const img=id=>{const src=safeImage(id);return src?`<img class="P4_PET_IMAGE" loading="lazy" alt="Pet photo" src="${H(src)}" onerror="this.hidden=true;this.parentElement.classList.add('P46_IMAGE_ERROR')">`:'<div class="P4_PHOTO_FALLBACK"><i class="fa-solid fa-paw"></i></div>';};
 const isAlreadyListed=petId=>existingListings.some(l=>l.petProfileId===petId&&l.status!=='adopted');
 const listedBadge=()=>'<span class="CV412_ALREADY_LISTED"><i class="fa-solid fa-check-circle"></i> Listed for adoption</span>';
 const list=async key=>{const r=await api.tablesDB.listRows({databaseId:cfg.databaseId,tableId:cfg.tables[key],queries:[Q.orderDesc('$createdAt'),Q.limit(100)]});return r.rows||[];};
 const show=(title,sub,toolbar,body)=>{box.innerHTML=`<div class="REGISTRY_TOP"><div><span class="REGISTRY_KICKER"><i class="fa-solid fa-paw"></i> PET MANAGEMENT</span><h2>${H(title)}</h2><p>${H(sub)}</p></div><div class="REGISTRY_ACTIONS">${toolbar}</div></div><div id="p46Notice" class="P4_NOTICE" role="status" hidden></div>${body}`;window.CityVetUI?.upgrade(box);};
 function notice(text,err=false){const node=box.querySelector('#p46Notice');if(node){node.hidden=false;node.className='P4_NOTICE '+(err?'P4_NOTICE_ERROR':'P4_NOTICE_SUCCESS');node.textContent=text;}}
 function modal(title,fields,onSave,label='Save changes',successMessage='Saved successfully.'){
  const overlay=document.createElement('div');overlay.className='CV_MODAL P46_MODAL';overlay.innerHTML=`<div class="CV_MODAL_CARD P46_DIALOG" role="dialog" aria-modal="true" aria-label="${H(title)}"><div class="CV_MODAL_HEAD"><h3>${H(title)}</h3><button type="button" data-close aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button></div><form class="P4_PET_FORM">${fields}<div class="P4_FORM_ERRORS" role="alert" hidden></div><div class="P4_FORM_FOOT"><button type="button" class="CV_SOFT CV_BUTTON" data-close>Cancel</button><button type="submit" class="PRIMARY_ACTION">${H(label)}</button></div></form></div>`;
  const close=()=>overlay.remove();overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))close();});
  overlay.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;button.textContent='Saving…';try{await onSave(event.currentTarget);close();await reload(true);notice(successMessage);}catch(error){const err=event.currentTarget.querySelector('.P4_FORM_ERRORS');err.hidden=false;err.textContent='Unable to publish/save: '+api.readableError(error);err.setAttribute('aria-live','assertive');err.scrollIntoView({behavior:'smooth',block:'nearest'});console.error('CityVetHub form failed:',error);}finally{button.disabled=false;button.textContent=label;}});
  document.body.append(overlay);window.CityVetUI?.upgrade(overlay);return overlay;
 }
 const fld=(label,name,val='',type='text',attrs='')=>`<label>${H(label)}<input name="${name}" type="${type}" value="${H(val)}" ${attrs}></label>`;
 const txt=(label,name,val='',max=1500)=>`<label class="P4_FORM_WIDE">${H(label)}<textarea name="${name}" maxlength="${max}" rows="3">${H(val)}</textarea></label>`;
 const select=(label,name,options,chosen)=>`<label>${H(label)}<select name="${name}">${options.map(s=>`<option value="${H(s)}" ${chosen===s?'selected':''}>${H(s)}</option>`).join('')}</select></label>`;
 const checkbox=(label,name,checked=false)=>`<label class="P4_CHECK"><input type="checkbox" name="${name}" ${checked?'checked':''}> ${H(label)}</label>`;
 const parentsFor=(pet,species)=>pets.filter(p=>p.$id!==pet?.$id&&p.species===species);
 const parentSelect=(label,name,chosenId,chosenName,pet,species)=>`<label>${H(label)} <select name="${name}"><option value="">Unknown / Not listed</option>${parentsFor(pet,species).map(p=>`<option value="${H(p.$id)}" ${chosenId===p.$id?'selected':''}>${H(p.petName)} · ${H(p.breed||p.species)}</option>`).join('')}${chosenId&&!parentsFor(pet,species).some(p=>p.$id===chosenId)?`<option value="${H(chosenId)}" selected>${H(chosenName||'Previous parent')} (historical link)</option>`:''}</select></label>`;
 const ancestrySelector=(pet,species)=>parentSelect('Parent pet 1 (optional)','ancestryParentId',pet?.ancestryParentId||'',pet?.ancestryParentName||'',pet,species)+parentSelect('Parent pet 2 (optional)','ancestryParent2Id',parent2IdOf(pet),parent2NameOf(pet),pet,species);
 async function upload(image){
  if(!image)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(image.type)||image.size>5000000)throw Error('Choose JPG, PNG or WEBP up to 5 MB.');
  const permissions=[A.Permission.read(A.Role.user(current.user.$id)),A.Permission.update(A.Role.user(current.user.$id)),A.Permission.delete(A.Role.user(current.user.$id))];
  const f=await api.storage.createFile({bucketId:cfg.buckets.media,fileId:A.ID.unique(),file:image,permissions});return f.$id;
 }
 function petForm(pet){
  const dialog=modal(pet?`Edit ${pet.petName}`:'Add a pet',fld('Pet name','petName',pet?.petName,'text','required maxlength="100"')+  
  select('Animal type','species',['Dog','Cat'],pet?.species||'Dog')+`<label>Breed <select name="breed" required><option value="">Loading available breeds…</option></select></label>`+select('Coat color','color',window.CityVetBreedCatalog?.colors||['Black','White','Brown','Gray','Other / Unknown'],pet?.color||'Other / Unknown')+  
  select('Sex','sex',['Male','Female'],pet?.sex||'Male')+fld('Age in years','ageYears',pet?.ageYears??0,'number','min="0" max="40" required')+  
  `<label>Barangay<select name="barangay" required>${window.CityVetBarangays?.optionsHtml(pet?.barangay||'')||`<option value="${H(pet?.barangay||'')}">${H(pet?.barangay||'Select barangay')}</option>`}</select></label>`+fld('Home address (private)','homeAddress',pet?.homeAddress,'text','maxlength="200"')+  
  fld('Emergency contact (private)','emergencyContact',pet?.emergencyContact,'tel','maxlength="60"')+  
  select('Vital status','vitalStatus',['Alive', 'Deceased'],pet?.vitalStatus||'Alive')+
  ancestrySelector(pet,pet?.species||'Dog')+
  txt('Pet description','profileDescription',pet?.profileDescription||'',1500)+txt('If found, please…','lostFoundMessage',pet?.lostFoundMessage||'',500)+  
  `<label class="P4_FORM_WIDE">Pet photo (JPG/PNG/WEBP, 5 MB)<input name="picture" type="file" accept="image/jpeg,image/png,image/webp"></label>`+  
  checkbox('Show my name publicly on QR profile','shareOwnerName',pet?.shareOwnerName)+checkbox('Share emergency contact publicly','shareContact',pet?.shareContact)+  
  checkbox('Share exact home address publicly (not recommended)','sharePublicAddress',pet?.sharePublicAddress)+checkbox('Show pet photo publicly','sharePublicPhoto',pet?.sharePublicPhoto)+  
  `<p class="CV_HINT P4_FORM_WIDE">The QR code is created when the pet is saved. A QR profile is NOT a CVO verification. Only details you choose to share are public.</p>`,async form=>{  
  const d=Object.fromEntries(new FormData(form));
  if(d.ancestryParentId&&d.ancestryParent2Id&&d.ancestryParentId===d.ancestryParent2Id)throw Error('Select two different parent pets.');
  const file=form.querySelector('[name=picture]').files[0];const photoFileId=file?await upload(file):(pet?.photoFileId||'');  
  const payload={petName:String(d.petName||'').trim(),species:d.species,breed:String(d.breed||'').trim(),color:String(d.color||'').trim(),sex:d.sex,ageYears:Number(d.ageYears),barangay:String(d.barangay||'').trim(),homeAddress:String(d.homeAddress||'').trim(),emergencyContact:String(d.emergencyContact||'').trim(),
  vitalStatus:d.vitalStatus,ancestryParentId:d.ancestryParentId||'',ancestryParent2Id:d.ancestryParent2Id||'',
  profileDescription:String(d.profileDescription||'').trim(),lostFoundMessage:String(d.lostFoundMessage||'').trim(),photoFileId,  
  shareOwnerName:form.elements.shareOwnerName.checked,shareContact:form.elements.shareContact.checked,sharePublicAddress:form.elements.sharePublicAddress.checked,sharePublicPhoto:form.elements.sharePublicPhoto.checked};  
  const res=await api.operate(pet?'updateInventoryPet':'createInventoryPet',{...(pet?{petProfileId:pet.$id}:{}),...payload});  
  saveLocalAncestry2(pet?.$id||res?.$id,d.ancestryParent2Id||'',pets.find(p=>p.$id===d.ancestryParent2Id)?.petName||'');
  },pet?'Save pet':'Create pet + QR','Saved successfully.');
  const type=dialog.querySelector('[name=species]'),parent1=dialog.querySelector('[name=ancestryParentId]'),parent2=dialog.querySelector('[name=ancestryParent2Id]');
  window.CityVetBreedCatalog?.attach(api,type,dialog.querySelector('[name=breed]'),pet?.breed||'');
  type?.addEventListener('change',()=>{
    const opts=`<option value="">Unknown / Not listed</option>`+parentsFor(pet,type.value).map(p=>`<option value="${H(p.$id)}">${H(p.petName)} · ${H(p.breed||p.species)}</option>`).join('');
    [parent1,parent2].forEach(sel=>{
      if(!sel)return;
      const original=sel.value;
      sel.innerHTML=opts;
      if([...sel.options].some(o=>o.value===original))sel.value=original;
    });
  });
 }
 function detailsForm(pet){
  modal(`Update ${pet.petName}'s public details`,fld('Profile title','profileTitle',pet.profileTitle,'text','maxlength="100"')+
    txt('Description','profileDescription',pet.profileDescription||'')+txt('Lost & found message','lostFoundMessage',pet.lostFoundMessage||'',500)+
    select('Vital status','vitalStatus',['Alive', 'Deceased', 'Missing'],pet?.vitalStatus||'Alive')+
    ancestrySelector(pet,pet.species)+select('Coat color','color',window.CityVetBreedCatalog?.colors||['Black','White','Brown','Gray','Other / Unknown'],pet?.color||'Other / Unknown')+
    fld('Emergency contact','emergencyContact',pet.emergencyContact||'','tel','maxlength="60"')+
    fld('Home address (private by default)','homeAddress',pet.homeAddress||'','text','maxlength="200"')+
    checkbox('Show owner name on public QR','shareOwnerName',pet.shareOwnerName)+checkbox('Share emergency contact on public QR','shareContact',pet.shareContact)+
    checkbox('Share exact home address on public QR (not recommended)','sharePublicAddress',pet.sharePublicAddress)+checkbox('Show pet photo on public QR','sharePublicPhoto',pet.sharePublicPhoto),
    async f=>{const d=Object.fromEntries(new FormData(f));if(d.ancestryParentId&&d.ancestryParent2Id&&d.ancestryParentId===d.ancestryParent2Id)throw Error('Select two different parent pets.');await api.operate('updatePetDetails',{petProfileId:pet.$id,profileTitle:d.profileTitle,profileDescription:d.profileDescription,lostFoundMessage:d.lostFoundMessage,color:d.color,emergencyContact:d.emergencyContact,homeAddress:d.homeAddress,vitalStatus:d.vitalStatus,ancestryParentId:d.ancestryParentId||'',ancestryParent2Id:d.ancestryParent2Id||'',shareOwnerName:f.elements.shareOwnerName.checked,shareContact:f.elements.shareContact.checked,sharePublicAddress:f.elements.sharePublicAddress.checked,sharePublicPhoto:f.elements.sharePublicPhoto.checked});saveLocalAncestry2(pet.$id,d.ancestryParent2Id||'',pets.find(p=>p.$id===d.ancestryParent2Id)?.petName||'');},'Save changes','Saved successfully.');
 }
 function healthForm(pet){
  modal(`Add a health document for ${pet.petName}`,fld('Title / vaccination / treatment','title','','text','required maxlength="120"')+
   fld('Date of record','recordDate',new Date().toISOString().slice(0,10),'date','required')+
   fld('Expiry of vaccination / treatment (optional)','expiryDate','','date','')+
   `<label class="P4_FORM_WIDE">Photo of medical / vaccination record (required)<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label>`+
   checkbox('Share this document publicly on the QR pet profile','sharePublic',false)+
   `<p class="CV_HINT P4_FORM_WIDE">Owner-uploaded documents are labeled owner supplied, not clinically verified. Do not upload personal identifiers or private medical details if sharing publicly.</p>`,async f=>{
    const data=new FormData(f),file=f.querySelector('[name=file]').files[0];const fileId=await upload(file);
    const rawTitle=String(data.get('title')||'').trim(),expDate=String(data.get('expiryDate')||'').trim();
    const titleWithExp=expDate?`${rawTitle.slice(0,140)} [Exp: ${expDate}]`:rawTitle;
    await api.operate('addPetHealthUpload',{petProfileId:pet.$id,fileId,title:titleWithExp,recordDate:String(data.get('recordDate')||''),expiryDate:expDate,sharePublic:f.elements.sharePublic.checked});
   },'Add document','Saved successfully.');
 }
 async function openQRCode(pet){
  // The pet's identity is its stable inventory row ID. The QR URL is only
  // shareable externally once the website has a reachable host (or LAN URL).
  const base=String(cfg.publicSiteUrl||'').trim();
  let url;
  try{url=new URL('passport.html',base?new URL(base.endsWith('/')?base:base+'/'):new URL('./',document.baseURI));}
  catch{return alert('Invalid publicSiteUrl in scripts/config.js. Provide an http(s) URL ending in /.');}
  url.searchParams.set('pet',pet.$id);
  const overlay=modal(`QR profile · ${pet.petName}`,`<div class="P46_QR_VIEW P4_FORM_WIDE"><div class="P46_QR_PANEL" id="p46Qr"></div><p>${H(pet.petName)} · ${H(statuses[pet.verificationStatus]||'Unverified')} — scan to open only owner-approved information.</p><a href="${H(url.href)}" target="_blank" rel="noopener">Open profile in browser</a><button type="button" class="CV_BUTTON PRIMARY_ACTION" id="p46DownloadQr"><i class="fa-solid fa-download"></i> Download QR PNG</button></div>`,async()=>{});
  overlay.querySelector('.P4_FORM_FOOT')?.remove();const target=overlay.querySelector('#p46Qr');
  api.tablesDB.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.passports,rowId:pet.$id}).catch(err=>{
    if(Number(err?.code)===404)api.operate('ensurePetPassport',{petProfileId:pet.$id}).catch(()=>{});
  });
  if(!window.QRCode){target.textContent='QR generator could not load. Connect to the internet and reload this page.';return;}
  new window.QRCode(target,{text:url.href,width:240,height:240,correctLevel:window.QRCode.CorrectLevel.H});
  overlay.querySelector('#p46DownloadQr').addEventListener('click',()=>{
   const canvas=target.querySelector('canvas'),image=target.querySelector('img');
   const href=canvas?.toDataURL('image/png')||image?.src;
   if(!href)return alert('The QR image has not loaded.');
   const a=document.createElement('a');a.href=href;a.download='CityVetHub-'+pet.petName.replace(/[^a-zA-Z0-9_-]/g,'-')+'-QR.png';a.click();
  });
 }

 function detailsBody(pet){
  const ownEvidence=evidence.filter(x=>x.petProfileId===pet.$id);
  const official=approved.find(x=>x.petProfileId===pet.$id);
  const clinical=clinician.filter(x=>x.petId===pet.$id||(official?.$id&&x.petId===official.$id));
  const rows=ownEvidence.map(x=>{const parsed=splitExpiry(x.title,x.expiryDate);return `<div class="P46_HEALTH_ROW"><div><strong>${H(parsed.text)}</strong><small>${H(date(x.recordDate))}${parsed.expiryDate?` · Expires ${H(date(parsed.expiryDate))}`:''} · ${x.sharePublic?'Public (owner-supplied)':'Private'}</small></div><a href="${H(safeImage(x.fileId))}" target="_blank" rel="noopener">View image</a>${action('Remove','removeHealth',x.$id,'fa-trash')}</div>`;}).join('');
  const p1Name=pets.find(p=>p.$id===pet.ancestryParentId)?.petName||pet.ancestryParentName||'Unknown / Not listed';
  const p2Id=parent2IdOf(pet),p2Name=pets.find(p=>p.$id===p2Id)?.petName||parent2NameOf(pet)||'Unknown / Not listed';
  return `<div class="P46_PET_SUMMARY P4_FORM_WIDE"><div class="P46_PET_DETAIL_IMAGE">${img(pet.photoFileId)}</div><div><h3>${H(pet.petName)}</h3>${status(pet.verificationStatus)}<p>${H(pet.species)} • ${H(pet.breed)} • ${H(pet.sex)} • ${H(pet.ageYears)} year(s)</p><p><i class="fa-solid fa-location-dot"></i> ${H(pet.barangay)}</p><p>${H(pet.profileDescription||'No description yet.')}</p></div></div>`+  
  `<div class="P46_DETAIL_FIELDS P4_FORM_WIDE"><div><span>Status</span><strong>${H(pet.vitalStatus||'Alive')}</strong></div><div><span>Ancestry 1</span><strong>${H(p1Name)}</strong></div><div><span>Ancestry 2</span><strong>${H(p2Name)}</strong></div><div><span>Verification status</span><strong>${H(statuses[pet.verificationStatus]||'Draft')}</strong></div><div><span>Official CVO registry ID</span><strong>${H(pet.officialRegistryId||'Not assigned')}</strong></div><div><span>Home address · Private</span><strong>${H(pet.homeAddress||'Not provided')}</strong></div><div><span>Emergency contact · Private</span><strong>${H(pet.emergencyContact||'Not provided')}</strong></div><div class="P46_WIDE"><span>Lost & found</span><strong>${H(pet.lostFoundMessage||'If found, please contact CityVetHub.')}</strong></div></div>`+  
  `<div class="P46_DETAIL_ACTIONS P4_FORM_WIDE">${action('QR Code','qr',pet.$id,'fa-qrcode',true)}${isAlreadyListed(pet.$id)?listedBadge():action('List for adoption','listAdoption',pet.$id,'fa-heart')}${action('Update details','details',pet.$id,'fa-pen-to-square')}${['draft','rejected'].includes(pet.verificationStatus)?action('Edit identity','edit',pet.$id,'fa-paw')+action('Send for verification','verify',pet.$id,'fa-paper-plane')+action('Delete pet','deletePet',pet.$id,'fa-trash'):''}</div>`+  
  `<div class="P46_MEDICAL_SECTION P4_FORM_WIDE"><div class="P4_SECTION_HEADING"><h3>Health and vaccination documents</h3>${action('Add Medical Record','addHealth',pet.$id,'fa-plus',true)}</div><p>Owner-uploaded images are not official veterinary certification. Each shared document is visible to anyone with the QR link.</p>${rows||'<p class="CV_HINT">No personal health documents yet.</p>'}</div>`+  
  (clinical.length?`<div class="P46_MEDICAL_SECTION P4_FORM_WIDE"><h3>Veterinary records</h3>${clinical.map(c=>{const exp=splitExpiry(c.description,c.expiryDate).expiryDate;return `<p><b>${H(c.recordType)}:</b> ${H(c.medicineType)} · ${H(date(c.dateAdministered))}${exp?` · Expires ${H(date(exp))}`:''}</p>`;}).join('')}</div>`:'');
 }
 function details(pet){
  const layer=modal(`${pet.petName} · Pet profile`,detailsBody(pet),async()=>{});
  layer.querySelector('.P4_FORM_FOOT')?.remove();layer.classList.add('P46_DETAILS_MODAL');
  layer.dataset.petId=pet.$id;
 }
 function syncOpenDetailsModal(){
  const openModal=document.querySelector('.P46_DETAILS_MODAL');
  if(!openModal?.dataset.petId)return;
  const updatedPet=pets.find(p=>p.$id===openModal.dataset.petId);
  if(!updatedPet){openModal.remove();return;}
  const titleEl=openModal.querySelector('.CV_MODAL_HEAD h3');
  if(titleEl)titleEl.textContent=`${updatedPet.petName} · Pet profile`;
  const formEl=openModal.querySelector('.P4_PET_FORM');
  if(formEl)formEl.innerHTML=detailsBody(updatedPet);
 }
 function ownerPage(){
  const visible=pets.filter(p=>[p.petName,p.breed,p.species,p.barangay].some(v=>String(v||'').toLowerCase().includes(term)));
  show('My Pets','Every pet has an immediate QR profile. CVO verification is an optional separate request.',action('Add a pet','add','','fa-plus',true)+action('Refresh','reload','','fa-rotate'),
    `<div class="P4_SUMMARY_GRID">${[['My pets',pets.length],['Drafts',pets.filter(p=>p.verificationStatus==='draft').length],['Awaiting verification',pets.filter(p=>p.verificationStatus==='pending').length],['Verified',pets.filter(p=>p.verificationStatus==='verified').length]].map(([n,v])=>`<div class="P4_SUMMARY"><span>${H(n)}</span><strong>${v}</strong></div>`).join('')}</div>`+
    `<div class="P4_PET_GRID">${visible.length?visible.map(p=>`<article class="P4_PET_CARD P46_CLICK_CARD" role="button" tabindex="0" data-p46="open" data-id="${H(p.$id)}" data-species="${H(p.species||'')}" data-status="${H(statuses[p.verificationStatus]||p.verificationStatus||'Draft')}" data-barangay="${H(p.barangay||'Unspecified')}" aria-label="Open ${H(p.petName)}'s profile"><div class="P4_PET_MEDIA">${img(p.photoFileId)}<div class="P4_FLOAT_BADGE">${status(p.verificationStatus)}</div></div><div class="P4_PET_COPY"><h3>${H(p.petName)}</h3><p>${H(p.profileTitle||p.species+' · '+p.breed)}</p><div class="P4_PET_FACTS"><span class="P4_PET_FACT">${H(p.species)}</span><span class="P4_PET_FACT">${H(p.breed)}</span><span class="P4_PET_FACT">${H(p.ageYears)} yr</span></div><p class="P4_PET_BARANGAY"><i class="fa-solid fa-location-dot"></i> ${H(p.barangay)}</p><div class="P4_PET_ACTIONS">${action('View profile','open',p.$id,'fa-eye',true)}${action('QR code','qr',p.$id,'fa-qrcode')}${isAlreadyListed(p.$id)?listedBadge():action('List for adoption','listAdoption',p.$id,'fa-heart')}${['draft','rejected'].includes(p.verificationStatus)?action('Send request','verify',p.$id,'fa-paper-plane'):''}</div></div></article>`).join(''):'<div class="P4_EMPTY_PETS"><h3>No pets yet</h3><p>Add a pet to generate its personal QR link immediately.</p></div>'}</div>`+
    '<p class="CV_HINT">QR profiles are public only through their link. Sharing medical images, contact numbers, owner name, and exact address is optional.</p>');
 }
 function staffPage(){
  const byId=new Map(approved.map(p=>[p.requestId||p.$id,p]));
  const source=admin?[...requests,...approved.filter(p=>!requests.some(r=>r.$id===(p.requestId||p.$id))).map(p=>({...p,reviewStatus:'approved'}))]:approved.map(p=>({...p,reviewStatus:'approved'}));
  const visible=source.filter(p=>[p.petName,p.ownerName,p.barangay,p.officialRegistryId].some(s=>String(s||'').toLowerCase().includes(term)));
  const staffById=new Map(staffDirectory.map(p=>[p.$id,p]));
  const photoOf=request=>{
    const pet=byId.get(request.$id)||approved.find(p=>p.petProfileId===request.petProfileId);
    const secure=staffById.get(pet?.$id)?.imageUrl;
    if(secure)return `<img class="P4_PET_IMAGE" loading="lazy" alt="${H(request.petName)} photo" src="${H(secure)}" onerror="this.hidden=true;this.parentElement.classList.add('P46_IMAGE_ERROR')">`;
    return img(staffInventory.find(p=>p.$id===request.petProfileId)?.photoFileId||request.photoFileId||pet?.photoFileId);
  };
  show(admin?'Pet Verification':'Verified Pet Registry',admin?'Review requests; each pet already has a QR profile, whether verified or not.':'See registered pets and their official status.',action('Refresh','reload','','fa-rotate'),
    `<div class="P4_SUMMARY_GRID"><div class="P4_SUMMARY"><span>${admin?'Total requests':'Verified registry pets'}</span><strong>${admin?requests.length:approved.length}</strong></div><div class="P4_SUMMARY"><span>Pending</span><strong>${admin?requests.filter(r=>r.reviewStatus==='pending').length:0}</strong></div><div class="P4_SUMMARY"><span>Verified</span><strong>${approved.length}</strong></div><div class="P4_SUMMARY"><span>Rejected</span><strong>${requests.filter(r=>r.reviewStatus==='rejected').length}</strong></div></div>`+
    `<div class="CV_TABLE_WRAP"><table class="CV_TABLE CV49_VERIFICATION_TABLE"><thead><tr><th>Pet</th><th>Owner</th><th>Barangay</th><th>Official ID</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>${visible.map(r=>`<tr><td><span class="CV49_CELL_FLEX"><span class="CV49_THUMB">${photoOf(r)}</span><strong>${H(r.petName)}</strong></span></td><td><span class="CV49_CELL_FLEX"><span class="CV49_USER_AVATAR">${img(staffOwners.find(p=>p.userId===r.ownerId)?.profileImageId)}</span><strong>${H(r.ownerName)}</strong></span></td><td>${H(r.barangay)}</td><td>${H(byId.get(r.$id)?.officialRegistryId||'Not assigned')}</td><td>${H(date(r.$createdAt))}</td><td>${status(byId.has(r.$id)?'verified':r.reviewStatus)}</td><td>${admin&&r.reviewStatus==='pending'?action('Review','review',r.$id,'fa-check'):byId.has(r.$id)?action('QR profile','staffQr',byId.get(r.$id).petProfileId||byId.get(r.$id).$id,'fa-qrcode')+(!byId.get(r.$id).officialRegistryId?action('Assign official ID','assignId',byId.get(r.$id).$id,'fa-id-card'):''):'—'}</td></tr>`).join('')||'<tr><td colspan="7">No records found</td></tr>'}</tbody></table></div>`);
 }
 function assignLegacyId(petId){
  const p=approved.find(p=>p.$id===petId);if(!p)return notice('Verified pet not found.',true);
  modal(`Assign official ID · ${p.petName}`,fld('Unique official CVO registry ID','officialRegistryId','','text','required pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,29}" maxlength="30" placeholder="e.g. CVH-2026-0002"'),async form=>{
    await api.operate('assignOfficialPetId',{petId:p.$id,officialRegistryId:form.elements.officialRegistryId.value});
  });
 }
 function listForAdoption(pet){
  if(isAlreadyListed(pet.$id)){notice('This pet already has an adoption listing. Manage it under Adoptions.',true);return;}
  modal(`List ${pet.petName} for adoption`,fld('Listing title','title',pet.profileTitle||`${pet.petName} needs a new home`,'text','required maxlength="150"')+
    txt('Description / pet story','description',pet.profileDescription||`${pet.petName} is looking for a caring adopter.`,1500)+
    txt('Adoption requirements','requirements','',1000)+select('Housing requirement','housingRequirement',['any','apartment','house','yard'],'any')+
    `<label class="P4_CHECK"><input type="checkbox" name="publishPetPhoto" checked> Show this pet's picture on the public adoption listing</label><label class="P4_CHECK"><input type="checkbox" name="showOwnerName"> Also show my full name publicly</label><label class="P4_CHECK"><input type="checkbox" name="publishOwnerPhoto"> Show my profile picture beside this adoption listing (optional)</label>`+
    `<p class="CV_HINT P4_FORM_WIDE">Adoption listings can include pet photos only with your consent. Your own profile picture appears only if you enabled it in My Profile. You approve or decline applicants yourself; you confirm the final ownership transfer.</p>`,
    async f=>{
      const d=Object.fromEntries(new FormData(f));
      if(f.elements.publishPetPhoto.checked&&!pet.photoFileId)throw Error('This pet has no photo yet. Upload one in My Pets or uncheck "Show this pet’s picture".');
      let shareOwnerPhoto=f.elements.publishOwnerPhoto.checked;
      if(shareOwnerPhoto){
        const ownerProfile=await api.tablesDB.getRow({databaseId:cfg.databaseId,tableId:cfg.tables.userProfiles,rowId:current.user.$id}).catch(e=>e.code===404?null:Promise.reject(e));
        if(!ownerProfile?.profileImageId){
          shareOwnerPhoto=false;
          f.elements.publishOwnerPhoto.checked=false;
          // Public adoption must still work when an optional account photo was never uploaded.
          const helper=f.querySelector('.CV_HINT');
          if(helper)helper.textContent='Your account has no uploaded profile photo, so the listing will publish without that optional avatar. Add one later through My Profile.';
        }
      }
      await api.operate('listOwnPetForAdoption',{petProfileId:pet.$id,...d,publishPetPhoto:f.elements.publishPetPhoto.checked,showOwnerName:f.elements.showOwnerName.checked,publishOwnerPhoto:shareOwnerPhoto});
    },'Publish listing','Listed successfully.');
 }
 function review(id){const r=requests.find(x=>x.$id===id);if(!r)return;
  const layer=modal('Review pet verification',`<div class="P4_FORM_WIDE"><h3>${H(r.petName)}</h3><p>Owner: ${H(r.ownerName)}</p><p>${H(r.species)} · ${H(r.breed)} · ${H(r.barangay)}</p></div>`+
    select('Decision','decision',['approved','rejected'],'approved')+
    fld('Unique official CVO registry ID','officialRegistryId','','text','required pattern="[A-Za-z0-9][A-Za-z0-9_-]{3,29}" maxlength="30" placeholder="e.g. CVH-2026-0001"')+
    `<p class="CV_HINT P4_FORM_WIDE">Each approved pet must receive a unique official registry ID. The original QR code stays the same.</p>`,
    async f=>{const choice=f.elements.decision.value;await api.operate('reviewPet',{requestId:r.$id,status:choice,officialRegistryId:choice==='approved'?f.elements.officialRegistryId.value:''});});
  const selectDecision=layer.querySelector('[name=decision]'),idField=layer.querySelector('[name=officialRegistryId]');
  selectDecision.addEventListener('change',()=>{idField.disabled=selectDecision.value==='rejected';idField.required=!idField.disabled;});
 }
 async function reload(silent=false){
  const prevNoticeNode=box.querySelector('#p46Notice');
  const prevNotice=prevNoticeNode&&!prevNoticeNode.hidden&&!prevNoticeNode.classList.contains('P4_NOTICE_ERROR')?{text:prevNoticeNode.textContent,err:false}:null;
  const scroller=document.querySelector('.DASHBOARD_CONTENT')||document.documentElement;
  const scrollTop=scroller.scrollTop;
  if(!silent&&!box.children.length){
   show('Pet Registry','Loading your records…','','<div class="CV_LOADING">Loading…</div>');
  }
  try{if(owner){
   const [a,b,c,d,e,f]=await Promise.all([list('petProfiles'),list('petRequests'),list('pets'),list('petHealthUploads'),list('medical').catch(()=>[]),list('adoptionListings')]);
   pets=a.filter(p=>p.ownerId===current.user.$id);requests=b.filter(r=>r.ownerId===current.user.$id);approved=c.filter(p=>p.ownerId===current.user.$id);evidence=d.filter(x=>x.ownerId===current.user.$id);clinician=e;existingListings=f.filter(l=>l.postedById===current.user.$id);ownerPage();
   syncOpenDetailsModal();
  }else{const [a,b,c,d,staff]=await Promise.all([list('petRequests').catch(()=>[]),list('pets'),admin?list('petProfiles').catch(()=>[]):Promise.resolve([]),admin?list('userProfiles').catch(()=>[]):Promise.resolve([]),api.operate('getStaffPetDirectory').catch(()=>({pets:[]}))]);requests=a;approved=b;staffInventory=c;staffOwners=d;staffDirectory=staff.pets||[];staffPage();}
  if(prevNotice&&silent)notice(prevNotice.text,prevNotice.err);
  scroller.scrollTop=scrollTop;
  }
  catch(error){if(!silent||!box.children.length)show('Pet Registry','Could not load records.','','<div class="CV_ERROR">'+H(api.readableError(error))+'</div>');}
 }
 box.addEventListener('click',async event=>{
  const button=event.target.closest('[data-p46]');if(!button)return;event.preventDefault();event.stopPropagation();const cmd=button.dataset.p46,id=button.dataset.id;
  const pet=pets.find(p=>p.$id===id);
  try{
   if(cmd==='reload')return reload(true);if(cmd==='add'&&owner)return petForm();
   if(cmd==='open'&&owner&&pet)return details(pet);
   if(cmd==='qr'&&owner&&pet)return openQRCode(pet);
   if(cmd==='listAdoption'&&owner&&pet)return listForAdoption(pet);
   if(cmd==='edit'&&owner&&pet)return petForm(pet);
   if(cmd==='details'&&owner&&pet)return detailsForm(pet);
   if(cmd==='addHealth'&&owner&&pet)return healthForm(pet);
   if(cmd==='removeHealth'&&owner){if(!confirm('Delete this uploaded record?'))return;await api.operate('deletePetHealthUpload',{recordId:id});await reload(true);notice('Health document removed.');}
   if(cmd==='verify'&&owner&&pet){if(!confirm(`Submit ${pet.petName} for CVO verification? Your QR already exists.`))return;button.disabled=true;await api.operate('requestPetVerification',{petProfileId:pet.$id});await reload(true);notice('Verification request sent to CVO.');}
   if(cmd==='review'&&admin)return review(id);
   if(cmd==='assignId'&&admin)return assignLegacyId(id);
   if(cmd==='staffQr'){const url=new URL('./passport.html',document.baseURI);url.searchParams.set('pet',id);window.open(url.href,'_blank','noopener');}
  }catch(error){notice(api.readableError(error),true);button.disabled=false;}
 });
 // Detail modal lives under <body>, outside #registryPanel; delegate its actions explicitly.
 document.addEventListener('click',async event=>{
  const button=event.target.closest('.P46_DETAILS_MODAL [data-p46]');if(!button)return;
  event.preventDefault();event.stopPropagation();
  const cmd=button.dataset.p46,id=button.dataset.id,pet=pets.find(p=>p.$id===id);
  try{
   if(cmd==='removeHealth'&&owner){if(!confirm('Remove this medical document?'))return;await api.operate('deletePetHealthUpload',{recordId:id});await reload(true);notice('Document removed.');return;}
   if(!pet||!owner)return;
   if(cmd==='qr')return openQRCode(pet);
   if(cmd==='listAdoption')return listForAdoption(pet);
   if(cmd==='details')return detailsForm(pet);
   if(cmd==='edit')return petForm(pet);
   if(cmd==='addHealth')return healthForm(pet);
   if(cmd==='verify'){if(!confirm(`Send ${pet.petName} for verification?`))return;await api.operate('requestPetVerification',{petProfileId:pet.$id});await reload(true);notice('Verification request submitted.');return;}
   if(cmd==='deletePet'){if(!confirm(`Permanently delete ${pet.petName}?`))return;document.querySelectorAll('.P46_DETAILS_MODAL').forEach(m=>m.remove());await api.operate('deleteInventoryPet',{petProfileId:pet.$id});await reload(true);notice('Pet removed from inventory.');}
  }catch(err){notice(api.readableError(err),true);}
 });
 box.addEventListener('keydown',e=>{const card=e.target.closest('.P46_CLICK_CARD');if(card&&(e.key==='Enter'||e.key===' ')&&!e.target.closest('button')){e.preventDefault();card.click();}});
 reload();return {reload,filter(v){term=String(v||'').toLowerCase();if(owner)ownerPage();else staffPage();}};
}
window.CityVetRegistry=Object.freeze({mount});
})();
