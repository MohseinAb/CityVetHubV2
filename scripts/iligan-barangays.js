/* CityVetHub 4.24 – Iligan City barangays + Universal Searchable Autocorrect Combobox & Section Pagination Engine.
 * Source: https://psa.gov.ph/classification/psgc/barangays/1030900000
 * Values are stable canonical labels for all website forms.
 */
(function(){
'use strict';
const names=Object.freeze([
'Abuno','Acmac-Mariano Badelles Sr.','Bagong Silang','Bonbonon','Bunawan','Buru-un','Dalipuga','Del Carmen','Digkilaan','Ditucalan','Dulag','Hinaplanon','Hindang','Kabacsanan','Kalilangan','Kiwalan','Lanipao','Luinab','Mahayahay','Mainit','Mandulog','Maria Cristina','Palao','Panoroganan','Poblacion','Puga-an','Rogongon','San Miguel','San Roque','Santa Elena','Santa Filomena','Santiago','Santo Rosario','Saray','Suarez','Tambacan','Tibanga','Tipanoy','Tomas L. Cabili','Tubod','Ubaldo Laya','Upper Hinaplanon','Upper Tominobo','Villa Verde'
]);
const H=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const normText=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
const aliases={'acmac':'Acmac-Mariano Badelles Sr.','palao':'Palao','paláo':'Palao','tominoboupper':'Upper Tominobo','tominoboproper':'Tomas L. Cabili','saraytibanga':'Saray'};
function match(raw){const n=norm(raw);return names.find(s=>norm(s)===n)||aliases[n]||'';}
function options(value='',allowEmpty=false){const current=match(value),invalid=value&&!current;
 return `${allowEmpty?'<option value="">All barangays</option>':'<option value="" disabled '+(!value?'selected':'')+'>Select barangay</option>'}`+
   `${invalid?`<option selected value="${String(value).replaceAll('&','&amp;').replaceAll('"','&quot;')}">Previous value: ${String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')}</option>`:''}`+
   names.map(name=>`<option value="${name}" ${name===current?'selected':''}>${name}</option>`).join('');
}

/* --- Typo-Tolerant / Autocorrect String Matching --- */
function editDistance(a,b){
  if(a===b)return 0;
  const la=a.length,lb=b.length;
  if(!la)return lb;if(!lb)return la;
  if(Math.abs(la-lb)>4)return Math.abs(la-lb);
  const prev=new Array(lb+1),curr=new Array(lb+1),prev2=new Array(lb+1);
  for(let j=0;j<=lb;j++)prev[j]=j;
  for(let i=1;i<=la;i++){
    curr[0]=i;
    for(let j=1;j<=lb;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      let val=Math.min(prev[j]+1,curr[j-1]+1,prev[j-1]+cost);
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]){
        val=Math.min(val,prev2[j-2]+cost);
      }
      curr[j]=val;
    }
    for(let j=0;j<=lb;j++){prev2[j]=prev[j];prev[j]=curr[j];}
  }
  return prev[lb];
}

function diceSimilarity(a,b){
  if(a===b)return 1;
  if(a.length<2||b.length<2)return 0;
  const map=new Map();
  for(let i=0;i<a.length-1;i++){
    const bg=a.slice(i,i+2);
    map.set(bg,(map.get(bg)||0)+1);
  }
  let hits=0;
  for(let i=0;i<b.length-1;i++){
    const bg=b.slice(i,i+2),c=map.get(bg)||0;
    if(c>0){map.set(bg,c-1);hits++;}
  }
  return (2*hits)/((a.length-1)+(b.length-1));
}

function scoreMatch(rawQuery,rawCandidate){
  const q=normText(rawQuery);
  if(!q)return {score:1,autocorrect:false};
  const cand=normText(rawCandidate);
  if(!cand)return {score:0,autocorrect:false};
  if(cand===q)return {score:200,autocorrect:false};
  if(cand.startsWith(q))return {score:160-Math.min(25,(cand.length-q.length)*0.2),autocorrect:false};
  const candWords=cand.split(/[^a-z0-9]+/).filter(Boolean);
  if(candWords.some(w=>w.startsWith(q)))return {score:140,autocorrect:false};
  const idx=cand.indexOf(q);
  if(idx!==-1)return {score:120-Math.min(20,idx*0.2),autocorrect:false};
  const qWords=q.split(/[^a-z0-9]+/).filter(Boolean);
  if(qWords.length>1&&qWords.every(w=>cand.includes(w)))return {score:105,autocorrect:false};

  // Typo-tolerant / autocorrect matching across tokens
  let totalScore=0,matchedTokens=0;
  for(const qw of qWords){
    if(cand.includes(qw)){totalScore+=90;matchedTokens++;continue;}
    if(qw.length<2)continue;
    let bestWordScore=0;
    for(const cw of candWords){
      const prefixCw=cw.slice(0,Math.min(cw.length,qw.length+1));
      const distFull=editDistance(qw,cw);
      const distPref=editDistance(qw,prefixCw);
      const dist=Math.min(distFull,distPref);
      const maxAllowed=qw.length<=4?1:qw.length<=7?2:3;
      if(dist<=maxAllowed){
        const s=82-dist*15;
        if(s>bestWordScore)bestWordScore=s;
      }else{
        const dice=Math.max(diceSimilarity(qw,cw),diceSimilarity(qw,prefixCw));
        if(dice>=0.52){
          const s=Math.round(dice*78);
          if(s>bestWordScore)bestWordScore=s;
        }
      }
    }
    if(bestWordScore>0){totalScore+=bestWordScore;matchedTokens++;}
  }
  if(matchedTokens===qWords.length&&matchedTokens>0){
    return {score:Math.round(totalScore/qWords.length),autocorrect:true};
  }
  return {score:0,autocorrect:false};
}

function highlightMatch(label,query){
  const q=String(query||'').trim();
  if(!q)return H(label);
  const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  try{
    const re=new RegExp(`(${escaped})`,'ig');
    if(re.test(label)){
      return String(label).split(re).map((part,i)=>i%2===1?`<mark class="CV_COMBO_MARK">${H(part)}</mark>`:H(part)).join('');
    }
  }catch{}
  return H(label);
}

/* --- Searchable Autocorrect Combobox for <select> and <input data-autocomplete-list> --- */
const COMBO_SELECT_NAMES=new Set([
  'petId','petProfileId','barangay','breed','color','ancestryParentId','ancestryParent2Id','diseaseType','idCategoryId','channelId'
]);

function shouldUpgradeSelect(select){
  if(!select||select.dataset.cvComboUpgraded==='1'||select.multiple)return false;
  if(select.closest('.CV_PAGINATE_TOOLBAR,.CV_PAGINATE_FOOTER'))return false;
  if(select.dataset.combobox==='0')return false;
  if(select.dataset.combobox==='1')return true;
  if(COMBO_SELECT_NAMES.has(select.name)||select.id==='adoptionBarangay')return true;
  if(select.closest('.CV_FORM,.P4_PET_FORM,.COMM_FORM')&&select.options.length>=5)return true;
  return false;
}

function positionDropdown(controlEl,dropdownEl){
  try{
    const rect=controlEl.getBoundingClientRect();
    const modalBox=controlEl.closest('.CV_MODAL_CARD,.COMM_MODAL_DIALOG');
    const bottomBound=modalBox?modalBox.getBoundingClientRect().bottom:window.innerHeight;
    const topBound=modalBox?modalBox.getBoundingClientRect().top:0;
    const spaceBelow=bottomBound-rect.bottom;
    const spaceAbove=rect.top-topBound;
    dropdownEl.classList.toggle('is-dropup',spaceBelow<220&&spaceAbove>spaceBelow);
  }catch{}
}

let comboIdSeq=0;
function upgradeSelectCombobox(select){
  if(!shouldUpgradeSelect(select))return;
  select.dataset.cvComboUpgraded='1';
  if(select.required){
    select.dataset.cvRequired='1';
    select.required=false;
  }
  const wrap=document.createElement('div');
  wrap.className='CV_COMBOBOX';
  select.parentNode.insertBefore(wrap,select);
  select.classList.add('CV_COMBO_SELECT_HIDDEN');
  select.tabIndex=-1;

  const comboInputId=select.id?`${select.id}_combo`:`cv_combo_${++comboIdSeq}`;
  const parentLabel=wrap.closest('label');
  if(parentLabel&&!parentLabel.hasAttribute('for')){
    parentLabel.setAttribute('for',comboInputId);
  }

  const control=document.createElement('div');
  control.className='CV_COMBO_CONTROL';
  control.innerHTML=`<i class="fa-solid fa-magnifying-glass CV_COMBO_ICON" aria-hidden="true"></i><input id="${H(comboInputId)}" type="text" class="CV_COMBO_INPUT" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-autocomplete="list"><button type="button" class="CV_COMBO_CLEAR" tabindex="-1" title="Clear search" aria-label="Clear search" hidden><i class="fa-solid fa-xmark"></i></button><button type="button" class="CV_COMBO_TOGGLE" tabindex="-1" title="Show options" aria-label="Show options"><i class="fa-solid fa-chevron-down"></i></button>`;
  const dropdown=document.createElement('div');
  dropdown.className='CV_COMBO_DROPDOWN';
  dropdown.setAttribute('role','listbox');
  dropdown.hidden=true;
  wrap.append(control,select,dropdown);

  const input=control.querySelector('.CV_COMBO_INPUT');
  const clearBtn=control.querySelector('.CV_COMBO_CLEAR');
  const toggleBtn=control.querySelector('.CV_COMBO_TOGGLE');

  let isFiltering=false;
  let activeIndex=0;
  let currentMatches=[];
  let internalSync=false;

  function readOptions(){
    const all=[...select.options];
    const placeholderOpt=all.find(o=>o.disabled&&o.value==='');
    const selectable=all.filter(o=>!o.disabled).map(o=>({
      value:o.value,
      label:(o.textContent||'').trim(),
      isEmptyOption:o.value===''
    }));
    return {placeholderOpt,selectable};
  }

  function syncFromSelect(){
    internalSync=true;
    if(select.required){
      select.dataset.cvRequired='1';
      select.required=false;
    }
    const isReq=select.dataset.cvRequired==='1'&&!select.disabled;
    const {placeholderOpt,selectable}=readOptions();
    input.disabled=select.disabled;
    toggleBtn.disabled=select.disabled;
    const chosen=select.selectedOptions?.[0]||select.options?.[select.selectedIndex];
    if(!chosen||(chosen.disabled&&chosen.value==='')){
      input.value='';
      input.placeholder=placeholderOpt?(placeholderOpt.textContent||'').trim()+' (type to search…)':'Type to search or select…';
      clearBtn.hidden=true;
    }else if(chosen.value===''&&selectable.length>1){
      input.value='';
      input.placeholder=(chosen.textContent||'').trim()+' — type to search…';
      clearBtn.hidden=true;
    }else{
      input.value=(chosen.textContent||'').trim();
      input.placeholder='Type to search or select…';
      clearBtn.hidden=select.disabled||!input.value;
    }
    input.required=isReq;
    if(isReq&&!select.value){
      input.setCustomValidity('Please select an option from the list.');
    }else{
      input.setCustomValidity('');
    }
    isFiltering=false;
    internalSync=false;
  }

  function renderList(filterQuery=''){
    const {selectable}=readOptions();
    const q=String(filterQuery||'').trim();
    if(!q){
      currentMatches=selectable.map(opt=>({opt,score:1,autocorrect:false}));
    }else{
      currentMatches=selectable
        .map(opt=>({opt,...scoreMatch(q,opt.label)}))
        .filter(m=>m.score>0)
        .sort((a,b)=>b.score-a.score||a.opt.label.localeCompare(b.opt.label));
    }
    if(!currentMatches.length){
      dropdown.innerHTML=`<div class="CV_COMBO_EMPTY"><i class="fa-solid fa-magnifying-glass"></i> No matching options for "${H(q)}"</div>`;
      activeIndex=-1;
      return;
    }
    if(!q){
      const selIdx=currentMatches.findIndex(m=>m.opt.value===select.value);
      activeIndex=selIdx>=0?selIdx:0;
    }else{
      activeIndex=0;
    }
    dropdown.innerHTML=currentMatches.slice(0,80).map((m,idx)=>{
      const isSelected=m.opt.value===select.value;
      const isActive=idx===activeIndex;
      return `<div class="CV_COMBO_OPTION ${isActive?'is-active':''} ${isSelected?'is-selected':''}" role="option" aria-selected="${isSelected}" data-combo-idx="${idx}"><span class="CV_COMBO_OPT_TEXT">${highlightMatch(m.opt.label,q)}</span>${m.autocorrect?`<span class="CV_COMBO_SUGGEST_BADGE">Suggested</span>`:isSelected?`<i class="fa-solid fa-check CV_COMBO_CHECK" aria-hidden="true"></i>`:''}</div>`;
    }).join('');
    const activeEl=dropdown.querySelector('.CV_COMBO_OPTION.is-active');
    if(activeEl)activeEl.scrollIntoView({block:'nearest'});
  }

  function openDropdown(filterQuery=''){
    if(select.disabled)return;
    renderList(filterQuery);
    dropdown.hidden=false;
    positionDropdown(control,dropdown);
    wrap.classList.add('is-open');
    input.setAttribute('aria-expanded','true');
  }

  function closeDropdown(){
    dropdown.hidden=true;
    wrap.classList.remove('is-open');
    input.setAttribute('aria-expanded','false');
  }

  function commitOption(opt){
    if(!opt)return;
    const changed=select.value!==opt.value;
    select.value=opt.value;
    syncFromSelect();
    closeDropdown();
    if(changed){
      select.dispatchEvent(new Event('change',{bubbles:true}));
      select.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }

  function updateHighlight(newIdx){
    if(!currentMatches.length)return;
    const max=Math.min(80,currentMatches.length);
    activeIndex=((newIdx%max)+max)%max;
    dropdown.querySelectorAll('.CV_COMBO_OPTION').forEach((el,i)=>{
      el.classList.toggle('is-active',i===activeIndex);
    });
    const activeEl=dropdown.querySelector('.CV_COMBO_OPTION.is-active');
    if(activeEl)activeEl.scrollIntoView({block:'nearest'});
  }

  input.addEventListener('focus',()=>{
    if(select.disabled)return;
    openDropdown('');
    setTimeout(()=>{try{input.select();}catch{}},10);
  });

  input.addEventListener('click',()=>{
    if(dropdown.hidden)openDropdown(isFiltering?input.value:'');
  });

  input.addEventListener('input',()=>{
    if(internalSync)return;
    isFiltering=true;
    clearBtn.hidden=!input.value;
    openDropdown(input.value);
  });

  input.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){
      e.preventDefault();
      if(dropdown.hidden)openDropdown(isFiltering?input.value:'');
      else updateHighlight(activeIndex+1);
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      if(dropdown.hidden)openDropdown(isFiltering?input.value:'');
      else updateHighlight(activeIndex-1);
    }else if(e.key==='Enter'){
      if(!dropdown.hidden&&activeIndex>=0&&currentMatches[activeIndex]){
        e.preventDefault();
        commitOption(currentMatches[activeIndex].opt);
      }
    }else if(e.key==='Tab'){
      if(!dropdown.hidden&&isFiltering&&activeIndex>=0&&currentMatches[activeIndex]){
        commitOption(currentMatches[activeIndex].opt);
      }else{
        closeDropdown();
      }
    }else if(e.key==='Escape'){
      if(!dropdown.hidden){
        e.preventDefault();
        e.stopPropagation();
        syncFromSelect();
        closeDropdown();
      }
    }
  });

  dropdown.addEventListener('mousedown',e=>{
    const optEl=e.target.closest('[data-combo-idx]');
    if(!optEl)return;
    e.preventDefault();
    e.stopPropagation();
    const idx=Number(optEl.dataset.comboIdx);
    if(currentMatches[idx])commitOption(currentMatches[idx].opt);
  });

  dropdown.addEventListener('click',e=>{
    e.preventDefault();
    e.stopPropagation();
  });

  clearBtn.addEventListener('mousedown',e=>{
    e.preventDefault();
    e.stopPropagation();
    if(select.disabled)return;
    input.value='';
    isFiltering=true;
    clearBtn.hidden=true;
    input.focus();
    openDropdown('');
  });

  toggleBtn.addEventListener('mousedown',e=>{
    e.preventDefault();
    e.stopPropagation();
    if(select.disabled)return;
    if(dropdown.hidden){
      input.focus();
      openDropdown('');
    }else{
      closeDropdown();
    }
  });

  function commitPendingSearch(){
    if(isFiltering){
      const raw=input.value.trim();
      const {selectable}=readOptions();
      const emptyOpt=selectable.find(o=>o.isEmptyOption);
      if(!raw&&emptyOpt){
        commitOption(emptyOpt);
        return;
      }
      if(raw&&currentMatches.length>0){
        commitOption(currentMatches[0].opt);
        return;
      }
    }
    syncFromSelect();
    closeDropdown();
  }

  input.addEventListener('blur',e=>{
    if(e.relatedTarget&&wrap.contains(e.relatedTarget))return;
    commitPendingSearch();
  });

  select.addEventListener('change',()=>{if(!internalSync)syncFromSelect();});
  new MutationObserver(()=>syncFromSelect()).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','value']});
  syncFromSelect();
}

function upgradeInputAutocomplete(input){
  if(!input||input.dataset.cvAutoUpgraded==='1')return;
  let suggestions=[];
  try{suggestions=JSON.parse(input.dataset.autocompleteList||'[]');}catch{}
  if(!Array.isArray(suggestions)||!suggestions.length)return;
  input.dataset.cvAutoUpgraded='1';
  input.setAttribute('autocomplete','off');

  const wrap=document.createElement('div');
  wrap.className='CV_COMBOBOX CV_COMBOBOX_FREETEXT';
  input.parentNode.insertBefore(wrap,input);
  const control=document.createElement('div');
  control.className='CV_COMBO_CONTROL';
  control.appendChild(input);
  input.classList.add('CV_COMBO_INPUT');
  const toggleBtn=document.createElement('button');
  toggleBtn.type='button';
  toggleBtn.className='CV_COMBO_TOGGLE';
  toggleBtn.tabIndex=-1;
  toggleBtn.innerHTML='<i class="fa-solid fa-chevron-down"></i>';
  control.appendChild(toggleBtn);
  const dropdown=document.createElement('div');
  dropdown.className='CV_COMBO_DROPDOWN';
  dropdown.hidden=true;
  wrap.append(control,dropdown);

  let matches=[],activeIndex=-1;

  function render(q=''){
    const list=(()=>{try{return JSON.parse(input.dataset.autocompleteList||'[]');}catch{return suggestions;}})();
    const query=String(q||'').trim();
    matches=(!query?list.map(s=>({label:s,score:1,autocorrect:false})):list.map(s=>({label:s,...scoreMatch(query,s)})).filter(m=>m.score>0).sort((a,b)=>b.score-a.score));
    if(!matches.length){dropdown.hidden=true;wrap.classList.remove('is-open');return;}
    activeIndex=query?0:-1;
    dropdown.innerHTML=matches.slice(0,40).map((m,i)=>`<div class="CV_COMBO_OPTION ${i===activeIndex?'is-active':''}" data-auto-idx="${i}"><span class="CV_COMBO_OPT_TEXT">${highlightMatch(m.label,query)}</span>${m.autocorrect?'<span class="CV_COMBO_SUGGEST_BADGE">Suggested</span>':''}</div>`).join('');
    dropdown.hidden=false;
    positionDropdown(control,dropdown);
    wrap.classList.add('is-open');
  }

  function pick(label){
    input.value=label;
    dropdown.hidden=true;
    wrap.classList.remove('is-open');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
  }

  input.addEventListener('focus',()=>render(input.value));
  input.addEventListener('input',()=>render(input.value));
  input.addEventListener('keydown',e=>{
    if(dropdown.hidden)return;
    if(e.key==='ArrowDown'){e.preventDefault();activeIndex=Math.min(matches.length-1,activeIndex+1);dropdown.querySelectorAll('.CV_COMBO_OPTION').forEach((el,i)=>el.classList.toggle('is-active',i===activeIndex));}
    else if(e.key==='ArrowUp'){e.preventDefault();activeIndex=Math.max(0,activeIndex-1);dropdown.querySelectorAll('.CV_COMBO_OPTION').forEach((el,i)=>el.classList.toggle('is-active',i===activeIndex));}
    else if(e.key==='Enter'&&activeIndex>=0&&matches[activeIndex]){e.preventDefault();pick(matches[activeIndex].label);}
    else if(e.key==='Escape'){dropdown.hidden=true;wrap.classList.remove('is-open');}
  });
  dropdown.addEventListener('mousedown',e=>{
    const el=e.target.closest('[data-auto-idx]');
    if(!el)return;
    e.preventDefault();
    const item=matches[Number(el.dataset.autoIdx)];
    if(item)pick(item.label);
  });
  toggleBtn.addEventListener('mousedown',e=>{
    e.preventDefault();
    if(dropdown.hidden){input.focus();render('');}
    else{dropdown.hidden=true;wrap.classList.remove('is-open');}
  });
  input.addEventListener('blur',()=>{
    setTimeout(()=>{
      if(!dropdown.hidden){
        const raw=input.value.trim();
        if(raw&&matches.length&&matches[0].autocorrect&&matches[0].score>=68){
          input.value=matches[0].label;
        }
        dropdown.hidden=true;
        wrap.classList.remove('is-open');
      }
    },140);
  });
}

/* --- Universal Pagination + Filter / Search Bar Engine --- */
const paginationStates=new Map();

function getSectionState(sectionKey,defaultPageSize){
  if(!paginationStates.has(sectionKey)){
    paginationStates.set(sectionKey,{page:1,pageSize:defaultPageSize,query:'',filters:{}});
  }
  return paginationStates.get(sectionKey);
}

function buildSectionKey(el,indexFallback=0){
  if(el.dataset.paginateId)return el.dataset.paginateId;
  if(el.id)return 'id:'+el.id;
  const section=el.closest('.CV49_MODULE_SECTION,.CV_SECTION,.CV411_ADMIN_VERIFICATION,.P4_SIDE_CARD,.COMM_DISCUSSIONS,.COMM_MAIN');
  const heading=section?.querySelector('h2,h3,h4')?.textContent?.trim()||el.previousElementSibling?.querySelector?.('h2,h3,h4')?.textContent?.trim()||el.previousElementSibling?.textContent?.trim()?.slice(0,40)||'';
  const mod=document.querySelector('#sideNav .is-active')?.dataset?.module||'view';
  return `${mod}:${el.className}:${heading||indexFallback}`;
}

function extractFiltersForContainer(el,items,kind){
  const filters=[];
  if(!items.length)return filters;

  if(kind==='table'){
    const headers=[...el.querySelectorAll('thead th')].map(th=>(th.textContent||'').trim());
    const filterableHeaders=/^(record|type|status|review status|role|requested role|officer access|barangay|species|disease|government id|category)$/i;
    headers.forEach((hText,colIdx)=>{
      if(!filterableHeaders.test(hText)||filters.length>=3)return;
      const values=new Set();
      items.forEach(tr=>{
        const cell=tr.children[colIdx];
        if(!cell)return;
        const pill=cell.querySelector('.CV_PILL,.P4_STATUS');
        const val=((pill?pill.textContent:cell.textContent)||'').trim();
        if(val&&val!=='—'&&val.length<=45)values.add(val);
      });
      if(/^record$/i.test(hText)){values.add('Vaccination');values.add('Treatment');}
      if(values.size>=1&&values.size<=45){
        filters.push({
          key:'col_'+colIdx,
          label:hText,
          options:[...values].sort((a,b)=>a.localeCompare(b)),
          match:(tr,selectedVal)=>{
            const cell=tr.children[colIdx];
            const pill=cell?.querySelector('.CV_PILL,.P4_STATUS');
            const val=((pill?pill.textContent:cell?.textContent)||'').trim();
            return val.toLowerCase()===selectedVal.toLowerCase();
          }
        });
      }
    });
    return filters;
  }

  if(kind==='pet-directory'||kind==='pet-grid'){
    const statuses=new Set(),speciesSet=new Set(['Dog','Cat']),barangays=new Set();
    items.forEach(card=>{
      const st=(card.dataset.status||card.querySelector('.CV_PILL,.P4_STATUS')?.textContent||'').trim();
      if(st)statuses.add(st);
      const sp=(card.dataset.species||card.querySelector('.P4_PET_FACT')?.textContent||'').trim();
      if(sp==='Dog'||sp==='Cat')speciesSet.add(sp);
      else{
        const sub=(card.querySelector('small')?.textContent||'').trim();
        if(/^dog\b/i.test(sub))speciesSet.add('Dog');
        if(/^cat\b/i.test(sub))speciesSet.add('Cat');
      }
      const brgy=(card.dataset.barangay||card.querySelector('.P4_PET_BARANGAY')?.textContent||card.querySelector('div > span')?.textContent||'').trim();
      if(brgy&&!brgy.includes('QR')&&!brgy.includes('CVH-')&&brgy.length<=40)barangays.add(brgy);
    });
    if(statuses.size>=1){
      filters.push({
        key:'status',
        label:'Status',
        options:[...statuses],
        match:(card,val)=>{
          const st=(card.dataset.status||card.querySelector('.CV_PILL,.P4_STATUS')?.textContent||'').trim();
          return st.toLowerCase()===val.toLowerCase();
        }
      });
    }
    filters.push({
      key:'species',
      label:'Species',
      options:[...speciesSet],
      match:(card,val)=>{
        const sp=(card.dataset.species||card.querySelector('.P4_PET_FACT')?.textContent||card.querySelector('small')?.textContent||'').trim();
        return sp.toLowerCase().startsWith(val.toLowerCase());
      }
    });
    if(barangays.size>=1){
      filters.push({
        key:'barangay',
        label:'Barangay',
        options:[...barangays].sort((a,b)=>a.localeCompare(b)),
        match:(card,val)=>{
          const brgy=(card.dataset.barangay||card.querySelector('.P4_PET_BARANGAY')?.textContent||card.querySelector('div > span')?.textContent||'').trim();
          return brgy.toLowerCase()===val.toLowerCase();
        }
      });
    }
    return filters;
  }

  if(kind==='doc-grid'){
    filters.push({
      key:'visibility',
      label:'Visibility',
      options:['Shared on QR','Private'],
      match:(card,val)=>(card.textContent||'').toLowerCase().includes(val.toLowerCase())
    });
    return filters;
  }

  if(kind==='history-feed'){
    const types=new Set();
    items.forEach(item=>{
      const p=(item.querySelector('.CV_PILL')?.textContent||'').trim();
      if(p)types.add(p);
    });
    if(types.size>=1){
      filters.push({
        key:'type',
        label:'Transfer type',
        options:[...types],
        match:(item,val)=>(item.querySelector('.CV_PILL')?.textContent||'').trim().toLowerCase()===val.toLowerCase()
      });
    }
    return filters;
  }

  if(kind==='community-posts'){
    const channels=new Set();
    items.forEach(post=>{
      const ch=(post.dataset.channelName||post.querySelector('.COMM_CHANNEL_LINK')?.textContent||'').replace(/^#/,'').trim();
      if(ch)channels.add(ch);
    });
    const pageRoot=el.closest('.COMM_PAGE')||document;
    pageRoot.querySelectorAll('.COMM_CHANNEL_LIST .COMM_CHANNEL_TEXT strong').forEach(node=>{
      const ch=(node.textContent||'').trim();
      if(ch)channels.add(ch);
    });
    // Only show Channel filter on the main feed (not inside a single-channel page)
    const isSingleChannelPage=Boolean(el.closest('.COMM_CHANNEL_PAGE'));
    if(!isSingleChannelPage&&channels.size>=1){
      filters.push({
        key:'channel',
        label:'Channel',
        options:[...channels].sort((a,b)=>a.localeCompare(b)),
        match:(post,val)=>(post.dataset.channelName||post.querySelector('.COMM_CHANNEL_LINK')?.textContent||'').replace(/^#/,'').trim().toLowerCase()===val.toLowerCase()
      });
    }
    return filters;
  }

  if(kind==='community-notices'){
    const tags=new Set();
    items.forEach(n=>{
      const t=(n.querySelector('.COMM_TAG.official')?.textContent||'').trim();
      if(t)tags.add(t);
    });
    if(tags.size>=1){
      filters.push({
        key:'category',
        label:'Notice type',
        options:[...tags],
        match:(n,val)=>(n.querySelector('.COMM_TAG.official')?.textContent||'').trim().toLowerCase()===val.toLowerCase()
      });
    }
    return filters;
  }

  if(kind==='adoption-grid'){
    const barangays=new Set();
    items.forEach(card=>{
      const b=(card.dataset.barangay||'').trim();
      if(b&&b!=='Barangay unknown')barangays.add(b);
    });
    filters.push({
      key:'species',
      label:'Species',
      options:['Dog','Cat'],
      match:(card,val)=>(card.dataset.species||'').toLowerCase()===val.toLowerCase()||card.textContent.toLowerCase().includes(val.toLowerCase())
    });
    filters.push({
      key:'housing',
      label:'Housing',
      options:['any','apartment','house','yard'],
      match:(card,val)=>{
        const req=(card.dataset.housing||'any').toLowerCase();
        const h=val.toLowerCase();
        return !req||req==='any'||req===h||(h==='yard'&&['house','apartment'].includes(req))||(h==='house'&&req==='apartment');
      }
    });
    if(barangays.size>=1){
      filters.push({
        key:'barangay',
        label:'Barangay',
        options:[...barangays].sort((a,b)=>a.localeCompare(b)),
        match:(card,val)=>(card.dataset.barangay||'').toLowerCase()===val.toLowerCase()
      });
    }
    return filters;
  }

  if(kind==='alert-list'){
    filters.push({
      key:'priority',
      label:'Priority',
      options:['high','medium','low'],
      match:(card,val)=>(card.dataset.severity||'').toLowerCase()===val.toLowerCase()
    });
    filters.push({
      key:'type',
      label:'Type',
      options:['outbreak','advisory'],
      match:(card,val)=>(card.dataset.kind||'').toLowerCase()===val.toLowerCase()
    });
    filters.push({
      key:'status',
      label:'Status',
      options:['active','inactive'],
      match:(card,val)=>(card.dataset.active||'').toLowerCase()===val.toLowerCase()
    });
    return filters;
  }

  return filters;
}

function setupPaginatedContainer(el,cfg){
  const {kind,itemSelector,defaultPageSize=8,searchPlaceholder='Search records…',externalFilterCheck=null,hideToolbarSearch=false}=cfg;
  const allItems=[...el.querySelectorAll(itemSelector)].filter(item=>!(item.tagName==='TR'&&item.querySelector('td[colspan]')));
  const sectionKey=buildSectionKey(el);
  const state=getSectionState(sectionKey,defaultPageSize);

  // Remove any previous toolbar/footer attached to this container
  if(el._cvToolbar?.isConnected)el._cvToolbar.remove();
  if(el._cvFooter?.isConnected)el._cvFooter.remove();
  if(el._cvEmptyFilterNode?.isConnected)el._cvEmptyFilterNode.remove();

  // Do not show pagination chrome if there are 0 items and no external filters
  if(allItems.length===0)return;

  const filters=extractFiltersForContainer(el,allItems,kind);

  // Create Toolbar (Search + Filters)
  const toolbar=document.createElement('div');
  toolbar.className='CV_PAGINATE_TOOLBAR';
  toolbar.innerHTML=(!hideToolbarSearch?`<div class="CV_PAGINATE_SEARCH"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" class="CV_PAGINATE_INPUT" placeholder="${H(searchPlaceholder)}" value="${H(state.query)}" aria-label="${H(searchPlaceholder)}"><button type="button" class="CV_PAGINATE_CLEAR" aria-label="Clear search" ${state.query?'':'hidden'}><i class="fa-solid fa-xmark"></i></button></div>`:'')+
    (filters.length?`<div class="CV_PAGINATE_FILTERS">${filters.map(f=>`<label class="CV_PAGINATE_FILTER_LABEL"><span>${H(f.label)}</span><select class="CV_PAGINATE_FILTER_SELECT" data-filter-key="${H(f.key)}"><option value="">All</option>${f.options.map(o=>`<option value="${H(o)}" ${state.filters[f.key]===o?'selected':''}>${H(o)}</option>`).join('')}</select></label>`).join('')}</div>`:'');

  // Create Footer (Info + Page Size + Page Buttons)
  const footer=document.createElement('div');
  footer.className='CV_PAGINATE_FOOTER';
  const sizeOptions=[...new Set([6,8,10,16,25,50,defaultPageSize])].sort((a,b)=>a-b);
  footer.innerHTML=`<div class="CV_PAGINATE_INFO"></div><div class="CV_PAGINATE_CONTROLS"><label class="CV_PAGINATE_SIZE"><span>Show</span><select class="CV_PAGINATE_SIZE_SELECT" aria-label="Items per page">${sizeOptions.map(n=>`<option value="${n}" ${Number(state.pageSize)===n?'selected':''}>${n}</option>`).join('')}</select></label><div class="CV_PAGINATE_BTNS" role="navigation" aria-label="Pagination"></div></div>`;

  el.parentNode.insertBefore(toolbar,el);
  el.parentNode.insertBefore(footer,el.nextSibling);
  el._cvToolbar=toolbar;
  el._cvFooter=footer;

  const searchInput=toolbar.querySelector('.CV_PAGINATE_INPUT');
  const clearBtn=toolbar.querySelector('.CV_PAGINATE_CLEAR');
  const infoEl=footer.querySelector('.CV_PAGINATE_INFO');
  const sizeSelect=footer.querySelector('.CV_PAGINATE_SIZE_SELECT');
  const btnsEl=footer.querySelector('.CV_PAGINATE_BTNS');

  let emptyFilterNode=null;
  function ensureEmptyNode(){
    if(emptyFilterNode)return emptyFilterNode;
    if(kind==='table'){
      const tbody=el.querySelector('tbody');
      const colCount=el.querySelectorAll('thead th').length||1;
      const tr=document.createElement('tr');
      tr.className='CV_PAGINATE_EMPTY_ROW';
      tr.innerHTML=`<td colspan="${colCount}" style="text-align:center;padding:24px;color:var(--sub);">No records match your search or filter. <button type="button" class="CV_SOFT CV_BUTTON" data-reset-filters style="margin-left:8px;">Reset filters</button></td>`;
      tbody?.appendChild(tr);
      emptyFilterNode=tr;
    }else{
      const div=document.createElement('div');
      div.className='CV_EMPTY CV_PAGINATE_EMPTY_NODE';
      div.innerHTML=`<i class="fa-solid fa-filter-circle-xmark"></i><p>No records match your current search or filter.</p><button type="button" class="CV_SOFT CV_BUTTON" data-reset-filters style="margin-top:8px;">Reset filters</button>`;
      el.appendChild(div);
      emptyFilterNode=div;
    }
    emptyFilterNode.querySelector('[data-reset-filters]')?.addEventListener('click',()=>{
      state.query='';
      state.filters={};
      state.page=1;
      if(searchInput)searchInput.value='';
      if(clearBtn)clearBtn.hidden=true;
      toolbar.querySelectorAll('select[data-filter-key]').forEach(s=>{s.value='';});
      apply();
    });
    el._cvEmptyFilterNode=emptyFilterNode;
    return emptyFilterNode;
  }

  function apply(){
    const q=String(state.query||'').trim();
    const matched=allItems.filter(item=>{
      if(externalFilterCheck&&!externalFilterCheck(item))return false;
      for(const f of filters){
        const fVal=state.filters[f.key];
        if(fVal&&!f.match(item,fVal))return false;
      }
      if(q){
        const text=(item.textContent||'')+' '+(item.dataset.owner||'')+' '+(item.dataset.barangay||'')+' '+(item.dataset.species||'');
        const {score}=scoreMatch(q,text);
        if(score<=0)return false;
      }
      return true;
    });

    const total=matched.length;
    const pageSize=Math.max(1,Number(state.pageSize)||defaultPageSize);
    const totalPages=Math.max(1,Math.ceil(total/pageSize));
    if(state.page>totalPages)state.page=totalPages;
    if(state.page<1)state.page=1;

    const start=(state.page-1)*pageSize;
    const end=start+pageSize;
    const visibleSet=new Set(matched.slice(start,end));

    allItems.forEach(item=>{
      const show=visibleSet.has(item);
      item.hidden=!show;
      item.style.display=show?'':'none';
      if(show)item.removeAttribute('data-cv-page-hidden');
      else item.setAttribute('data-cv-page-hidden','1');
    });

    if(total===0&&allItems.length>0){
      const node=ensureEmptyNode();
      node.hidden=false;
      node.style.display='';
    }else if(emptyFilterNode){
      emptyFilterNode.hidden=true;
      emptyFilterNode.style.display='none';
    }

    const from=total?start+1:0;
    const to=Math.min(total,end);
    infoEl.innerHTML=total
      ?`Showing <strong>${from}–${to}</strong> of <strong>${total}</strong>${total!==allItems.length?` (filtered from ${allItems.length})`:''}`
      :`Showing <strong>0</strong> of <strong>${allItems.length}</strong> records`;

    // Build page buttons with smart window
    const pageBtns=[];
    pageBtns.push(`<button type="button" class="CV_PAGE_BTN" data-cv-page="prev" ${state.page<=1?'disabled':''} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i> Prev</button>`);
    const pages=[];
    for(let p=1;p<=totalPages;p++){
      if(p===1||p===totalPages||Math.abs(p-state.page)<=1)pages.push(p);
      else if(pages[pages.length-1]!=='…')pages.push('…');
    }
    for(const p of pages){
      if(p==='…')pageBtns.push(`<span class="CV_PAGE_DOTS">…</span>`);
      else pageBtns.push(`<button type="button" class="CV_PAGE_BTN ${p===state.page?'is-active':''}" data-cv-page="${p}" aria-current="${p===state.page?'page':'false'}">${p}</button>`);
    }
    pageBtns.push(`<button type="button" class="CV_PAGE_BTN" data-cv-page="next" ${state.page>=totalPages?'disabled':''} aria-label="Next page">Next <i class="fa-solid fa-chevron-right"></i></button>`);
    btnsEl.innerHTML=pageBtns.join('');
  }

  searchInput?.addEventListener('input',()=>{
    state.query=searchInput.value;
    state.page=1;
    if(clearBtn)clearBtn.hidden=!searchInput.value;
    apply();
  });

  clearBtn?.addEventListener('click',()=>{
    state.query='';
    state.page=1;
    if(searchInput){searchInput.value='';searchInput.focus();}
    clearBtn.hidden=true;
    apply();
  });

  toolbar.querySelectorAll('select[data-filter-key]').forEach(sel=>{
    sel.addEventListener('change',()=>{
      state.filters[sel.dataset.filterKey]=sel.value;
      state.page=1;
      apply();
    });
  });

  sizeSelect?.addEventListener('change',()=>{
    state.pageSize=Number(sizeSelect.value)||defaultPageSize;
    state.page=1;
    apply();
  });

  btnsEl.addEventListener('click',e=>{
    const btn=e.target.closest('[data-cv-page]');
    if(!btn||btn.disabled)return;
    const val=btn.dataset.cvPage;
    if(val==='prev')state.page--;
    else if(val==='next')state.page++;
    else state.page=Number(val)||1;
    apply();
  });

  el._cvReapplyPagination=apply;
  el._cvSetSearch=q=>{
    state.query=String(q||'');
    state.page=1;
    if(searchInput)searchInput.value=state.query;
    if(clearBtn)clearBtn.hidden=!state.query;
    apply();
  };
  el._cvGetSearch=()=>state.query||'';
  apply();
}

function setContainerSearch(el,query=''){
  if(!el)return;
  if(typeof el._cvSetSearch==='function'){
    el._cvSetSearch(query);
  }
}

function setPageSearch(query='',root=document){
  const scope=root.nodeType===1?root:document;
  scope.querySelectorAll('[data-cv-paginated="1"]').forEach(el=>{
    if(el.offsetParent!==null&&typeof el._cvSetSearch==='function'){
      el._cvSetSearch(query);
    }
  });
}

function toast(text,kind='success',duration=4200){
  const msg=String(text||'').trim();
  if(!msg)return;
  let host=document.getElementById('cvToastHost');
  if(!host){
    host=document.createElement('div');
    host.id='cvToastHost';
    host.className='CV_TOAST_HOST';
    host.setAttribute('aria-live','polite');
    document.body.appendChild(host);
  }
  const item=document.createElement('div');
  const isErr=kind==='error'||kind===true;
  item.className=`CV_TOAST ${isErr?'is-error':'is-success'}`;
  item.innerHTML=`<i class="fa-solid ${isErr?'fa-circle-exclamation':'fa-circle-check'}" aria-hidden="true"></i><span>${H(msg)}</span><button type="button" class="CV_TOAST_CLOSE" aria-label="Dismiss notification"><i class="fa-solid fa-xmark"></i></button>`;
  const remove=()=>{
    if(!item.isConnected)return;
    item.classList.add('is-leaving');
    setTimeout(()=>item.remove(),180);
  };
  item.querySelector('.CV_TOAST_CLOSE')?.addEventListener('click',remove);
  host.appendChild(item);
  while(host.children.length>4)host.firstElementChild.remove();
  if(duration>0)setTimeout(remove,duration);
}

function confirmModal({title='Confirm action',description='Are you sure you want to proceed?',confirmLabel='Confirm',danger=false,onConfirm}){
  const overlay=document.createElement('div');
  overlay.className='CV_MODAL CV412_CONFIRM';
  overlay.innerHTML=`<div class="CV_MODAL_CARD CV412_CONFIRM_CARD" role="dialog" aria-modal="true" aria-labelledby="cvConfirmModalTitle"><div class="CV_MODAL_HEAD"><h3 id="cvConfirmModalTitle">${H(title)}</h3><button type="button" data-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><p class="CV412_CONFIRM_TEXT">${H(description)}</p><div class="CV412_CONFIRM_ERROR" role="alert" hidden></div><div class="CV412_CONFIRM_FOOT"><button type="button" class="CV_SOFT CV_BUTTON" data-close>Cancel</button><button type="button" class="CV_BUTTON ${danger?'CV412_DANGER':'PRIMARY_ACTION'}" data-confirm>${H(confirmLabel)}</button></div></div>`;
  const close=()=>overlay.remove();
  overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('[data-close]'))close();});
  overlay.querySelector('[data-confirm]').addEventListener('click',async()=>{
    const btn=overlay.querySelector('[data-confirm]');
    btn.disabled=true;
    const prev=btn.textContent;
    btn.textContent='Processing…';
    try{
      await onConfirm?.();
      close();
    }catch(err){
      const out=overlay.querySelector('.CV412_CONFIRM_ERROR');
      out.hidden=false;
      out.textContent=err?.message||'Unable to complete this action.';
      btn.disabled=false;
      btn.textContent=prev;
    }
  });
  document.body.appendChild(overlay);
  enhanceModals(overlay);
  overlay.querySelector('[data-confirm]')?.focus();
  return overlay;
}

function skeleton(title='Loading workspace…',cards=4){
  return `<div class="CV_SKELETON_WRAP" role="status" aria-label="${H(title)}"><div class="CV_SKELETON_HEAD"><div class="CV_SKEL_LINE is-kicker"></div><div class="CV_SKEL_LINE is-title"></div><div class="CV_SKEL_LINE is-sub"></div></div><div class="CV_SKELETON_STATS">${Array.from({length:3},()=>`<div class="CV_SKEL_CARD is-stat"></div>`).join('')}</div><div class="CV_SKELETON_GRID">${Array.from({length:cards},()=>`<div class="CV_SKEL_CARD"></div>`).join('')}</div></div>`;
}

function enhanceModals(root=document){
  const modals=[];
  if(root.nodeType===1&&root.matches?.('.CV_MODAL,.COMM_MODAL'))modals.push(root);
  if(root.querySelectorAll)modals.push(...root.querySelectorAll('.CV_MODAL,.COMM_MODAL'));
  for(const m of modals){
    if(m.dataset.cvModalEnhanced==='1')continue;
    m.dataset.cvModalEnhanced='1';
    setTimeout(()=>{
      if(!m.isConnected)return;
      const firstInput=m.querySelector('.CV_COMBO_INPUT, input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]), select:not(.CV_COMBO_SELECT_HIDDEN), textarea');
      if(firstInput){
        firstInput.focus();
      }else{
        m.querySelector('[data-confirm],[data-close]')?.focus();
      }
    },15);
    m.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        const openCombo=m.querySelector('.CV_COMBOBOX.is-open');
        if(openCombo)return;
        const closeBtn=m.querySelector('[data-close]');
        if(closeBtn){e.preventDefault();closeBtn.click();}else m.remove();
      }else if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&e.target?.tagName==='TEXTAREA'){
        const form=e.target.closest('form');
        if(form){e.preventDefault();form.requestSubmit();}
      }
    });
  }
}

function paginateIfNeeded(el,cfg,onFirstSetup){
  const items=[...el.querySelectorAll(cfg.itemSelector)].filter(item=>!(item.tagName==='TR'&&item.querySelector('td[colspan]')&&!item.classList.contains('CV_PAGINATE_EMPTY_ROW')));
  if(items.length===0){
    if(el._cvToolbar?.isConnected)el._cvToolbar.remove();
    if(el._cvFooter?.isConnected)el._cvFooter.remove();
    if(el._cvEmptyFilterNode?.isConnected)el._cvEmptyFilterNode.remove();
    el._cvPaginatedItems=null;
    return;
  }
  if(el._cvToolbar?.isConnected&&el._cvFooter?.isConnected&&Array.isArray(el._cvPaginatedItems)&&el._cvPaginatedItems.length===items.length&&el._cvPaginatedItems.every((node,idx)=>node===items[idx])){
    return;
  }
  const firstTime=!el.dataset.cvPaginated;
  el.dataset.cvPaginated='1';
  el._cvPaginatedItems=items;
  setupPaginatedContainer(el,cfg);
  if(firstTime&&typeof onFirstSetup==='function')onFirstSetup();
}

function enhancePagination(root=document){
  const scope=root.nodeType===1?root:document;
  // 1. All tables (.CV_TABLE_WRAP)
  scope.querySelectorAll('.CV_TABLE_WRAP').forEach(el=>{
    paginateIfNeeded(el,{kind:'table',itemSelector:'tbody > tr:not(.CV_PAGINATE_EMPTY_ROW)',defaultPageSize:8,searchPlaceholder:'Search table records…'});
  });

  // 2. Pet Directories (.CV49_PET_DIRECTORY in Medical & Traceability)
  scope.querySelectorAll('.CV49_PET_DIRECTORY').forEach(el=>{
    paginateIfNeeded(el,{kind:'pet-directory',itemSelector:':scope > .CV49_DIRECTORY_CARD',defaultPageSize:6,searchPlaceholder:'Search pets by name, breed, barangay, or owner…'});
  });

  // 3. My Pets Grid (.P4_PET_GRID in Pet Registry)
  scope.querySelectorAll('.P4_PET_GRID').forEach(el=>{
    paginateIfNeeded(el,{kind:'pet-grid',itemSelector:':scope > .P4_PET_CARD',defaultPageSize:6,searchPlaceholder:'Search my pets by name, breed, or barangay…'});
  });

  // 4. Adoption Cards Grid (#adoptionCards)
  scope.querySelectorAll('#adoptionCards.P47_ADOPTION_GRID').forEach(el=>{
    const ws=el.closest('.CV_WORKSPACE')||document;
    const spEl=ws.querySelector('#adoptionSpecies'),hoEl=ws.querySelector('#adoptionHousing'),brEl=ws.querySelector('#adoptionBarangay');
    const extCheck=card=>{
      const sp=spEl?.value||'';
      const ho=hoEl?.value||'';
      const br=(brEl?.value||'').trim().toLowerCase();
      if(sp&&!(card.textContent||'').includes(sp))return false;
      if(br&&!(card.textContent||'').toLowerCase().includes(br))return false;
      if(ho&&(card.dataset.housing&&card.dataset.housing!=='any'&&card.dataset.housing!==ho))return false;
      return true;
    };
    paginateIfNeeded(el,{kind:'adoption-grid',itemSelector:':scope > .P47_ADOPT_CARD',defaultPageSize:6,searchPlaceholder:'Search adoptable pets by name, breed, story, or barangay…',externalFilterCheck:extCheck},()=>{
      [spEl,hoEl,brEl].forEach(ctrl=>ctrl?.addEventListener('change',()=>el._cvReapplyPagination?.()));
    });
  });

  // 5. Outbreak Alerts List (#alertCards)
  scope.querySelectorAll('#alertCards.CV49_ALERT_LIST').forEach(el=>{
    const ws=el.closest('.CV_WORKSPACE')||document;
    const fPri=ws.querySelector('#alertPriority'),fTyp=ws.querySelector('#alertType'),fSta=ws.querySelector('#alertStatus');
    const extCheck=card=>{
      if(fPri?.value&&card.dataset.severity!==fPri.value)return false;
      if(fTyp?.value&&card.dataset.kind!==fTyp.value)return false;
      if(fSta?.value&&card.dataset.active!==fSta.value)return false;
      return true;
    };
    paginateIfNeeded(el,{kind:'alert-list',itemSelector:':scope > .CV49_ALERT_CARD',defaultPageSize:6,searchPlaceholder:'Search alerts by headline, message, barangay, or category…',externalFilterCheck:extCheck},()=>{
      [fPri,fTyp,fSta].forEach(ctrl=>ctrl?.addEventListener('change',()=>el._cvReapplyPagination?.()));
    });
  });

  // 6. Uploaded Health Documents Grid (.CV49_DOC_GRID)
  scope.querySelectorAll('.CV49_DOC_GRID').forEach(el=>{
    paginateIfNeeded(el,{kind:'doc-grid',itemSelector:':scope > .CV49_DOC_CARD',defaultPageSize:6,searchPlaceholder:'Search uploaded health documents…'});
  });

  // 7. Ownership History Feed (.CV49_HISTORY_FEED)
  scope.querySelectorAll('.CV49_HISTORY_FEED').forEach(el=>{
    paginateIfNeeded(el,{kind:'history-feed',itemSelector:':scope > .CV49_HISTORY_EVENT',defaultPageSize:6,searchPlaceholder:'Search ownership history by owner or pet name…'});
  });

  // 8. Incident Surveillance Barangay Report Feed (#p4ReportRows) & Declared Outbreaks (.CV420_OUTBREAK_LIST)
  scope.querySelectorAll('#p4ReportRows.P4_REPORT_FEED').forEach(el=>{
    paginateIfNeeded(el,{kind:'surveillance-feed',itemSelector:':scope > .P46_BRNG_GROUP',defaultPageSize:8,searchPlaceholder:'Search barangay or incident category…'});
  });

  scope.querySelectorAll('.CV420_OUTBREAK_LIST').forEach(el=>{
    paginateIfNeeded(el,{kind:'outbreak-list',itemSelector:':scope > .CV420_OUTBREAK_ROW',defaultPageSize:5,searchPlaceholder:'Search declared outbreaks…'});
  });

  // 9. Community Feed, Channel Discussions & Official Notices (.COMM_POST_LIST, .COMM_OFFICIAL_LIST)
  scope.querySelectorAll('.COMM_POST_LIST').forEach(el=>{
    if(el.querySelector('.COMM_LOADING'))return;
    paginateIfNeeded(el,{kind:'community-posts',itemSelector:':scope > .COMM_POST',defaultPageSize:6,searchPlaceholder:'Filter discussions by title, topic, or author…'});
  });

  scope.querySelectorAll('.COMM_OFFICIAL_LIST').forEach(el=>{
    paginateIfNeeded(el,{kind:'community-notices',itemSelector:':scope > .COMM_OFFICIAL',defaultPageSize:6,searchPlaceholder:'Search official announcements and advisories…'});
  });
}

let enhancing=false;
function upgrade(root=document){
  if(enhancing)return;
  enhancing=true;
  try{
    const targets=[...root.querySelectorAll('input[name="barangay"],input[id="adoptionBarangay"]')];
    for(const input of targets){
      const select=document.createElement('select');
      const isFilter=input.id==='adoptionBarangay';
      select.name=input.name;select.id=input.id;select.className=input.className;select.required=input.required&&!isFilter;select.disabled=input.disabled;
      select.setAttribute('data-cityvet-barangay','1');select.innerHTML=options(input.value,isFilter);
      if(input.hasAttribute('aria-label'))select.setAttribute('aria-label',input.getAttribute('aria-label'));
      input.replaceWith(select);
    }
    root.querySelectorAll('select').forEach(upgradeSelectCombobox);
    root.querySelectorAll('input[data-autocomplete-list]').forEach(upgradeInputAutocomplete);
    enhancePagination(root);
    enhanceModals(root);
  }finally{
    enhancing=false;
  }
}

function isInternalMutationNode(node){
  if(!node||node.nodeType!==1)return true;
  if(node.matches?.('.CV_COMBOBOX,.CV_PAGINATE_TOOLBAR,.CV_PAGINATE_FOOTER,.CV_PAGINATE_EMPTY_NODE,.CV_PAGINATE_EMPTY_ROW,.COMM_AVATAR_IMAGE,.CV_TOAST_HOST,.CV_TOAST'))return true;
  if(node.closest?.('.CV_COMBOBOX,.CV_PAGINATE_TOOLBAR,.CV_PAGINATE_FOOTER,.CV_PAGINATE_EMPTY_NODE,.CV_PAGINATE_EMPTY_ROW,.CV_TOAST_HOST'))return true;
  return false;
}

function listen(){
  upgrade();
  let timer=null;
  new MutationObserver(mutations=>{
    if(enhancing)return;
    const relevant=mutations.some(m=>{
      if(m.target?.closest?.('.CV_COMBOBOX,.CV_PAGINATE_TOOLBAR,.CV_PAGINATE_FOOTER,.CV_PAGINATE_EMPTY_NODE,.CV_PAGINATE_EMPTY_ROW,.CV_TOAST_HOST'))return false;
      for(const n of m.addedNodes){
        if(!isInternalMutationNode(n))return true;
      }
      return false;
    });
    if(!relevant)return;
    clearTimeout(timer);
    timer=setTimeout(()=>upgrade(),20);
  }).observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',listen,{once:true});else listen();
window.CityVetBarangays=Object.freeze({names,list:names,match,options,optionsHtml:options,upgrade});
window.CityVetUI=Object.freeze({upgrade,enhancePagination,scoreMatch,setContainerSearch,setPageSearch,toast,confirm:confirmModal,skeleton});
})();
