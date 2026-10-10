const SHEET_ID="1SL3XZqx5KBbCqUyPcN62YuGSnctC7SHGdHI43aFFs24";
const SHEET_GID="1943463274";
const endpoint=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}&range=A2:H`;

let cards=[];
let mobilePage=0;
let mobilePageCount=0;
let touchStartX=0;
let touchStartY=0;
let visibleCards=[];
let currentModalIndex=-1;
let wishlistOnly=false;
const $=id=>document.getElementById(id);
const WISHLIST_KEY="aikatsuEncoreWishlist";
const OWNED_KEY="aikatsuEncoreOwned";
function readSet(key){
  try{return new Set(JSON.parse(localStorage.getItem(key)||"[]").map(String));}
  catch(e){return new Set();}
}
let wishlist=readSet(WISHLIST_KEY);
let owned=readSet(OWNED_KEY);
function saveSet(key,set){
  try{localStorage.setItem(key,JSON.stringify([...set]));}catch(e){}
}
function cardKey(card){return String(card.id??"").trim();}
function isOwned(card){return owned.has(cardKey(card));}
function isWishlisted(card){return wishlist.has(cardKey(card));}
function seasonForId(id){
  const value=String(id??"").trim().toUpperCase();
  if(value.startsWith("EP"))return "프로모션";
  const match=value.match(/^E([0-9]+)/);
  return match?Number(match[1])+"탄":"기타";
}

function esc(v){
  return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function normalize(v){
  return String(v??"").normalize("NFKC").replace(/\s+/g,"").trim().toLowerCase();
}

function isAccessory(card){
  return normalize(card.type)==="악세서리" || normalize(card.category)==="악세서리";
}

function hasImageUrl(value){
  return typeof value==="string" && value.trim()!=="";
}

async function loadData(){
  try{
    const res=await fetch(endpoint);
    if(!res.ok) throw new Error("Google Sheets 응답 오류: "+res.status);
    const text=await res.text();
    const json=JSON.parse(text.substring(text.indexOf("{"),text.lastIndexOf("}")+1));
    cards=(json.table.rows||[]).map(r=>{
      const c=r.c||[];
      const v=i=>c[i]?.v??"";
      return {id:v(0),category:v(1),type:v(2),grade:v(3),nameJa:v(4),nameKo:v(5),front:v(6),back:v(7)};
    // ID가 있어도 앞면과 뒷면 이미지가 모두 있는 카드만 사이트에 표시합니다.
    }).filter(x=>hasImageUrl(x.front) && hasImageUrl(x.back));
    buildFilters();
    updateCollectionCount();
    render();
    $("loading").hidden=true;
  }catch(e){
    $("loading").hidden=true;
    $("error").hidden=false;
    $("error").textContent="데이터를 불러오지 못했습니다. Google Sheets 공유 설정과 이미지 URL을 확인해주세요. ("+e.message+")";
  }
}

function fillSelect(id,values,order=[]){
  const el=$(id), first=el.options[0];
  el.innerHTML="";
  el.appendChild(first);
  const rank=value=>{
    const normalized=normalize(value);
    // '액세서리'와 기존 시트의 표기 '악세서리'를 같은 마지막 순서로 취급합니다.
    const key=normalized==="악세서리"?"액세서리":normalized;
    return order.findIndex(item=>normalize(item)===key);
  };
  [...new Set(values.filter(Boolean).map(String))].sort((a,b)=>{
    const ra=rank(a),rb=rank(b);
    if(ra!==-1||rb!==-1){
      if(ra===-1)return 1;
      if(rb===-1)return -1;
      if(ra!==rb)return ra-rb;
    }
    return a.localeCompare(b,"ko");
  }).forEach(v=>{
    const o=document.createElement("option");
    o.value=v;o.textContent=v;el.appendChild(o);
  });
}
function buildFilters(){
  fillSelect("category",cards.map(x=>x.category),["풀코디","상의","하의","원피스","슈즈","액세서리"]);
  // 시트의 실제 표기인 '큐트'와 '큐티'를 같은 항목으로 인식해 지정 순서로 정렬합니다.
  const typeOrder=["큐트","큐티","쿨","섹시","팝"];
  const typeValues=[...new Set(cards.map(x=>String(x.type??"")).filter(v=>v.trim()))];
  const canonicalType=value=>{
    const key=normalize(value);
    if(key==="큐트"||key==="큐티")return "큐트";
    return key;
  };
  const typeRank=value=>typeOrder.findIndex(item=>canonicalType(item)===canonicalType(value));
  const typeSelect=$("type"), typeFirst=typeSelect.options[0];
  typeSelect.innerHTML="";
  typeSelect.appendChild(typeFirst);
  typeValues.sort((a,b)=>{
    const ra=typeRank(a), rb=typeRank(b);
    if(ra===-1 && rb===-1)return a.localeCompare(b,"ko");
    if(ra===-1)return 1;
    if(rb===-1)return -1;
    return ra-rb;
  }).forEach(v=>{
    const option=document.createElement("option");
    option.value=v;
    option.textContent=v;
    typeSelect.appendChild(option);
  });
  fillSelect("grade",cards.map(x=>x.grade),["ER","PR","R","N"]);
  const seasonValues=[...new Set(cards.map(x=>seasonForId(x.id)))];
  const seasonOrder=(a,b)=>{
    if(a==="프로모션")return b==="프로모션"?0:1;
    if(b==="프로모션")return -1;
    if(a==="기타")return 1;
    if(b==="기타")return -1;
    return Number.parseInt(a,10)-Number.parseInt(b,10);
  };
  const seasonSelect=$("season");
  const seasonFirst=seasonSelect.options[0];
  seasonSelect.innerHTML="";
  seasonSelect.appendChild(seasonFirst);
  seasonValues.sort(seasonOrder).forEach(value=>{
    const option=document.createElement("option");
    option.value=value;option.textContent=value;seasonSelect.appendChild(option);
  });
}
function filtered(){
  const q=$( "search").value.trim().toLowerCase();
  const cat=$("category").value,type=$("type").value,grade=$("grade").value,season=$("season").value;
  return cards.filter(x=>
    (!q||[x.id,x.category,x.type,x.grade,x.nameJa,x.nameKo].some(v=>String(v).toLowerCase().includes(q)))&&
    (!cat||x.category===cat)&&(!type||x.type===type)&&(!grade||x.grade===grade)&&
    (!season||seasonForId(x.id)===season)&&(!wishlistOnly||isWishlisted(x))
  );
}

function updateCollectionCount(){
  const count=cards.filter(isOwned).length;
  $("collectionCount").textContent=`보유 카드 ${count}장 · 전체 ${cards.length}장`;
}
function render(){
  const grid=$("grid");
  grid.innerHTML="";
  mobilePage=0;
  const list=filtered();
  visibleCards=list;

  list.forEach((card,index)=>{
    if(index%4===0){
      const page=document.createElement("div");
      page.className="card-page";
      grid.appendChild(page);
    }
    const page=grid.lastElementChild;
    const el=document.createElement("article");
    el.className="card"+(isOwned(card)?" owned-card":" unowned-card");
    const accessory=isAccessory(card);
    const heart=isWishlisted(card);
    el.innerHTML=`<div class="card-image${accessory?" accessory-card":""}">
      <img src="${esc(card.front)}" alt="${esc(card.nameKo)}" loading="lazy">
      <button class="card-heart${heart?" active":""}" type="button" aria-label="${heart?"위시리스트 해제":"위시리스트 추가"}" aria-pressed="${heart}" title="위시리스트">${heart?"♥":"♡"}</button>
      <span class="card-season">${esc(seasonForId(card.id))}</span>
    </div><div class="card-name">${esc(card.nameKo||card.nameJa||"이름 없음")}</div><div class="card-id">ID : ${esc(card.id)}</div>`;
    el.querySelector(".card-heart").addEventListener("click",event=>{
      event.stopPropagation();
      toggleWishlist(card);
    });
    el.addEventListener("click",()=>openModal(card));
    page.appendChild(el);
  });

  mobilePageCount=Math.ceil(list.length/4);
  updateMobilePager();
  $("wishlistOnly").classList.toggle("active",wishlistOnly);
  $("wishlistOnly").setAttribute("aria-pressed",String(wishlistOnly));
  $("wishlistOnly").textContent=wishlistOnly?"♥ 위시리스트 보기 중":"♡ 위시리스트만 보기";
}
function toggleWishlist(card){
  const key=cardKey(card);
  if(wishlist.has(key))wishlist.delete(key);else wishlist.add(key);
  saveSet(WISHLIST_KEY,wishlist);
  updateCollectionCount();
  const wasModalOpen=!$("modal").hidden;
  render();
  if(wasModalOpen){
    const index=visibleCards.findIndex(item=>cardKey(item)===key);
    if(index<0){closeModal();return;}
    currentModalIndex=index;
    populateModal(visibleCards[index]);
  }
}
function toggleOwned(card){
  const key=cardKey(card);
  if(owned.has(key))owned.delete(key);else owned.add(key);
  saveSet(OWNED_KEY,owned);
  updateCollectionCount();
  const wasModalOpen=!$("modal").hidden;
  render();
  if(wasModalOpen){
    const index=visibleCards.findIndex(item=>cardKey(item)===key);
    if(index>=0){currentModalIndex=index;populateModal(visibleCards[index]);}
  }
}

function updateMobilePager(){
  const grid=$("grid");
  grid.classList.remove("book-mode");
  const pager=document.querySelector(".book-pager");
  if(pager)pager.hidden=true;
}

function goPage(delta){
  // 카드 목록은 모든 화면에서 한 번에 4열로 표시합니다.
}

function openModal(card){
  visibleCards=filtered();
  currentModalIndex=visibleCards.findIndex(item=>cardKey(item)===cardKey(card));
  if(currentModalIndex<0){visibleCards=[card];currentModalIndex=0;}
  populateModal(card);
  $("modal").hidden=false;
  document.body.style.overflow="hidden";
}
function populateModal(card){
  $("detailFront").src=card.front||"";
  $("detailBack").src=card.back||"";
  $("detailFront").classList.remove("accessory-detail");
  $("detailBack").classList.remove("accessory-detail");
  $("detailKo").textContent=card.nameKo||"";
  $("detailJa").textContent=card.nameJa||"";
  $("detailId").textContent=card.id||"";
  $("detailGrade").textContent=card.grade||"";
  $("detailType").textContent=card.type||"";
  $("detailCategory").textContent=card.category||"";
  $("detailSeason").textContent=seasonForId(card.id);
  const heart=isWishlisted(card), has=isOwned(card);
  $("wishlistToggle").textContent=heart?"♥ 위시리스트 등록됨":"♡ 위시리스트";
  $("wishlistToggle").classList.toggle("active",heart);
  $("wishlistToggle").setAttribute("aria-pressed",String(heart));
  $("ownedToggle").textContent=has?"☑ 보유 카드":"□ 미보유 카드";
  $("ownedToggle").classList.toggle("active",has);
  $("ownedToggle").setAttribute("aria-pressed",String(has));
  $("prevCard").disabled=currentModalIndex<=0;
  $("nextCard").disabled=currentModalIndex>=visibleCards.length-1;
}
function moveModalCard(delta){
  if($("modal").hidden)return;
  const next=currentModalIndex+delta;
  if(next<0||next>=visibleCards.length)return;
  currentModalIndex=next;
  populateModal(visibleCards[currentModalIndex]);
}

function closeModal(){
  $("modal").hidden=true;
  document.body.style.overflow="";
}

$("modalClose").addEventListener("click",closeModal);
document.querySelector(".modal-backdrop").addEventListener("click",closeModal);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!$("modal").hidden)closeModal();
  if(!$("modal").hidden&&e.key==="ArrowLeft")moveModalCard(-1);
  if(!$("modal").hidden&&e.key==="ArrowRight")moveModalCard(1);
});
$("pagePrev").addEventListener("click",()=>goPage(-1));
$("pageNext").addEventListener("click",()=>goPage(1));
$("prevCard").addEventListener("click",()=>moveModalCard(-1));
$("nextCard").addEventListener("click",()=>moveModalCard(1));
$("wishlistToggle").addEventListener("click",()=>{
  if(currentModalIndex>=0&&visibleCards[currentModalIndex])toggleWishlist(visibleCards[currentModalIndex]);
});
$("ownedToggle").addEventListener("click",()=>{
  if(currentModalIndex>=0&&visibleCards[currentModalIndex])toggleOwned(visibleCards[currentModalIndex]);
});
$("wishlistOnly").addEventListener("click",()=>{
  wishlistOnly=!wishlistOnly;
  render();
});

const grid=$("grid");
grid.addEventListener("touchstart",e=>{
  if(!window.matchMedia("(max-width:600px)").matches)return;
  touchStartX=e.changedTouches[0].clientX;
  touchStartY=e.changedTouches[0].clientY;
},{passive:true});
grid.addEventListener("touchend",e=>{
  if(!window.matchMedia("(max-width:600px)").matches)return;
  const dx=e.changedTouches[0].clientX-touchStartX;
  const dy=e.changedTouches[0].clientY-touchStartY;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))goPage(dx<0?1:-1);
},{passive:true});

["search","category","type","grade","season"].forEach(id=>$(id).addEventListener("input",render));
window.addEventListener("resize",updateMobilePager);
loadData();