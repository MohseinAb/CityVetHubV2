/* CityVetHub Community 4.16 — role-aware forum and official CVO notices.
   Backend Function owns membership, verification, and write authorization. */
(function(){'use strict';
 const H=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=s=>{try{return new Date(s).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'});}catch{return ''}};
 const avatar=name=>H((name||'U').trim().split(/\s+/).slice(0,2).map(s=>s[0]||'').join('').toUpperCase());
 const fa=n=>`<i class="fa-solid fa-${n}" aria-hidden="true"></i>`;
 const txt=s=>H(s).replace(/\n/g,'<br>');
 const button=(label,action,attrs='',sty='')=>`<button type="button" class="COMM_BTN ${sty}" data-community-action="${action}" ${attrs}>${label}</button>`;
 function mount({api,current,container}){
  const role=current.role,owner=role==='owner',officer=role==='officer',admin=role==='admin';
  let active=false,overview=null,selected=null,selectedPost=null,section='feed',searchQuery='',revision=0,notifyTimer=null;
  const isVerified=()=>!!overview?.verified;
  const action=(a,data={})=>api.operate('community'+a,data);
  const message=(text,success=false)=>{const n=container.querySelector('#communityNotice');if(n){n.textContent=text;n.className='COMM_NOTICE '+(success?'ok':'error');n.hidden=!text;}else if(text)alert(text);};
  const handlerErr=e=>api.readableError(e);
  function modal(title,content,onSubmit,submitText='Save changes'){
   document.querySelector('.COMM_MODAL')?.remove();
   const shade=document.createElement('div');shade.className='COMM_MODAL';shade.setAttribute('role','presentation');
   shade.innerHTML=`<div class="COMM_MODAL_DIALOG" role="dialog" aria-modal="true" aria-label="${H(title)}"><div class="COMM_MODAL_HEADER"><h3>${H(title)}</h3><button type="button" class="COMM_ICONBTN" data-close aria-label="Close">×</button></div><form class="COMM_FORM">${content}<p class="COMM_MODAL_ERROR" hidden role="alert"></p><div class="COMM_FORM_FOOT"><button type="button" class="COMM_BTN" data-close>Cancel</button><button type="submit" class="COMM_BTN primary">${H(submitText)}</button></div></form></div>`;
   document.body.append(shade);shade.querySelector('[data-close]').focus();
   shade.addEventListener('click',e=>{if(e.target===shade||e.target.closest('[data-close]'))shade.remove();});
   const key=e=>{if(e.key==='Escape'){shade.remove();document.removeEventListener('keydown',key);}};document.addEventListener('keydown',key);
   shade.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,submit=form.querySelector('[type="submit"]');submit.disabled=true;
     const err=form.querySelector('.COMM_MODAL_ERROR');err.hidden=true;
     try{await onSubmit(form);shade.remove();document.removeEventListener('keydown',key);}catch(x){err.hidden=false;err.textContent=handlerErr(x);}finally{submit.disabled=false;}});
  }
  function verifiedNotice(){return `<div class="COMM_VERIFY">${fa('shield-halved')} Account verification is required to publish discussions, create channels, comment or vote. Public discussions remain readable. ${button('Go to My Profile','goProfile','','small')}</div>`;}
  function noticeCard(n){let tag=n.category==='outbreak'?'Declared outbreak':n.category==='advisory'?'CVO advisory':'Official announcement';return `<article class="COMM_OFFICIAL ${n.category==='outbreak'?'outbreak':''}"><div class="COMM_OFFICIAL_ICON">${fa(n.category==='outbreak'?'triangle-exclamation':'bullhorn')}</div><div class="COMM_OFFICIAL_BODY"><div class="COMM_TAGS"><span class="COMM_TAG official">${H(tag)}</span>${admin?`<span class="COMM_TAG">${H(n.audience)}</span>`:''}${n.barangay?`<span class="COMM_TAG">${fa('location-dot')} ${H(n.barangay)}</span>`:''}<span class="COMM_MUTED">${H(date(n.date))}</span></div><h3>${H(n.title)}</h3><p>${txt(n.body)}</p></div>${admin&&n.category==='announcement'&&n.isActive?button('Deactivate','deactivateAnnouncement',`data-id="${H(n.id)}"`,'small'):''}</article>`;}
  function channelCard(ch){const locked=!ch.canRead;return `<button type="button" class="COMM_CHANNEL ${selected===ch.id?'selected':''}" data-community-action="viewChannel" data-id="${H(ch.id)}"><span class="COMM_CHANNEL_ICON">${fa(ch.privacy==='private'?'lock':'hashtag')}</span><span class="COMM_CHANNEL_TEXT"><strong>${H(ch.name)}</strong><small>${H(ch.description||'Pet owner community')}</small></span><span class="COMM_TAG ${locked?'locked':''}">${ch.privacy==='private'?'Private':'Public'}</span></button>`;}
  const postScore=p=>`<div class="COMM_SCORE" aria-label="Vote score: ${Number(p.score)||0}"><button ${owner&&isVerified()?'':'disabled title="Verified Pet Owners only"'} data-community-action="votePost" data-target="${H(p.id)}" data-channel-id="${H(p.channelId)}" data-value="1" type="button" aria-label="Upvote" class="${p.myVote===1?'is-voted':''}">${fa('arrow-up')}</button><strong>${Number(p.score)||0}</strong><button ${owner&&isVerified()?'':'disabled title="Verified Pet Owners only"'} data-community-action="votePost" data-target="${H(p.id)}" data-channel-id="${H(p.channelId)}" data-value="-1" type="button" aria-label="Downvote" class="${p.myVote===-1?'is-voted':''}">${fa('arrow-down')}</button></div>`;
  function postCard(p,search=false){const imgs=(p.imageFileIds||[]).map(fid=>`<div class="COMM_POST_IMAGE"><img data-community-image="1" data-post-id="${H(p.id)}" data-file-id="${H(fid)}" loading="lazy" alt="Discussion attachment"><span>Loading image…</span></div>`).join('');
   return `<article class="COMM_POST"><div class="COMM_POST_CONTENT"><div class="COMM_POST_META"><span class="COMM_SMALL_AVATAR">${avatar(p.authorName)}</span><span class="COMM_META_NAMES"><strong>${H(p.authorName)}</strong><small>${H(date(p.createdAt))}</small></span>${p.channelName?`<button class="COMM_CHANNEL_LINK" type="button" data-community-action="viewChannel" data-id="${H(p.channelId)}">${fa('hashtag')}${H(p.channelName)}</button>`:''}</div><h3>${H(p.title)}</h3><p class="COMM_POST_BODY">${txt(p.body)}</p>${imgs?`<div class="COMM_IMAGE_GRID">${imgs}</div>`:''}<div class="COMM_POST_ACTIONS">${postScore(p)}${button(`${fa('comment-dots')} ${Number(p.commentCount)||0} Comments`,'showComments',`data-id="${H(p.id)}" data-channel-id="${H(p.channelId)}"`,'small')}${(p.authorId===current.user.$id||admin)&&!p.isDeleted?button(`${fa('trash')} Remove`,'deletePost',`data-id="${H(p.id)}" data-channel-id="${H(p.channelId)}"`,'small danger'):''}</div></div></article>`;
  }
  const header=(title,sub,buttons='')=>`<div class="COMM_HEAD"><div><span class="COMM_EYEBROW">CITYVETHUB COMMUNITY</span><h1>${H(title)}</h1><p>${H(sub)}</p></div><div class="COMM_TOP_ACTIONS">${buttons}</div></div>`;
  const blank=s=>`<div class="COMM_EMPTY">${fa('comments')}<p>${H(s)}</p></div>`;
  async function hydrateImages(scope=container){const imgs=[...scope.querySelectorAll('[data-community-image]')];await Promise.all(imgs.map(async img=>{
   try{const data=await action('ImageToken',{postId:img.dataset.postId,fileId:img.dataset.fileId});if(!img.isConnected)return;img.src=data.url;
     img.addEventListener('load',()=>{if(img.nextElementSibling)img.nextElementSibling.hidden=true;},{once:true});
     img.addEventListener('error',()=>{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.textContent='Image unavailable';},{once:true});
   }catch{img.hidden=true;if(img.nextElementSibling)img.nextElementSibling.textContent='Image unavailable';}
  }));}
  async function overviewLoad(){overview=await action('Overview');}
  async function open(mode='community'){active=true;section=mode==='officer-notices'?'notices':'feed';selected=null;searchQuery='';await refresh();}
  function close(){active=false;selected=null;document.querySelector('.COMM_MODAL')?.remove();}
  async function refresh(){if(!active)return;const rev=++revision;container.innerHTML='<div class="COMM_LOADING">'+fa('spinner fa-spin')+' Loading community…</div>';
   try{await overviewLoad();if(rev!==revision)return;
     if(section==='notices'||officer){renderNotices();}
     else if(section==='channel'&&selected)await renderChannel(selected);
     else if(section==='search'&&searchQuery)await renderSearch(searchQuery);
     else await renderFeed();
     hydrateImages();
   }catch(e){if(rev===revision)container.innerHTML=`<div class="COMM_ERROR">${fa('triangle-exclamation')} ${H(handlerErr(e))}<p>Ensure the Community migration and latest Appwrite Function deployment are active.</p></div>`;}
  }
  function renderNotices(){const notes=overview?.notices||[];const top=admin?button(fa('plus')+' Publish announcement','newAnnouncement','','primary'):'';
    container.innerHTML=header(officer?'Staff Alerts & Announcements':'Official CVO Notices',officer?'Outbreak declarations and administrator announcements for Field Officers.':'CVO outbreak advisories and announcements directed to the selected audience.',top)+`<div id="communityNotice" hidden></div>`+
      (!officer?`<div class="COMM_TABS">${button('Community Feed','feed')}${button('Official Notices','notices','','active')}</div>`:'')+
      `<div class="COMM_OFFICIAL_LIST">${notes.length?notes.map(noticeCard).join(''):blank('There are no official announcements or active alerts for your role.')}</div>`;
  }
  const officialPreview=()=>`<aside class="COMM_RIGHT_RAIL"><section class="COMM_WIDGET"><div class="COMM_WIDGET_HEADING"><span class="COMM_WIDGET_ICON">${fa('bullhorn')}</span><h2>From CityVetHub CVO</h2></div><p class="COMM_WIDGET_SUB">Official information for our community</p>${(overview?.notices||[]).length?(overview.notices.slice(0,3).map(n=>`<div class="COMM_NOTICE_MINI"><span class="COMM_NOTICE_MARK ${n.category==='outbreak'?'urgent':''}">${fa(n.category==='outbreak'?'triangle-exclamation':'check-circle')}</span><div><span>${H(n.category==='outbreak'?'Outbreak advisory':n.category==='advisory'?'Health advisory':'CVO announcement')}</span><strong>${H(n.title)}</strong><small>${H(date(n.date))}</small></div></div>`).join('')):`<div class="COMM_MINI_EMPTY">${fa('shield-heart')}<span>No official notices right now.</span></div>`}${button('All official notices '+fa('arrow-right'),'notices','','small COMM_WIDE_LINK')}</section><section class="COMM_WIDGET COMM_RULES"><div class="COMM_WIDGET_HEADING"><span class="COMM_WIDGET_ICON light">${fa('heart')}</span><h2>A good place for pets</h2></div><p>Share helpful advice, be kind to other members, and keep personal details private.</p><div class="COMM_RULE_ROW">${fa('check-circle')} Helpful, respectful conversations</div><div class="COMM_RULE_ROW">${fa('shield-halved')} Privacy for private channels</div><div class="COMM_RULE_ROW">${fa('paw')} Made for Iligan City pet owners</div></section></aside>`;
  const channelRail=()=>`<aside class="COMM_CHANNEL_RAIL"><section class="COMM_WIDGET COMM_CHANNEL_WIDGET"><div class="COMM_WIDGET_HEADING"><span class="COMM_WIDGET_ICON">${fa('layer-group')}</span><h2>Explore communities</h2></div><div class="COMM_SEARCH">${fa('magnifying-glass')}<input id="communitySearchInput" placeholder="Search channels or posts" aria-label="Search channels or discussions"><button type="button" class="COMM_SEARCH_BUTTON" data-community-action="searchQuery">Search</button></div><div class="COMM_RAIL_LABEL">CHANNELS <span>${overview?.channels?.length||0}</span></div><div class="COMM_CHANNEL_LIST">${overview?.channels?.length?overview.channels.map(channelCard).join(''):`<div class="COMM_RAIL_EMPTY">No channels created yet.</div>`}</div>${owner&&isVerified()?button(fa('plus')+' Create a channel','newChannel','','COMM_RAIL_CREATE'):''}</section><section class="COMM_WIDGET COMM_RAIL_FOOT"><strong>${fa('shield-halved')} ${isVerified()?'Verified member':'Read-only access'}</strong><p>${isVerified()?'You can create discussions and participate in channels you can access.':'Enjoy public posts. Verify your account to publish and vote.'}</p></section></aside>`;
  async function renderFeed(){const channels=overview?.channels||[];
    const buttons=`${admin?button(fa('plus')+' Announcement','newAnnouncement','','primary'):''}${owner&&isVerified()?button(fa('plus')+' Create channel','newChannel','','primary'):''}`;
    const activeChannels=channels.filter(c=>c.canRead);
    container.innerHTML=`<div class="COMM_PAGE">${header('Community','Connect, share pet stories, and learn from Iligan City pet owners.',buttons)}<div id="communityNotice" hidden></div>${owner&&!isVerified()?verifiedNotice():''}<div class="COMM_TABS">${button(fa('house')+' For you','feed','','active')}${button(fa('bullhorn')+' Official notices','notices')}</div><section class="COMM_HERO"><div class="COMM_HERO_COPY"><span>${fa('paw')} YOUR PET COMMUNITY</span><h2>Good conversations.<br>Happier pets.</h2><p>Ask questions, share moments, find your community, and stay informed with official CVO updates.</p></div><div class="COMM_HERO_DECOR" aria-hidden="true">${fa('paw')}</div><div class="COMM_HERO_BADGE">${fa('users')} ${channels.length} ${channels.length===1?'channel':'channels'} to discover</div></section><div class="COMM_SOCIAL_GRID">${channelRail()}<main class="COMM_FEED_COLUMN"><section class="COMM_COMPOSER"><div class="COMM_COMPOSER_TOP"><span class="COMM_COMPOSER_AVATAR">${avatar(current.user.name||current.user.email)}</span><button type="button" class="COMM_COMPOSER_PROMPT" data-community-action="${owner&&isVerified()?'newFeedPost':'goProfile'}">${owner&&isVerified()?`What's happening in the pet community?`:'Explore posts from pet owners around Iligan City'}</button></div><div class="COMM_COMPOSER_FOOT"><span>${fa('images')} Share photos and stories</span>${owner&&isVerified()?button(fa('pen')+' Create a post','newFeedPost','','primary small'):`<span>${fa('lock')} Verified owners can post</span>`}</div></section><div class="COMM_FEED_TITLE"><div><h2>Latest discussions</h2><p>From public and accessible community channels</p></div><span class="COMM_FEED_COUNT" id="commPostCount">${fa('spinner fa-spin')} Loading</span></div><div id="commFeedPosts" class="COMM_POST_LIST"><div class="COMM_LOADING">${fa('spinner fa-spin')} Loading discussions…</div></div></main>${officialPreview()}</div></div>`;
    bindSearch();
    const at=revision,results=await Promise.allSettled(activeChannels.slice(0,8).map(c=>action('Channel',{channelId:c.id})));
    if(!active||at!==revision||section!=='feed')return;
    const feed=[];results.forEach((r,i)=>{if(r.status==='fulfilled')for(const p of r.value.posts||[])feed.push({...p,channelName:activeChannels[i].name,channelId:activeChannels[i].id});});
    feed.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const target=container.querySelector('#commFeedPosts'),count=container.querySelector('#commPostCount');if(!target)return;
    count.textContent=feed.length+' '+(feed.length===1?'discussion':'discussions');
    target.innerHTML=feed.length?feed.slice(0,30).map(p=>postCard(p,true)).join(''):
      `<div class="COMM_FEED_EMPTY"><div class="COMM_FEED_EMPTY_ART">${fa('comments')}</div><h3>Be part of the conversation</h3><p>${activeChannels.length?'No discussions have been shared in accessible channels yet. Open a community and start the first conversation!':'Explore the first community channel, or create one and get the conversation started.'}</p>${activeChannels.length?button('Explore '+activeChannels[0].name, 'viewChannel',`data-id="${H(activeChannels[0].id)}"`,'primary'):owner&&isVerified()?button('Create a channel','newChannel','','primary'):''}</div>`;
    if(results.every(r=>r.status==='rejected')&&activeChannels.length){target.innerHTML=`<div class="COMM_FEED_EMPTY"><h3>Discussions could not load</h3><p>Please try again. Your channels and official notices are still available.</p>${button('Retry feed','feed','','primary')}</div>`;}
  }
  function bindSearch(){const input=container.querySelector('#communitySearchInput');if(!input)return;input.addEventListener('keydown',async e=>{if(e.key==='Enter'){e.preventDefault();searchQuery=input.value.trim();if(searchQuery.length<2){message('Enter at least 2 characters.');return;}section='search';await refresh();}});}
  async function renderSearch(q){const data=await action('Search',{query:q});container.innerHTML=header('Search results',`Matches for “${q}”`,button('Back to Community','feed'))+`<div id="communityNotice" hidden></div><div class="COMM_LAYOUT"><aside class="COMM_SIDEBAR"><h2>Channels</h2>${data.channels?.length?data.channels.map(channelCard).join(''):blank('No matching channels.')}</aside><div class="COMM_MAIN"><h2>Discussions</h2>${data.posts?.length?data.posts.map(p=>postCard(p,true)).join(''):blank('No matching public or accessible discussions.')}</div></div>`;}
  async function renderChannel(channelId){const data=await action('Channel',{channelId});if(!active)return;const c=data.channel;selected=c.id;section='channel';const canWrite=owner&&data.verified&&c.canRead;
    const tools=`${canWrite?button(fa('pen-to-square')+' New discussion','newPost','','primary'):''}${c.isCreator?button(c.privacy==='public'?'Make private':'Make public','togglePrivacy','',''):''}${c.isCreator?button('Join requests','joinRequests','',''):''}`;
    const privacyBadge=`<span class="COMM_TAG ${c.privacy==='private'?'locked':''}">${fa(c.privacy==='private'?'lock':'globe')} ${H(c.privacy)}</span>`;
    container.innerHTML=`<div class="COMM_PAGE COMM_CHANNEL_PAGE">${header('Community', 'Your place to connect with pet people.',button(fa('arrow-left')+' Back to feed','feed','','small'))}<div id="communityNotice" hidden></div><div class="COMM_SOCIAL_GRID">${channelRail()}<main class="COMM_FEED_COLUMN"><section class="COMM_CHANNEL_BANNER"><span class="COMM_CHANNEL_BIGICON">${fa(c.privacy==='private'?'lock':'hashtag')}</span><div><div class="COMM_CHANNEL_BANNER_META">Community channel ${privacyBadge}</div><h2>${H(c.name)}</h2><p>${H(c.description||'Connect with the pet owner community.')}</p></div></section><div class="COMM_CHANNEL_TOOLS">${tools}</div>${owner&&!data.verified?verifiedNotice():''}${!c.canRead?`<section class="COMM_LOCKED">${fa('lock')}<h2>This community is private</h2><p>Only approved members can read or participate. The channel creator reviews join requests.</p>${owner&&c.membership==='none'?button('Request to join','requestJoin','','primary'):c.membership==='pending'?'<span class="COMM_TAG">Membership request pending</span>':owner&&c.membership==='rejected'?button('Request again','requestJoin','','primary'):''}</section>`:`<section class="COMM_DISCUSSIONS"><div class="COMM_FEED_TITLE"><div><h2>Discussions</h2><p>Conversations in this channel</p></div><span class="COMM_FEED_COUNT">${data.posts.length} ${data.posts.length===1?'post':'posts'}</span></div><div class="COMM_POST_LIST">${data.posts.length?data.posts.map(p=>postCard({...p,channelName:c.name})).join(''):`<div class="COMM_FEED_EMPTY"><div class="COMM_FEED_EMPTY_ART">${fa('comment-dots')}</div><h3>No discussions yet</h3><p>Be the first to start a conversation in this community.</p>${canWrite?button('Start a discussion','newPost','','primary'):''}</div>`}</div></section>`}</main>${officialPreview()}</div></div>`;
    bindSearch();hydrateImages();
  }
  async function showComments(postId){selectedPost=postId;const data=await action('Comments',{postId});const canInteract=owner&&isVerified()&&!!overview.channels.find(c=>c.id===selected&&c.canRead);
   const comments=data.comments||[];const commentHtml=c=>`<div class="COMM_COMMENT" style="margin-left:${c.parentCommentId?'22':'0'}px"><div class="COMM_POST_META"><span class="COMM_SMALL_AVATAR">${avatar(c.authorName)}</span><b>${H(c.authorName)}</b> · ${H(date(c.createdAt))}</div><p>${txt(c.body)}</p><div class="COMM_COMMENT_ACTIONS">${canInteract?button(fa('arrow-up')+' '+(c.score||0),'commentVoteUp',`data-id="${H(c.id)}"`,'small')+button(fa('arrow-down'),'commentVoteDown',`data-id="${H(c.id)}"`,'small')+button('Reply','replyComment',`data-id="${H(c.id)}"`,'small'):''}${(c.authorId===current.user.$id||admin)&&!c.isDeleted?button('Remove','removeComment',`data-id="${H(c.id)}"`,'small danger'):''}</div></div>`;
   modal(`Discussion · ${data.post.title}`,`<div class="COMM_COMMENTS">${comments.map(commentHtml).join('')||blank('No comments yet.')}</div>${canInteract?`<div id="commReplyBanner" class="COMM_REPLY_BANNER" hidden>Replying to a comment <button type="button" data-cancel-reply>Cancel reply</button></div><input type="hidden" name="parentCommentId" value=""><label>Write a comment<textarea name="body" maxlength="2000" rows="4" placeholder="Be respectful and helpful" required></textarea></label>`:'<p class="COMM_MUTED">Only verified Pet Owners with access can comment.</p>'}`,async form=>{
     if(!canInteract){throw Error('Verified membership required to comment.');}
     const fd=new FormData(form);
     await action('CreateComment',{postId,body:fd.get('body'),parentCommentId:fd.get('parentCommentId')||''});await showComments(postId);
   },'Post comment');
   const dialog=document.querySelector('.COMM_MODAL');const submit=dialog?.querySelector('[type="submit"]');if(!canInteract&&submit)submit.hidden=true;
   dialog?.addEventListener('click',async e=>{if(e.target.closest('[data-cancel-reply]')){dialog.querySelector('[name=parentCommentId]').value='';dialog.querySelector('#commReplyBanner').hidden=true;return;}const b=e.target.closest('[data-community-action]');if(!b)return;
     b.disabled=true;try{const kind=b.dataset.communityAction,cid=b.dataset.id;
       if(kind==='commentVoteUp'||kind==='commentVoteDown')await action('Vote',{targetType:'comment',targetId:cid,value:kind==='commentVoteUp'?1:-1});
       if(kind==='removeComment'&&confirm('Remove this comment?'))await action('DeleteComment',{commentId:cid});
       if(kind==='replyComment'){
         dialog.querySelector('[name=parentCommentId]').value=cid;
         const banner=dialog.querySelector('#commReplyBanner');banner.hidden=false;
         dialog.querySelector('[name=body]').placeholder='Write your reply to this comment…';
         dialog.querySelector('[name=body]').focus();b.disabled=false;return;
       }
       dialog.remove();await showComments(postId);
     }catch(x){const err=dialog.querySelector('.COMM_MODAL_ERROR');err.hidden=false;err.textContent=handlerErr(x);}finally{b.disabled=false;}
   });
  }
  async function uploadFiles(fileList){const files=[...fileList];if(files.length>4)throw Error('You can attach up to 4 images.');const ids=[];
    for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Images must be JPG, PNG or WEBP, up to 5 MB each.');
      const safeName=(file.name||'community-image.jpg').replace(/[\u0000-\u001F\u007F]/g,'_').slice(0,120)||'community-image.jpg';
      const safeFile=new File([file],safeName,{type:file.type,lastModified:file.lastModified});
      const result=await api.storage.createFile({bucketId:api.config.buckets.media,fileId:window.Appwrite.ID.unique(),file:safeFile,permissions:[`read("user:${current.user.$id}")`,`update("user:${current.user.$id}")`,`delete("user:${current.user.$id}")`]});ids.push(result.$id);
    }return ids;
  }
  function submitChannel(){modal('Create a community channel',`<label>Channel name<input name="name" maxlength="80" required placeholder="e.g. Iligan Pet Parents"></label><label>Description<textarea name="description" maxlength="300" rows="3" placeholder="What is this community about?"></textarea></label><label>Privacy<select name="privacy"><option value="public">Public — anyone can read</option><option value="private">Private — creator approves members</option></select></label>`,async form=>{
    const d=Object.fromEntries(new FormData(form));const ch=await action('CreateChannel',d);selected=ch.id;section='channel';await refresh();},'Create channel');}
  function submitPost(fromFeed=false){
   const choices=(overview?.channels||[]).filter(c=>c.canRead),channelSelect=fromFeed?`<label>Post to community<select name="channelId" required>${choices.map(c=>`<option value="${H(c.id)}">${H(c.name)}</option>`).join('')}</select></label>`:'';
   if(fromFeed&&!choices.length){message('Create or join a community channel before posting.');return;}
   modal('Start a discussion',`${channelSelect}<label>Discussion title<input name="title" maxlength="140" placeholder="What would you like to ask or share?" required></label><label>Discussion<textarea name="body" maxlength="5000" rows="6" placeholder="Share your story, advice or question…" required></textarea></label><label>Photos (optional, up to 4)<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple><span class="COMM_MUTED">Each image must be smaller than 5 MB. Images in private channels remain private.</span></label>`,async form=>{
     const fd=new FormData(form),files=form.querySelector('[name="images"]').files;const imageFileIds=await uploadFiles(files);const channelId=fromFeed?fd.get('channelId'):selected;await action('CreatePost',{channelId,title:fd.get('title'),body:fd.get('body'),imageFileIds});if(fromFeed){section='feed';await refresh();}else{await renderChannel(selected);}},'Publish discussion');}
  function submitAnnouncement(){modal('Publish official CVO announcement',`<label>Announcement title<input name="title" maxlength="140" required></label><label>Message<textarea name="body" maxlength="2000" rows="6" required></textarea></label><label>Who should receive this announcement?<select name="audience"><option value="owners">Pet Owners</option><option value="officers">Field Officers</option><option value="both">Both Pet Owners and Field Officers</option></select></label>`,async form=>{await action('PublishAnnouncement',Object.fromEntries(new FormData(form)));section='notices';await refresh();},'Publish announcement');}
  async function showJoinRequests(){const data=await action('JoinRequests',{channelId:selected});const items=data.requests||[];
    modal('Private channel membership requests',items.length?items.map(r=>`<div class="COMM_REQUEST"><span><strong>${H(r.userName)}</strong><small>${H(date(r.requestedAt))}</small></span>${button('Approve','approveJoin',`data-id="${H(r.id)}"`,'small primary')}${button('Decline','declineJoin',`data-id="${H(r.id)}"`,'small danger')}</div>`).join(''):blank('No pending membership requests.'),async()=>{},'Close');
    document.querySelector('.COMM_MODAL [type=submit]').hidden=true;
    document.querySelector('.COMM_MODAL').addEventListener('click',async e=>{const b=e.target.closest('[data-community-action]');if(!b)return;const status=b.dataset.communityAction==='approveJoin'?'approved':'rejected';if(!confirm(`Are you sure you want to ${status==='approved'?'approve':'decline'} this request?`))return;
      try{await action('ReviewJoin',{channelId:selected,membershipId:b.dataset.id,status});document.querySelector('.COMM_MODAL')?.remove();await showJoinRequests();}catch(x){alert(handlerErr(x));}
    });
  }
  container.addEventListener('click',async e=>{if(!active)return;const b=e.target.closest('[data-community-action]');if(!b)return;e.preventDefault();
    const kind=b.dataset.communityAction,channelId=b.dataset.id;try{
      if(kind==='searchQuery'){searchQuery=container.querySelector('#communitySearchInput')?.value.trim()||'';if(searchQuery.length<2){message('Enter at least 2 characters.');return;}section='search';return refresh();}
      if(kind==='goProfile'){document.querySelector('#sideNav [data-module="profile"]')?.click();return;}
      if(kind==='feed'){selected=null;section='feed';return refresh();}
      if(kind==='notices'){section='notices';return refresh();}
      if(kind==='viewChannel'){selected=channelId;section='channel';return refresh();}
      if(kind==='newChannel'){if(!isVerified())return message('Verify your Pet Owner account first.');return submitChannel();}
      if(kind==='newAnnouncement'){if(!admin)return;return submitAnnouncement();}
      if(kind==='newPost'){if(!isVerified())return message('Verify your Pet Owner account first.');return submitPost();}
      if(kind==='newFeedPost'){if(!isVerified())return message('Verify your Pet Owner account first.');return submitPost(true);}
      if(kind==='requestJoin'){await action('RequestJoin',{channelId:selected});return refresh();}
      if(kind==='togglePrivacy'){const ch=overview.channels.find(x=>x.id===selected);const privacy=ch?.privacy==='private'?'public':'private';if(!confirm(`Change channel to ${privacy}? This changes who can read its discussions.`))return;
        await action('SetPrivacy',{channelId:selected,privacy});return refresh();}
      if(kind==='joinRequests')return showJoinRequests();
      if(kind==='showComments'){if(b.dataset.channelId)selected=b.dataset.channelId;return showComments(channelId);}
      if(kind==='votePost'){if(!owner||!isVerified())return message('Only verified Pet Owners may vote.');await action('Vote',{targetType:'post',targetId:b.dataset.target,value:Number(b.dataset.value)});if(section==='feed'){return refresh();}await renderChannel(selected);return hydrateImages();}
      if(kind==='deletePost'){if(!confirm('Remove this discussion and its images from Community?'))return;await action('DeletePost',{postId:channelId});if(section==='feed'){return refresh();}await renderChannel(selected);return hydrateImages();}
      if(kind==='deactivateAnnouncement'){if(!confirm('Deactivate this announcement?'))return;await action('DeactivateAnnouncement',{announcementId:channelId});return refresh();}
    }catch(x){message(handlerErr(x));}
  });
  let debounce;function search(value){if(!active||officer)return;clearTimeout(debounce);searchQuery=String(value||'').trim();debounce=setTimeout(()=>{if(searchQuery.length>=2){section='search';refresh();}else if(section==='search'){section='feed';refresh();}},280);}
  return {open,close,search,refresh};
 }
 window.CityVetCommunity=Object.freeze({mount});
})();
