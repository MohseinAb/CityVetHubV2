(function(){
  'use strict';
  const cfg=window.CITYVET_CONFIG;
  const el=id=>document.getElementById(id);
  const role=window.Appwrite?.Role;
  const permission=window.Appwrite?.Permission;
  const query=window.Appwrite?.Query;
  const idService=window.Appwrite?.ID;
  const fmt=d=>{try{return new Date(d).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});}catch{return '—';}};
  function element(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  function mount({api,current}){
    let pets=[];let approvedPets=[];let term='';let loading=false;
    const isAdmin=current.role==='admin';
    const mayRegister=current.role==='owner';
    el('newPetButton').hidden=!mayRegister;
    el('registrySubtitle').textContent=isAdmin?'Review and approve registration requests.':mayRegister?'Register your cats and dogs for CVO approval.':'View authorized animal registration records.';
    function notice(text,kind='info'){const p=el('registryNotice');p.hidden=!text;p.textContent=text;p.dataset.kind=kind;}
    function filter(value){term=value.toLowerCase().trim();render();}
    function cell(row,text){const td=element('td','',text);row.append(td);return td;}
    function render(){
      const tbody=el('petRows');tbody.replaceChildren();
      const list=pets.filter(p=>[p.petName,p.ownerName,p.species,p.breed,p.barangay,p.status].some(v=>String(v||'').toLowerCase().includes(term)));
      el('petTotal').textContent=String(pets.length);
      el('petPending').textContent=String(pets.filter(p=>p.status==='pending').length);
      el('petApproved').textContent=String(pets.filter(p=>p.status==='approved').length);
      if(!list.length){const tr=element('tr');const td=element('td','','No pet registrations found.');td.colSpan=6;tr.append(td);tbody.append(tr);return;}
      for(const pet of list){
        const tr=element('tr');
        const t1=element('td');t1.append(element('strong','PET_NAME',pet.petName),element('span','PET_META',pet.species+' · '+(pet.breed||'Unknown breed')+' · '+(pet.sex||'—')+' · '+pet.ageYears+' yr'));tr.append(t1);
        cell(tr,pet.ownerName||'—');cell(tr,pet.barangay||'—');cell(tr,fmt(pet.$createdAt));
        const status=element('td');status.append(element('span','PET_STATUS status-'+pet.status,(pet.status||'unknown').toUpperCase()));tr.append(status);
        const action=element('td');const controls=element('div','PET_ACTIONS');
        if(isAdmin&&pet.status==='pending'){
          for(const [label,next] of [['Approve','approved'],['Reject','rejected']]){
            const b=element('button','PET_ACTION '+(next==='approved'?'is-approve':'is-reject'),label);b.type='button';b.addEventListener('click',()=>changeStatus(pet,next,b));controls.append(b);
          }
        }
        if(pet.status==='approved'){
          const b=element('button','PET_ACTION is-passport','View QR');b.type='button';b.addEventListener('click',()=>showPassport(pet));controls.append(b);
        }
        if(!controls.children.length)controls.append(element('span','PET_META','Awaiting review'));
        action.append(controls);tr.append(action);tbody.append(tr);
      }
    }
    async function reload(){
      if(loading)return;loading=true;notice('');el('petRows').replaceChildren(element('tr'));
      const tr=el('petRows').firstElementChild;const td=element('td','','Loading pet registrations…');td.colSpan=6;tr.append(td);
      try{
        // Verified records are stored in a separate, admin-create-only table.
        // Citizen-controlled request fields never confer approval or QR issuance.
        const [requests, verified]=await Promise.all([
          api.tablesDB.listRows({databaseId:cfg.databaseId,tableId:cfg.tables.petRequests,queries:[query.orderDesc('$createdAt'),query.limit(100)]}),
          api.tablesDB.listRows({databaseId:cfg.databaseId,tableId:cfg.tables.pets,queries:[query.orderDesc('$createdAt'),query.limit(100)]})
        ]);
        approvedPets=verified.rows||[];
        const byRequest=new Map(approvedPets.map(p=>[p.requestId,p]));
        pets=(requests.rows||[]).map(req=>{
          const verified=byRequest.get(req.$id);
          return {...req,verified, status:verified?'approved':req.reviewStatus==='rejected'?'rejected':'pending'};
        });
        render();
        const target=new URLSearchParams(location.search).get('pet');
        if(target){const matched=approvedPets.find(p=>p.$id===target);if(matched)showPassport(matched);}
      }catch(err){pets=[];render();notice('Cannot read Pet Registry: '+api.readableError(err)+'. Check table setup and permissions.','error');}
      finally{loading=false;}
    }
    async function changeStatus(pet,status,button){
      if(!isAdmin)return;
      if(!window.confirm((status==='approved'?'Approve':'Reject')+' '+pet.petName+'?'))return;
      button.disabled=true;notice('');
      try{
        await api.operate('reviewPet',{requestId:pet.$id,status});
        await reload();notice(pet.petName+' was '+status+'.','success');
      }catch(err){notice(api.readableError(err),'error');button.disabled=false;}
    }
    function showPassport(pet){
      if(pet.status==='approved'&&pet.verified) pet=pet.verified;
      if(!pet.requestId)return;
      el('passportName').textContent=pet.petName+' • '+pet.species+' • '+pet.$id;
      el('qrContainer').replaceChildren();
      const url=new URL('index.html',location.href);url.search='?module=pets&pet='+encodeURIComponent(pet.$id);
      if(window.QRCode){new QRCode(el('qrContainer'),{text:url.toString(),width:200,height:200,correctLevel:window.QRCode.CorrectLevel.M});}
      else{el('qrContainer').textContent='QR library unavailable. Pet ID: '+pet.$id;}
      el('passportDialog').hidden=false;
    }
    function hide(dialog){el(dialog).hidden=true;}
    el('newPetButton').addEventListener('click',()=>{if(mayRegister)el('petDialog').hidden=false;});
    el('closePetDialog').addEventListener('click',()=>hide('petDialog'));
    el('closePassportDialog').addEventListener('click',()=>hide('passportDialog'));
    for(const modal of [el('petDialog'),el('passportDialog')])modal.addEventListener('click',e=>{if(e.target===modal)modal.hidden=true;});
    el('printPassport').addEventListener('click',()=>window.print());
    el('refreshPets').addEventListener('click',reload);
    el('petForm').addEventListener('submit',async e=>{
      e.preventDefault();if(!mayRegister)return;
      const form=e.currentTarget;const data=new FormData(form);
      const name=String(data.get('petName')||'').trim();const breed=String(data.get('breed')||'').trim();const barangay=String(data.get('barangay')||'').trim();
      const species=String(data.get('species')||'');const sex=String(data.get('sex')||'');const age=Number(data.get('ageYears'));
      if(!name||!breed||!barangay||!['Cat','Dog'].includes(species)||!['Male','Female'].includes(sex)||!Number.isInteger(age)||age<0||age>40){notice('Please complete valid pet details.','error');return;}
      const button=el('savePetButton');button.disabled=true;button.textContent='Submitting…';notice('');
      try{
        await api.operate('submitPet',{petName:name,species,breed,sex,ageYears:age,barangay});
        hide('petDialog');form.reset();await reload();notice('Pet registration submitted for CVO review.','success');
      }catch(err){notice('Registration failed: '+api.readableError(err),'error');}
      finally{button.disabled=false;button.textContent='Submit registration';}
    });
    reload();
    return {reload,filter};
  }
  window.CityVetRegistry={mount};
})();
