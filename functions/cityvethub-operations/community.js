/** CityVetHub Community — all authorization is server-side.
 * Tables are Function-only; no direct client row permissions are granted.
 * New standalone module to avoid affecting the existing pet/medical/transfer operations.
 */
import {createHash} from 'node:crypto';

const TABLES={channels:'community_channels',members:'community_memberships',posts:'community_posts',comments:'community_comments',votes:'community_votes',announcements:'community_announcements'};
const DB=process.env.CITYVET_DATABASE_ID||'cityvethub', MEDIA='cityvethub-media', ADMIN='read("team:cityvethub-admins")';
const bad=(status,message)=>{const e=new Error(message);e.status=status;throw e;};
const requireValue=(v,max,label='Value')=>{const s=String(v??'').trim();if(!s||s.length>max)bad(400,`${label} must contain 1–${max} characters.`);return s;};
const optional=(v,max)=>String(v??'').trim().slice(0,max);
const yes=(condition,message,status=403)=>{if(!condition)bad(status,message);};
const choice=(value,allowed)=>{yes(allowed.includes(value),'Invalid option.',400);return value;};
const hashId=(prefix,values)=>prefix+createHash('sha256').update(values.join('|')).digest('hex').slice(0,32);
const id=(value)=>encodeURIComponent(String(value));
const tpath=(table,rowId)=>`/tablesdb/${id(DB)}/tables/${id(table)}/rows${rowId?'/'+id(rowId):''}`;
const listPath=(table,filters=[],limit=100)=>tpath(table)+'?limit='+limit+filters.map(({attribute,value})=>'&queries%5B%5D='+encodeURIComponent(JSON.stringify({method:'equal',attribute,values:[value]}))).join('');
const jsonArray=(s)=>{try{const x=JSON.parse(s||'[]');return Array.isArray(x)?x:[];}catch{return[];}};
const shortRow=r=>({id:r.$id,...r});

export async function runCommunity({action,data,user,admin,officer,owner,api,sendPushToUsers,getOfficerUserIds,getOwnerIdsForBarangay}){
 const get=(table,rowId)=>api('GET',tpath(table,rowId));
 const create=(table,rowId,fields)=>api('POST',tpath(table),{rowId:rowId||'unique()',data:fields,permissions:[ADMIN]});
 const update=(table,rowId,fields)=>api('PATCH',tpath(table,rowId),{data:fields});
 const remove=(table,rowId)=>api('DELETE',tpath(table,rowId));
 const readList=(table,filters=[],limit=100)=>api('GET',listPath(table,filters,limit)).then(r=>r.rows||[]);
 const readRecent=async(table,limit=100,filters=[])=>{
   const q='&queries%5B%5D='+encodeURIComponent(JSON.stringify({method:'orderDesc',attribute:'$createdAt'}));
   try{return (await api('GET',listPath(table,filters,limit)+q)).rows||[];}
   catch{return readList(table,filters,limit);}
 };
 const getOrNull=async(table,rowId)=>{try{return await get(table,rowId);}catch(e){if(e.status===404)return null;throw e;}};
 const membershipId=(channelId,userId)=>hashId('m_',[channelId,userId]);
 const voteId=(type,target,userId)=>hashId('v_',[type,target,userId]);
 const isVerified=async()=>{if(admin||officer)return true;if(!owner)return false;const p=await getOrNull('user_profiles',user.$id);return p?.accountVerificationStatus==='verified';};
 const requireVerified=async()=>{yes(owner||officer||admin,'Sign in to participate in discussions.');if(owner)yes(await isVerified(),'CVO account verification is required before posting, creating channels, commenting, or voting.');};
 const member=async(ch,u=user.$id)=>getOrNull(TABLES.members,membershipId(ch.$id,u));
 const owned=ch=>ch.createdById===user.$id;
 const canAccessWithMembership=(ch,m)=>{
   if(!ch||ch.isArchived)return false;
   if(ch.privacy==='public')return true;
   if(ch.privacy==='staff')return Boolean(admin||officer);
   if(ch.privacy==='invite')return Boolean(admin||owned(ch)||m?.status==='approved');
   return Boolean(admin||owned(ch)||m?.status==='approved');
 };
 const isChannelListed=(ch,m)=>{
   if(!ch||ch.isArchived)return false;
   if(ch.privacy==='staff')return Boolean(admin||officer);
   if(ch.privacy==='invite')return Boolean(admin||owned(ch)||m?.status==='approved');
   return true;
 };
 const canAccess=async(ch)=>{
   if(!ch||ch.isArchived)return false;
   if(ch.privacy==='public')return true;
   if(ch.privacy==='staff')return Boolean(admin||officer);
   if(admin||owned(ch))return true;
   return (await member(ch))?.status==='approved';
 };
 const assertVisible=async(ch)=>{yes(!ch.isArchived,'This channel is archived.',409);yes(await canAccess(ch),ch.privacy==='staff'?'This channel is restricted to Field Officers and Administrators.':ch.privacy==='invite'?'This hidden channel is by invitation only.':'Private channel: approval from its creator is required.',403);};
 const ensureUser=()=>yes(owner||officer||admin,'Sign in to continue.');
 let staffRoleCache=null;
 const getStaffRoles=async()=>{
   if(staffRoleCache)return staffRoleCache;
   const map=new Map();
   try{
     const [adm,off]=await Promise.all([
       api('GET','/teams/cityvethub-admins/memberships?limit=100').catch(()=>({memberships:[]})),
       api('GET','/teams/cityvethub-field-officers/memberships?limit=100').catch(()=>({memberships:[]}))
     ]);
     for(const m of off.memberships||[])if(m.confirm!==false&&m.userId)map.set(m.userId,'officer');
     for(const m of adm.memberships||[])if(m.confirm!==false&&m.userId)map.set(m.userId,'admin');
   }catch{}
   staffRoleCache=map;return map;
 };
 const limits={maxImages:4,maxImageBytes:5*1024*1024};
 const validPostFiles=async(ids)=>{
   yes(Array.isArray(ids)&&ids.length<=limits.maxImages,'Up to four image attachments are allowed.',400);
   const unique=[...new Set(ids.map(v=>String(v)))];yes(unique.length===ids.length,'Duplicate image attachments are not allowed.',400);
   for(const fileId of unique){yes(/^[a-zA-Z0-9._-]{1,36}$/.test(fileId),'Invalid image file ID.',400);
     const file=await api('GET',`/storage/buckets/${id(MEDIA)}/files/${id(fileId)}`);
     yes((file.$permissions||[]).includes(`update("user:${user.$id}")`),'Upload only images belonging to your own account.');
     yes(['image/jpeg','image/png','image/webp'].includes(file.mimeType),'Only JPG, PNG and WEBP images are accepted.',400);
     yes((file.sizeOriginal||0)<=limits.maxImageBytes,'Each image must be 5 MB or smaller.',400);
   }
   return unique;
 };
 const cleanPost=(p,roles=new Map())=>({id:p.$id,channelId:p.channelId,authorId:p.authorId,authorName:p.isDeleted?'Removed discussion':p.authorName,authorRole:p.isDeleted?'':(roles.get(p.authorId)||'owner'),title:p.isDeleted?'[Discussion removed]':p.title,body:p.isDeleted?'[This discussion was removed]':p.body,
   imageFileIds:p.isDeleted?[]:jsonArray(p.imageFileIds),isDeleted:!!p.isDeleted,createdAt:p.$createdAt});
 const cleanComment=(c,roles=new Map())=>({id:c.$id,postId:c.postId,parentCommentId:c.parentCommentId||'',authorId:c.authorId,authorName:c.isDeleted?'Removed comment':c.authorName,authorRole:c.isDeleted?'':(roles.get(c.authorId)||'owner'),body:c.isDeleted?'[Comment removed]':c.body,isDeleted:!!c.isDeleted,createdAt:c.$createdAt});
 const voteSummaries=async(chId)=>{
   const votes=await readList(TABLES.votes,[{attribute:'channelId',value:chId}],100);
   const byTarget=new Map();for(const v of votes){const k=v.targetType+':'+v.targetId;const x=byTarget.get(k)||{score:0,upvotes:0,downvotes:0,myVote:0};
     x.score+=v.value;x.upvotes+=(v.value===1?1:0);x.downvotes+=(v.value===-1?1:0);if(v.userId===user.$id)x.myVote=v.value;byTarget.set(k,x);}
   return byTarget;
 };
 const listings=async()=>{
   // One indexed membership query, not one remote request per channel.
   const [channels,memberships]=await Promise.all([
     readList(TABLES.channels,[],100),readList(TABLES.members,[{attribute:'userId',value:user.$id}],100)
   ]);
   const membershipByChannel=new Map(memberships.map(m=>[m.channelId,m]));
   const result=[];
   for(const ch of channels){
     if(ch.isArchived)continue;
     const m=membershipByChannel.get(ch.$id);
     if(!isChannelListed(ch,m))continue;
     result.push({id:ch.$id,name:ch.name,description:ch.description,privacy:ch.privacy,createdByName:ch.createdByName,
       isCreator:owned(ch),membership:m?.status||'none',canRead:canAccessWithMembership(ch,m),createdAt:ch.$createdAt});
   }
   return result.sort((a,b)=>a.name.localeCompare(b.name));
 };
 const official=async()=>{
   ensureUser();
   const BRGY_TAG_RE=/^\[Barangay:\s*([^\]]+)\]\s*\n?/i;
   const parseBrgy=(row)=>{
     const rawBody=String(row?.body||'');
     const m=rawBody.match(BRGY_TAG_RE);
     const barangay=String(row?.barangay||(m?m[1]:'')||'').trim();
     const body=m?rawBody.replace(BRGY_TAG_RE,''):rawBody;
     return {barangay,body};
   };
   const normBrgy=s=>String(s||'').trim().toLowerCase().replace(/^brgy\.?\s*/i,'').replace(/\s*\(pob\.\)\s*/i,'').trim();
   const matchBrgy=(target,userSet)=>{
     if(!target)return true;
     const t=normBrgy(target);
     if(!t||t==='all'||t==='citywide')return true;
     for(const b of userSet){
       const u=normBrgy(b);
       if(u&&(u===t||u.includes(t)||t.includes(u)))return true;
     }
     return false;
   };
   const userBarangays=new Set();
   if(!admin){
     try{
       const [prof,invPets,verPets,matchProfs]=await Promise.all([
         getOrNull('user_profiles',user.$id),
         readList('pet_profiles',[{attribute:'ownerId',value:user.$id}],100).catch(()=>[]),
         readList('pets',[{attribute:'ownerId',value:user.$id}],100).catch(()=>[]),
         readList('adoption_match_profiles',[{attribute:'userId',value:user.$id}],20).catch(()=>[])
       ]);
       if(prof?.barangay)userBarangays.add(prof.barangay);
       if(prof?.assignedArea)userBarangays.add(prof.assignedArea);
       if(prof?.address)userBarangays.add(prof.address);
       for(const p of invPets)if(p?.barangay)userBarangays.add(p.barangay);
       for(const p of verPets)if(p?.barangay)userBarangays.add(p.barangay);
       for(const mp of matchProfs)if(mp?.preferredBarangay)userBarangays.add(mp.preferredBarangay);
     }catch{}
   }
   const notices=await readList(TABLES.announcements,[],100);
   const selected=notices.filter(n=>admin||owner&&['owners','both'].includes(n.audience)||officer&&['officers','both'].includes(n.audience));
   const alertRows=owner?await readList('outbreak_owner_notifications',[],100):await readList('disease_alerts',[],100);
   const a=alertRows.filter(x=>x.isActive).map(x=>({id:x.$id,title:x.title,body:x.message,category:x.isOutbreak?'outbreak':'advisory',audience:owner?'owners':'officers',priority:x.severity||'medium',date:x.issuedAt||x.$createdAt,barangay:x.barangay||'',isActive:true}));
   const n=selected.map(x=>{
     const parsed=parseBrgy(x);
     return {id:x.$id,title:x.title,body:parsed.body,category:'announcement',audience:x.audience,priority:'info',date:x.publishedAt||x.$createdAt,barangay:parsed.barangay,isActive:x.isActive};
   }).filter(x=>{
     if(admin||!x.barangay)return true;
     if(officer&&userBarangays.size===0)return true;
     return matchBrgy(x.barangay,userBarangays);
   });
   return [...a,...n].filter(x=>admin||x.isActive).sort((x,y)=>String(y.date).localeCompare(String(x.date)));
 };
 const postsFor=async(ch)=>{
   await assertVisible(ch);
   const [posts,votes,comments,roles]=await Promise.all([
     readList(TABLES.posts,[{attribute:'channelId',value:ch.$id}],100),
     voteSummaries(ch.$id),
     readList(TABLES.comments,[{attribute:'channelId',value:ch.$id}],100),
     getStaffRoles()
   ]);
   const counts=new Map();for(const c of comments)if(!c.isDeleted)counts.set(c.postId,(counts.get(c.postId)||0)+1);
   return posts.filter(p=>!p.isDeleted).sort((a,b)=>String(b.$createdAt).localeCompare(String(a.$createdAt))).map(p=>({...cleanPost(p,roles),...(votes.get('post:'+p.$id)||{score:0,upvotes:0,downvotes:0,myVote:0}),commentCount:counts.get(p.$id)||0}));
 };

 switch(action){
   case 'communityAvatarTokens':{
     // Public-facing author avatars are delivered as SHORT-LIVED LINKS, not by
     // exposing all profiles or making the media bucket publicly readable.
     // Every requested author must belong to a discussion, comment, or join
     // request that this user is entitled to see; the caller cannot enumerate
     // arbitrary user IDs or retrieve any profile's private fields.
     ensureUser();
     const refs=(key,max)=>{
       const values=data[key]||[];
       yes(Array.isArray(values)&&values.length<=max,`Too many ${key} requested.`,400);
       const unique=[...new Set(values.map(String))];
       yes(unique.every(x=>/^[a-zA-Z0-9._-]{1,36}$/.test(x)),`Invalid ${key} reference.`,400);
       return unique;
     };
     const postRefs=refs('postIds',40),commentRefs=refs('commentIds',40),membershipRefs=refs('membershipIds',30);
     yes(postRefs.length+commentRefs.length+membershipRefs.length<=70,'Too many avatar references.',400);
     const authors=new Set();
     if(data.includeSelf===true)authors.add(user.$id);
     const channelAccessCache=new Map();
     const visible=async(channelId)=>{
       if(!channelAccessCache.has(channelId))channelAccessCache.set(channelId,(async()=>{
         const ch=await getOrNull(TABLES.channels,channelId);
         return !!ch&&!ch.isArchived&&await canAccess(ch);
       })());
       return channelAccessCache.get(channelId);
     };
     // Ignore stale/deleted identifiers individually, without failing all avatars.
     await Promise.all(postRefs.map(async postId=>{
       const p=await getOrNull(TABLES.posts,postId);
       if(p&&!p.isDeleted&&await visible(p.channelId))authors.add(p.authorId);
     }));
     await Promise.all(commentRefs.map(async commentId=>{
       const c=await getOrNull(TABLES.comments,commentId);
       if(!c||c.isDeleted||!await visible(c.channelId))return;
       const p=await getOrNull(TABLES.posts,c.postId);
       if(p&&!p.isDeleted&&p.channelId===c.channelId)authors.add(c.authorId);
     }));
     await Promise.all(membershipRefs.map(async memberId=>{
       const m=await getOrNull(TABLES.members,memberId);
       if(!m)return;
       const ch=await getOrNull(TABLES.channels,m.channelId);
       if(ch&&!ch.isArchived&&(admin||owned(ch)))authors.add(m.userId);
     }));
     yes(authors.size<=70,'Avatar request too large.',400);
     const expire=new Date(Date.now()+5*60*1000).toISOString();
     const endpoint=process.env.APPWRITE_ENDPOINT||'https://sgp.cloud.appwrite.io/v1';
     const project=process.env.APPWRITE_PROJECT_ID||'6aeff5c9002718442fdf';
     const avatars={},warnings=new Set();
     // One inaccessible author's photo must not hide every other avatar.
     // Report only generic diagnostics; never expose private file IDs or fields.
     await Promise.all([...authors].map(async userId=>{
       try{
         const profile=await getOrNull('user_profiles',userId);
         const fileId=profile?.profileImageId;
         if(!fileId||!/^[a-zA-Z0-9._-]{1,36}$/.test(fileId))return;
         const file=await api('GET',`/storage/buckets/${id(MEDIA)}/files/${id(fileId)}`);
         if(!['image/jpeg','image/png','image/webp'].includes(file.mimeType))return;
         const base=`${endpoint}/storage/buckets/${id(MEDIA)}/files/${id(fileId)}/view?project=${encodeURIComponent(project)}`;
         // Already-public owner-approved photos work without creating tokens.
         if((file.$permissions||[]).includes('read("any")')){
           avatars[userId]=base;return;
         }
         const token=await api('POST',`/tokens/buckets/${id(MEDIA)}/files/${id(fileId)}`,{expire});
         if(!token?.secret){warnings.add('File token response was missing its secret');return;}
         avatars[userId]=`${base}&token=${encodeURIComponent(token.secret)}`;
       }catch(error){
         if(error.status!==404){
           warnings.add(error.status===401||error.status===403?'Avatar Function lacks file/token permissions':'Some stored avatar photos were unavailable');
         }
       }
     }));
     return {avatars,expiresAt:expire,warnings:[...warnings]};
   }
   case 'communityOverview': return {channels:await listings(),verified:await isVerified(),role:admin?'admin':officer?'officer':'owner',notices:await official()};
   case 'communityOfficialNotices':return {notices:await official()};
   case 'communityNotifications':{
     ensureUser();
     const [channels,memberships,posts,comments,votes,notices]=await Promise.all([
       readRecent(TABLES.channels,100),
       readRecent(TABLES.members,100),
       readRecent(TABLES.posts,100),
       readRecent(TABLES.comments,100),
       readRecent(TABLES.votes,100),
       official().catch(()=>[])
     ]);
     const channelById=new Map(channels.map(c=>[c.$id,c]));
     const postById=new Map(posts.map(p=>[p.$id,p]));
     const commentById=new Map(comments.map(c=>[c.$id,c]));
     const items=[];
     // 1. Votes (likes/upvotes) on the user's posts and comments
     for(const v of votes){
       if(v.userId===user.$id||Number(v.value)!==1)continue;
       if(v.targetType==='post'){
         const p=postById.get(v.targetId);
         if(!p||p.isDeleted||p.authorId!==user.$id)continue;
         const ch=channelById.get(p.channelId);
         items.push({
           id:'comm_vote_post_'+v.$id,
           category:'community',
           kind:'like_post',
           title:'New upvote on your discussion',
           message:`Someone upvoted "${p.title||'your discussion'}"${ch?` in #${ch.name}`:''}.`,
           createdAt:v.$updatedAt||v.$createdAt||p.$createdAt,
           module:'community',
           channelId:p.channelId,
           postId:p.$id
         });
       }else if(v.targetType==='comment'){
         const c=commentById.get(v.targetId);
         if(!c||c.isDeleted||c.authorId!==user.$id)continue;
         const p=postById.get(c.postId);
         items.push({
           id:'comm_vote_comment_'+v.$id,
           category:'community',
           kind:'like_comment',
           title:'New upvote on your comment',
           message:`Someone upvoted your comment${p?` on "${p.title}"`:''}: "${String(c.body||'').slice(0,60)}"`,
           createdAt:v.$updatedAt||v.$createdAt||c.$createdAt,
           module:'community',
           channelId:c.channelId,
           postId:c.postId
         });
       }
     }
     // 2. Comments on the user's posts and replies to the user's comments
     for(const c of comments){
       if(c.isDeleted)continue;
       const p=postById.get(c.postId);
       const ch=channelById.get(c.channelId);
       const parent=c.parentCommentId?commentById.get(c.parentCommentId):null;
       const cleanAuthor=String(c.authorName||'A community member').replace(/\s*\[(Admin|Field Officer)\]\s*$/i,'').trim();
       if(c.authorId!==user.$id&&parent&&!parent.isDeleted&&parent.authorId===user.$id){
         items.push({
           id:'comm_reply_'+c.$id,
           category:'community',
           kind:'comment_reply',
           title:`${cleanAuthor} replied to your comment`,
           message:`"${String(c.body||'').slice(0,85)}"${p?` in "${p.title}"`:''}`,
           createdAt:c.$createdAt,
           module:'community',
           channelId:c.channelId,
           postId:c.postId
         });
       }else if(p&&!p.isDeleted&&p.authorId===user.$id){
         const isSelf=c.authorId===user.$id;
         items.push({
           id:'comm_comment_'+c.$id,
           category:'community',
           kind:'post_comment',
           title:isSelf?'New comment on your discussion':`${cleanAuthor} commented on your discussion`,
           message:`${isSelf?'You commented on':'On'} "${p.title}": "${String(c.body||'').slice(0,80)}"${ch?` (#${ch.name})`:''}`,
           createdAt:c.$createdAt,
           module:'community',
           channelId:c.channelId,
           postId:p.$id
         });
       }
     }
     // 3. Pending join requests on channels owned by the user (or admin)
     for(const m of memberships){
       const ch=channelById.get(m.channelId);
       if(!ch||ch.isArchived)continue;
       if(m.status==='pending'&&(owned(ch)||admin)&&m.userId!==user.$id){
         items.push({
           id:'comm_join_req_'+m.$id,
           category:'community',
           kind:'join_request',
           title:'Channel membership request',
           message:`${m.userName||'A member'} requested to join private channel #${ch.name}.`,
           createdAt:m.requestedAt||m.$createdAt,
           module:'community',
           channelId:ch.$id
         });
       }
       if(m.userId===user.$id&&!owned(ch)&&(m.status==='approved'||m.status==='rejected')){
         const isInvite=ch.privacy==='invite';
         if(m.status==='approved'||ch.privacy==='private'){
           items.push({
             id:`comm_join_status_${m.$id}_${m.status}`,
             category:'community',
             kind:'join_status',
             title:m.status==='approved'?(isInvite?'Added to hidden channel':'Channel request approved'):'Channel request declined',
             message:m.status==='approved'?(isInvite?`You were invited to hidden channel #${ch.name}.`:`You now have access to private channel #${ch.name}.`):`Your request to join #${ch.name} was declined.`,
             createdAt:m.reviewedAt||m.$updatedAt||m.$createdAt,
             module:'community',
             channelId:ch.$id
           });
         }
       }
     }
     // 4. Deleted channels & deleted discussions notifications for their creators
     const DEL_META_RE=/^\[(ChannelDeleted|PostDeleted):([^:\]]*):([^\]]+)\]/;
     for(const ch of channels){
       if(!ch.isArchived||ch.createdById!==user.$id)continue;
       const m=String(ch.description||'').match(DEL_META_RE);
       const actorId=m?m[2]:'';
       const deletedAt=(m&&m[3])||ch.$updatedAt||ch.$createdAt;
       const byOther=Boolean(actorId&&actorId!==user.$id);
       items.push({
         id:'comm_ch_deleted_'+ch.$id,
         category:'community',
         kind:'channel_deleted',
         title:byOther?`Channel #${ch.name} was deleted by Admin`:`Channel #${ch.name} deleted`,
         message:`Your community channel "#${ch.name}" and all of its discussions have been deleted.`,
         createdAt:deletedAt,
         module:'community'
       });
     }
     for(const p of posts){
       if(!p.isDeleted||p.authorId!==user.$id)continue;
       const m=String(p.body||'').match(DEL_META_RE);
       const delKind=m?m[1]:'PostDeleted';
       const actorId=m?m[2]:'';
       const deletedAt=(m&&m[3])||p.$updatedAt||p.$createdAt;
       const ch=channelById.get(p.channelId);
       const byOther=Boolean(actorId&&actorId!==user.$id);
       items.push({
         id:'comm_post_deleted_'+p.$id,
         category:'community',
         kind:'post_deleted',
         title:delKind==='ChannelDeleted'?`Discussion deleted with channel #${ch?.name||'channel'}`:(byOther?'Your discussion was deleted by Admin':'Discussion deleted'),
         message:`Your discussion "${p.title||'Untitled'}"${ch?` in #${ch.name}`:''} was deleted.`,
         createdAt:deletedAt,
         module:'community'
       });
     }
     // 5. Official announcements & outbreak advisories
     for(const n of notices){
       items.push({
         id:'comm_notice_'+n.id,
         category:'alerts',
         kind:n.category||'announcement',
         title:n.category==='outbreak'?`Declared Outbreak: ${n.title}`:n.category==='advisory'?`CVO Advisory: ${n.title}`:(n.barangay?`CVO Announcement (${n.barangay}): ${n.title}`:`CVO Announcement: ${n.title}`),
         message:`${n.barangay?'Brgy. '+n.barangay+' · ':''}${String(n.body||'').slice(0,100)}`,
         createdAt:n.date,
         module:officer?'alerts':'community'
       });
     }
     items.sort((a,b)=>{
       const ta=new Date(a.createdAt||0).getTime()||0;
       const tb=new Date(b.createdAt||0).getTime()||0;
       return tb-ta;
     });
     return {notifications:items.slice(0,60)};
   }
   case 'communityCreateChannel':{
     await requireVerified();const name=requireValue(data.name,80,'Channel name'),description=optional(data.description,300);
     const allowedPrivacy=admin?['public','private','staff','invite']:['public','private'];
     const privacy=choice(data.privacy||'public',allowedPrivacy);
     const existing=await readList(TABLES.channels,[],100);yes(existing.filter(x=>x.createdById===user.$id&&!x.isArchived).length<10,'You may own up to 10 channels.',409);
     yes(!existing.some(x=>x.name.toLowerCase()===name.toLowerCase()&&!x.isArchived),'A channel with this name already exists.',409);
     const ch=await create(TABLES.channels,'unique()',{name,description,privacy,createdById:user.$id,createdByName:user.name||'Member',isArchived:false});
     await create(TABLES.members,membershipId(ch.$id,user.$id),{channelId:ch.$id,userId:user.$id,userName:user.name||'Member',status:'approved',requestedAt:new Date().toISOString(),reviewedAt:new Date().toISOString()});
     return {id:ch.$id,name:ch.name};
   }
   case 'communitySetPrivacy':{
     await requireVerified();const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(admin||owned(ch),'Only the channel creator or an Admin can change its visibility.');
     const allowedPrivacy=admin?['public','private','staff','invite']:['public','private'];
     const privacy=choice(data.privacy,allowedPrivacy);await update(TABLES.channels,ch.$id,{privacy});return {privacy};
   }
   case 'communityChannelMembers':{
     ensureUser();
     const ch=await get(TABLES.channels,requireValue(data.channelId,36));
     yes(!ch.isArchived,'This channel is archived.',409);
     yes(admin||owned(ch),'Only the channel creator or an Admin can manage channel members.');
     const members=await readList(TABLES.members,[{attribute:'channelId',value:ch.$id}],100);
     return {members:members.filter(x=>x.status==='approved').map(x=>({id:x.$id,userId:x.userId,userName:x.userName||'Member',isCreator:x.userId===ch.createdById,addedAt:x.reviewedAt||x.requestedAt||x.$createdAt}))};
   }
   case 'communitySearchUsers':{
     ensureUser();
     const ch=await get(TABLES.channels,requireValue(data.channelId,36));
     yes(admin||owned(ch),'Only the channel creator or an Admin can search users to invite.');
     const q=optional(data.query,80).toLowerCase();
     const [profiles,roles,members]=await Promise.all([
       readList('user_profiles',[],100),
       getStaffRoles(),
       readList(TABLES.members,[{attribute:'channelId',value:ch.$id}],100)
     ]);
     const existingIds=new Set(members.filter(m=>m.status==='approved').map(m=>m.userId));
     const matches=profiles.filter(p=>{
       const uid=p.userId||p.$id;
       if(!uid||existingIds.has(uid)||uid===ch.createdById)return false;
       if(!q)return true;
       return [p.fullName,p.email,p.barangay].some(v=>String(v||'').toLowerCase().includes(q));
     }).slice(0,20).map(p=>{
       const uid=p.userId||p.$id;
       return {userId:uid,fullName:p.fullName||p.email||'Member',barangay:p.barangay||'',role:roles.get(uid)||'owner'};
     });
     return {users:matches};
   }
   case 'communityInviteMember':{
     ensureUser();
     const ch=await get(TABLES.channels,requireValue(data.channelId,36));
     yes(!ch.isArchived,'This channel is archived.',409);
     yes(admin||owned(ch),'Only the channel creator or an Admin can invite members.');
     yes(['invite','private'].includes(ch.privacy),'Invites are only available for invite-only or private channels.',409);
     const targetId=requireValue(data.userId,36,'User ID');
     let targetName=optional(data.userName,128);
     if(!targetName){
       const prof=await getOrNull('user_profiles',targetId);
       targetName=prof?.fullName||prof?.email||'Member';
       if(targetName==='Member'){try{const u=await api('GET','/users/'+id(targetId));targetName=u.name||u.email||'Member';}catch{}}
     }
     const now=new Date().toISOString();
     const m=await member(ch,targetId);
     if(m){await update(TABLES.members,m.$id,{userName:targetName,status:'approved',reviewedAt:now});}
     else{await create(TABLES.members,membershipId(ch.$id,targetId),{channelId:ch.$id,userId:targetId,userName:targetName,status:'approved',requestedAt:now,reviewedAt:now});}
     if(sendPushToUsers&&targetId!==user.$id){
       await sendPushToUsers([targetId],{title:`Added to #${ch.name}`,body:`You were invited to hidden channel #${ch.name}.`,data:{type:'join_status',channelId:ch.$id,tab:'feed'}});
     }
     return {invited:true,userId:targetId,userName:targetName};
   }
   case 'communityRemoveMember':{
     ensureUser();
     const ch=await get(TABLES.channels,requireValue(data.channelId,36));
     yes(!ch.isArchived,'This channel is archived.',409);
     yes(admin||owned(ch),'Only the channel creator or an Admin can remove members.');
     const targetId=requireValue(data.userId,36,'User ID');
     yes(targetId!==ch.createdById,'The channel creator cannot be removed.',409);
     const m=await member(ch,targetId);
     yes(m,'Member not found in this channel.',404);
     await remove(TABLES.members,m.$id);
     return {removed:true,userId:targetId};
   }
   case 'communityRequestJoin':{
     yes(owner||officer,'Only Pet Owners or Field Officers can request community membership.');const ch=await get(TABLES.channels,requireValue(data.channelId,36));
     yes(ch.privacy==='private'&&!ch.isArchived,'Membership requests are only needed for active private channels.',409);
     yes(!owned(ch),'You already own this channel.',409);
     const m=await member(ch);yes(!m||m.status==='rejected','Your request is already pending or approved.',409);
     const payload={channelId:ch.$id,userId:user.$id,userName:user.name||'Member',status:'pending',requestedAt:new Date().toISOString()};
     if(m)await update(TABLES.members,m.$id,{...payload,reviewedAt:null});else await create(TABLES.members,membershipId(ch.$id,user.$id),payload);
     if(sendPushToUsers)await sendPushToUsers([ch.createdById],{title:'Channel Membership Request',body:`${user.name||'A member'} requested to join private channel #${ch.name}.`,data:{type:'join_request',channelId:ch.$id,tab:'channels'}});
     return {status:'pending'};
   }
   case 'communityJoinRequests':{
     yes(owner||officer||admin,'Only channel owners or moderators may review requests.');const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(admin||owned(ch),'Only the creator can review join requests.');
     const members=await readList(TABLES.members,[{attribute:'channelId',value:ch.$id}],100);
     return {requests:members.filter(x=>x.status==='pending').map(x=>({id:x.$id,userName:x.userName,userId:x.userId,requestedAt:x.requestedAt}))};
   }
   case 'communityReviewJoin':{
     yes(owner||officer||admin,'Only channel owners or moderators may review requests.');const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(admin||owned(ch),'Only the creator can review join requests.');
     const m=await get(TABLES.members,requireValue(data.membershipId,36));yes(m.channelId===ch.$id&&m.status==='pending','Membership request not pending.',409);
     const status=choice(data.status,['approved','rejected']);await update(TABLES.members,m.$id,{status,reviewedAt:new Date().toISOString()});
     if(sendPushToUsers)await sendPushToUsers([m.userId],{title:status==='approved'?'Channel Request Approved!':'Channel Request Declined',body:status==='approved'?`You now have access to #${ch.name}.`:`Your request to join #${ch.name} was declined.`,data:{type:'join_status',channelId:ch.$id,tab:'feed'}});
     return {status};
   }
   case 'communityChannel':{
     const ch=await get(TABLES.channels,requireValue(data.channelId,36));yes(!ch.isArchived,'Channel is archived.',409);
     const m=await member(ch);
     if(ch.privacy==='staff'||ch.privacy==='invite')yes(isChannelListed(ch,m),'This channel is hidden.',403);
     const canRead=canAccessWithMembership(ch,m);
     return {channel:{id:ch.$id,name:ch.name,description:ch.description,privacy:ch.privacy,isCreator:owned(ch),membership:m?.status||'none',canRead},
       posts:canRead?await postsFor(ch):[],verified:await isVerified()};
   }
   case 'communityCreatePost':{
     await requireVerified();const ch=await get(TABLES.channels,requireValue(data.channelId,36));await assertVisible(ch);
     const title=requireValue(data.title,140,'Discussion title'),body=requireValue(data.body,5000,'Discussion');const ids=await validPostFiles(data.imageFileIds||[]);
     const rows=await readList(TABLES.posts,[{attribute:'channelId',value:ch.$id}],100);yes(rows.filter(p=>p.authorId===user.$id&&!p.isDeleted).length<100,'Posting limit reached for this channel.',429);
     const baseName=user.name||'Member';
     const authorName=admin?`${baseName.slice(0,115)} [Admin]`:officer?`${baseName.slice(0,108)} [Field Officer]`:baseName;
     const p=await create(TABLES.posts,'unique()',{channelId:ch.$id,authorId:user.$id,authorName,title,body,imageFileIds:JSON.stringify(ids),isDeleted:false});return {id:p.$id};
   }
   case 'communityDeleteChannel':{
     const ch=await get(TABLES.channels,requireValue(data.channelId,36));
     yes(owned(ch)||admin,'Only the channel creator or a CVO Administrator may delete this channel.');
     const nowIso=new Date().toISOString();
     const cleanDesc=String(ch.description||'').replace(/^\[(ChannelDeleted|PostDeleted):[^\]]+\]\s*/,'');
     await update(TABLES.channels,ch.$id,{isArchived:true,description:`[ChannelDeleted:${user.$id}:${nowIso}] ${cleanDesc}`.slice(0,300)});
     const [chPosts,chComments]=await Promise.all([
       readList(TABLES.posts,[{attribute:'channelId',value:ch.$id}],100).catch(()=>[]),
       readList(TABLES.comments,[{attribute:'channelId',value:ch.$id}],100).catch(()=>[])
     ]);
     await Promise.all([
       ...chPosts.filter(p=>!p.isDeleted).map(p=>update(TABLES.posts,p.$id,{isDeleted:true,imageFileIds:'[]',body:`[ChannelDeleted:${user.$id}:${nowIso}]`}).catch(()=>{})),
       ...chComments.filter(c=>!c.isDeleted).map(c=>update(TABLES.comments,c.$id,{isDeleted:true,body:'[Removed]'}).catch(()=>{}))
     ]);
     if(ch.createdById!==user.$id&&sendPushToUsers){
       await sendPushToUsers([ch.createdById],{title:`Channel #${ch.name} was deleted by Admin`,body:`Your community channel "#${ch.name}" was removed by a CVO Administrator.`,data:{type:'channel_deleted',tab:'channels'}});
     }
     return {deleted:true,channelId:ch.$id,deletedPosts:chPosts.filter(p=>!p.isDeleted).length};
   }
   case 'communityDeletePost':{
     const p=await get(TABLES.posts,requireValue(data.postId,36));yes(p.authorId===user.$id||admin,'Only the author or CVO may remove this discussion.');
     const nowIso=new Date().toISOString();
     await update(TABLES.posts,p.$id,{isDeleted:true,imageFileIds:'[]',body:`[PostDeleted:${user.$id}:${nowIso}]`});
     if(p.authorId!==user.$id&&sendPushToUsers){
       await sendPushToUsers([p.authorId],{title:'Your discussion was deleted by Admin',body:`Your discussion "${p.title}" was removed by a CVO Administrator.`,data:{type:'post_deleted',channelId:p.channelId,tab:'feed'}});
     }
     return {deleted:true};
   }
   case 'communityComments':{
     const p=await get(TABLES.posts,requireValue(data.postId,36));const ch=await get(TABLES.channels,p.channelId);await assertVisible(ch);
     const [comments,votes,roles]=await Promise.all([readRecent(TABLES.comments,100,[{attribute:'postId',value:p.$id}]),voteSummaries(ch.$id),getStaffRoles()]);
     return {post:cleanPost(p,roles),comments:comments.sort((a,b)=>String(a.$createdAt).localeCompare(String(b.$createdAt))).map(c=>({...cleanComment(c,roles),...(votes.get('comment:'+c.$id)||{score:0,upvotes:0,downvotes:0,myVote:0})}))};
   }
   case 'communityCreateComment':{
     await requireVerified();const p=await get(TABLES.posts,requireValue(data.postId,36));yes(!p.isDeleted,'This discussion is closed.',409);
     const ch=await get(TABLES.channels,p.channelId);await assertVisible(ch);
     const parentId=optional(data.parentCommentId,36);let parent=null;if(parentId){parent=await get(TABLES.comments,parentId);yes(parent.postId===p.$id&&!parent.isDeleted,'Invalid reply target.',400);}
     const baseName=user.name||'Member';
     const authorName=admin?`${baseName.slice(0,115)} [Admin]`:officer?`${baseName.slice(0,108)} [Field Officer]`:baseName;
     const body=requireValue(data.body,2000,'Comment');const c=await create(TABLES.comments,'unique()',{channelId:ch.$id,postId:p.$id,parentCommentId:parentId,authorId:user.$id,authorName,body,isDeleted:false});
     if(sendPushToUsers&&p.authorId!==user.$id){
       await sendPushToUsers([p.authorId],{title:`${user.name||'A member'} commented on your discussion`,body:`On "${p.title}": "${body.slice(0,100)}"`,data:{type:'post_comment',channelId:ch.$id,postId:p.$id,tab:'feed'}});
     }
     if(sendPushToUsers&&parent&&parent.authorId!==user.$id&&parent.authorId!==p.authorId){
       await sendPushToUsers([parent.authorId],{title:`${user.name||'A member'} replied to your comment`,body:`"${body.slice(0,100)}" in "${p.title}"`,data:{type:'comment_reply',channelId:ch.$id,postId:p.$id,tab:'feed'}});
     }
     return {id:c.$id};
   }
   case 'communityDeleteComment':{
     const c=await get(TABLES.comments,requireValue(data.commentId,36));yes(c.authorId===user.$id||admin,'Only the author or CVO may remove this comment.');await update(TABLES.comments,c.$id,{isDeleted:true,body:'[Removed]'});return {deleted:true};
   }
   case 'communityVote':{
     await requireVerified();const type=choice(data.targetType,['post','comment']);const value=Number(data.value);yes(value===1||value===-1,'Vote must be +1 or -1.',400);
     const target=await get(type==='post'?TABLES.posts:TABLES.comments,requireValue(data.targetId,36));const ch=await get(TABLES.channels,target.channelId);await assertVisible(ch);
     yes(!target.isDeleted,'Cannot vote on removed content.',409);
     const rowId=voteId(type,target.$id,user.$id);const existing=await getOrNull(TABLES.votes,rowId);let result=0;
     if(existing?.value===value){await remove(TABLES.votes,rowId);}else if(existing){await update(TABLES.votes,rowId,{value});result=value;}
     else{await create(TABLES.votes,rowId,{channelId:ch.$id,targetType:type,targetId:target.$id,userId:user.$id,value});result=value;}
     if(result===1&&target.authorId!==user.$id&&sendPushToUsers){
       await sendPushToUsers([target.authorId],{title:`New upvote on your ${type==='post'?'discussion':'comment'}`,body:`Someone upvoted your ${type==='post'?`discussion "${target.title}"`:'comment'} in #${ch.name}.`,data:{type:'like_'+type,channelId:ch.$id,postId:type==='post'?target.$id:target.postId,tab:'feed'}});
     }
     return {myVote:result};
   }
   case 'communityImageToken':{
     const p=await get(TABLES.posts,requireValue(data.postId,36));yes(!p.isDeleted,'Image no longer available.',404);
     const ch=await get(TABLES.channels,p.channelId);await assertVisible(ch);
     const fileId=requireValue(data.fileId,36);yes(jsonArray(p.imageFileIds).includes(fileId),'Image does not belong to this discussion.',403);
     const expire=new Date(Date.now()+5*60*1000).toISOString();const token=await api('POST',`/tokens/buckets/${id(MEDIA)}/files/${id(fileId)}`,{expire});
     return {url:`${process.env.APPWRITE_ENDPOINT||'https://sgp.cloud.appwrite.io/v1'}/storage/buckets/${id(MEDIA)}/files/${id(fileId)}/view?project=${encodeURIComponent(process.env.APPWRITE_PROJECT_ID||'6aeff5c9002718442fdf')}&token=${encodeURIComponent(token.secret)}`,expiresAt:expire};
   }
   case 'communitySearch':{
     const term=requireValue(data.query,80,'Search term').toLowerCase();yes(term.length>=2,'Enter at least two characters.',400);
     const [channels,p,roles]=await Promise.all([listings(),readList(TABLES.posts,[],100),getStaffRoles()]);
     const allowed=new Map(channels.filter(c=>c.canRead).map(c=>[c.id,c]));
     const posts=p.filter(x=>!x.isDeleted&&allowed.has(x.channelId)&&[x.title,x.body].some(t=>String(t||'').toLowerCase().includes(term))).slice(0,30).map(x=>({...cleanPost(x,roles),channelName:allowed.get(x.channelId).name}));
     return {channels:channels.filter(x=>(x.name+' '+x.description).toLowerCase().includes(term)),posts};
   }
   case 'communityPublishAnnouncement':{
     yes(admin,'Only CVO Administrators may publish official announcements.');const title=requireValue(data.title,140,'Announcement title');
     const rawBody=requireValue(data.body,2000,'Announcement');
     const tagMatch=rawBody.match(/^\[Barangay:\s*([^\]]+)\]\s*\n?/i);
     const barangay=optional(data.barangay||(tagMatch?tagMatch[1]:''),100);
     const cleanBody=rawBody.replace(/^\[Barangay:\s*([^\]]+)\]\s*\n?/i,'').trim()||rawBody;
     const storedBody=barangay?`[Barangay: ${barangay}]\n${cleanBody}`.slice(0,2000):cleanBody;
     const audience=choice(data.audience,['owners','officers','both']);
     const publishedAt=new Date().toISOString();
     let n;
     try{
       n=await create(TABLES.announcements,'unique()',{title,body:storedBody,audience,barangay,isActive:true,issuedById:user.$id,publishedAt});
     }catch(e){
       if(/unknown attribute|invalid document structure|barangay/i.test(String(e?.message||''))){
         n=await create(TABLES.announcements,'unique()',{title,body:storedBody,audience,isActive:true,issuedById:user.$id,publishedAt});
       }else throw e;
     }
     if(sendPushToUsers){
       const officerIds=(audience==='officers'||audience==='both')&&getOfficerUserIds?await getOfficerUserIds():[];
       const ownerIds=(audience==='owners'||audience==='both')&&getOwnerIdsForBarangay?await getOwnerIdsForBarangay(barangay):[];
       await sendPushToUsers([...officerIds,...ownerIds],{title:barangay?`CVO Announcement (${barangay}): ${title}`:`CVO Announcement: ${title}`,body:cleanBody.slice(0,160),data:{type:'announcement',tab:'notices'}});
     }
     return {id:n.$id,audience,barangay};
   }
   case 'communityDeactivateAnnouncement':{
     yes(admin,'Only CVO Administrators may deactivate announcements.');const n=await get(TABLES.announcements,requireValue(data.announcementId,36));await update(TABLES.announcements,n.$id,{isActive:false});return {isActive:false};
   }
   default:bad(400,'Unsupported Community action.');
 }
}
