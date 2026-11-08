/* CityVetHub 4.11 – Iligan City barangays. Philippine Statistics Authority PSGC listing.
 * Source: https://psa.gov.ph/classification/psgc/barangays/1030900000
 * Values are stable canonical labels for all website forms.
 */
(function(){
'use strict';
const names=Object.freeze([
'Abuno','Acmac-Mariano Badelles Sr.','Bagong Silang','Bonbonon','Bunawan','Buru-un','Dalipuga','Del Carmen','Digkilaan','Ditucalan','Dulag','Hinaplanon','Hindang','Kabacsanan','Kalilangan','Kiwalan','Lanipao','Luinab','Mahayahay','Mainit','Mandulog','Maria Cristina','Palao','Panoroganan','Poblacion','Puga-an','Rogongon','San Miguel','San Roque','Santa Elena','Santa Filomena','Santiago','Santo Rosario','Saray','Suarez','Tambacan','Tibanga','Tipanoy','Tomas L. Cabili','Tubod','Ubaldo Laya','Upper Hinaplanon','Upper Tominobo','Villa Verde'
]);
const norm=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const aliases={'acmac':'Acmac-Mariano Badelles Sr.','palao':'Palao','paláo':'Palao','tominoboupper':'Upper Tominobo','tominoboproper':'Tomas L. Cabili','saraytibanga':'Saray'};
function match(raw){const n=norm(raw);return names.find(s=>norm(s)===n)||aliases[n]||'';}
function options(value='',allowEmpty=false){const current=match(value),invalid=value&&!current;
 return `${allowEmpty?'<option value="">All barangays</option>':'<option value="" disabled '+(!value?'selected':'')+'>Select barangay</option>'}`+
   `${invalid?`<option selected value="${String(value).replaceAll('&','&amp;').replaceAll('"','&quot;')}">Previous value: ${String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')}</option>`:''}`+
   names.map(name=>`<option value="${name}" ${name===current?'selected':''}>${name}</option>`).join('');
}
function upgrade(root=document){
  const targets=[...root.querySelectorAll('input[name="barangay"],input[id="adoptionBarangay"]')];
  for(const input of targets){
    const select=document.createElement('select');
    const isFilter=input.id==='adoptionBarangay';
    select.name=input.name;select.id=input.id;select.className=input.className;select.required=input.required&&!isFilter;select.disabled=input.disabled;
    select.setAttribute('data-cityvet-barangay','1');select.innerHTML=options(input.value,isFilter);
    if(input.hasAttribute('aria-label'))select.setAttribute('aria-label',input.getAttribute('aria-label'));
    input.replaceWith(select);
  }
}
function listen(){upgrade();new MutationObserver(mutations=>{if(mutations.some(m=>m.addedNodes.length))upgrade();}).observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',listen,{once:true});else listen();
window.CityVetBarangays=Object.freeze({names,match,options,upgrade});
})();
