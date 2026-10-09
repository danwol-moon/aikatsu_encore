const SHEET_ID="1SL3XZqx5KBbCqUyPcN62YuGSnctC7SHGdHI43aFFs24";
const SHEET_GID="1943463274";
const endpoint=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}&range=A2:H`;

let cards=[];
let mobilePage=0;
let mobilePageCount=0;
let touchStartX=0;
let touchStartY=0;
const $=id=>document.getElementById(id);

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
    render();
    $("loading").hidden=true;
  }catch(e){
    $("loading").hidden=true;
    $("error").hidden=false;
    $("error").textContent="데이터를 불러오지 못했습니다. Google Sheets 공유 설정과 이미지 URL을 확인해주세요. ("+e.message+")";
  }
}

function fillSelect(id,values){
  const el=$(id), first=el.options[0];
  el.innerHTML="";
  el.appendChild(first);
  [...new Set(values.filter(Boolean).map(String))].sort((a,b)=>a.localeCompare(b,"ko")).forEach(v=>{
    const o=document.createElement("option");
    o.value=v;o.textContent=v;el.appendChild(o);
  });
}
function buildFilters(){
  fillSelect("category",cards.map(x=>x.category));
  fillSelect("type",cards.map(x=>x.type));
  fillSelect("grade",cards.map(x=>x.grade));
}
function filtered(){
  const q=$( "search").value.trim().toLowerCase();
  const cat=$( "category").value,type=$( "type").value,grade=$( "grade").value;
  return cards.filter(x=>
    (!q||[x.id,x.category,x.type,x.grade,x.nameJa,x.nameKo].some(v=>String(v).toLowerCase().includes(q)))&&
    (!cat||x.category===cat)&&(!type||x.type===type)&&(!grade||x.grade===grade)
  );
}

function render(){
  const grid=$( "grid");
  grid.innerHTML="";
  mobilePage=0;
  const list=filtered();

  list.forEach((card,index)=>{
    if(index%4===0){
      const page=document.createElement("div");
      page.className="card-page";
      grid.appendChild(page);
    }
    const page=grid.lastElementChild;
    const el=document.createElement("article");
    el.className="card";
    const accessory=isAccessory(card);
    el.innerHTML=`<div class="card-image${accessory?" accessory-card":""}"><img src="${esc(card.front)}" alt="${esc(card.nameKo)}" loading="lazy"></div><div class="card-name">${esc(card.nameKo||card.nameJa||"이름 없음")}</div><div class="card-id">ID : ${esc(card.id)}</div>`;
    el.addEventListener("click",()=>openModal(card));
    page.appendChild(el);
  });

  mobilePageCount=Math.ceil(list.length/4);
  updateMobilePager();
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
  const accessory=isAccessory(card);
  $("detailFront").src=card.front||"";
  $("detailBack").src=card.back||"";
  // 상세 화면에서는 악세서리도 원본 방향(가로)을 유지합니다.
  $("detailFront").classList.remove("accessory-detail");
  $("detailBack").classList.remove("accessory-detail");
  $("detailKo").textContent=card.nameKo||"";
  $("detailJa").textContent=card.nameJa||"";
  $("detailId").textContent=card.id||"";
  $("detailGrade").textContent=card.grade||"";
  $("detailType").textContent=card.type||"";
  $("detailCategory").textContent=card.category||"";
  $("modal").hidden=false;
  document.body.style.overflow="hidden";
}

function closeModal(){
  $("modal").hidden=true;
  document.body.style.overflow="";
}

$("modalClose").addEventListener("click",closeModal);
document.querySelector(".modal-backdrop").addEventListener("click",closeModal);
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!$("modal").hidden)closeModal();
  if(e.key==="ArrowLeft")goPage(-1);
  if(e.key==="ArrowRight")goPage(1);
});
$("pagePrev").addEventListener("click",()=>goPage(-1));
$("pageNext").addEventListener("click",()=>goPage(1));

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

["search","category","type","grade"].forEach(id=>$(id).addEventListener("input",render));
window.addEventListener("resize",updateMobilePager);
loadData();