export const STORAGE_KEY='minitwin-demo-v2';
const SKU_ALIASES={HPL826C:'HLE5100NS2',HPL934:'LBF401-7',HPL817:'HFL104D18',LHC4020:'LHC4321',LHC6180:'LHC6180FU',LLG821:'LLG428S5',HPL955:'HLE5300NS2',LHC4122:'LHC3257',LLG513:'LBG454BLU',HPL745:'LBF450',LHC6230:'LHC4160',LLG331:'LLG301S3',HPL910:'HPL510',LHC6115:'LHC1487',LLG730:'LLG215',HPL213:'LBF402S5SP',LHC398:'LHC4440',LLG905:'LLG205S6',HPL604:'HPP453NVY',LHC708:'LHC8042NVY',LLG121:'LLG242'};
export async function loadData(){const [products,cartons,materials]=await Promise.all(['products','cartons','materials'].map(async name=>{const response=await fetch(`data/${name}.json`);if(!response.ok)throw new Error(`Không tải được data/${name}.json`);return response.json()}));return {products,cartons,materials}}
export function readState(data){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');const orders=Array.isArray(saved.orders)?saved.orders:[];for(const order of orders)for(const line of order.items||[])if(SKU_ALIASES[line.sku])line.sku=SKU_ALIASES[line.sku];return {orders,cartonStock:saved.cartonStock||Object.fromEntries(data.cartons.map(c=>[c.cartonId,c.stock]))}}catch{return {orders:[],cartonStock:Object.fromEntries(data.cartons.map(c=>[c.cartonId,c.stock]))}}}
export function writeState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent('minitwin:updated',{detail:state}))}
export function formatMoney(amount){return new Intl.NumberFormat('vi-VN').format(Math.round(amount||0))+' ₫'}
export function formatSize(d){return `${d.L} × ${d.W} × ${d.H} cm`}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function productBySku(data,sku){return data.products.find(p=>p.sku===sku)}
export function migrateSku(sku){return SKU_ALIASES[sku]||sku}

