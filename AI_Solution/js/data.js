export const STORAGE_KEY='minitwin-demo-v2';
export async function loadData(){const [products,cartons,materials]=await Promise.all(['products','cartons','materials'].map(async name=>{const response=await fetch(`data/${name}.json`);if(!response.ok)throw new Error(`Không tải được data/${name}.json`);return response.json()}));return {products,cartons,materials}}
export function readState(data){try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return {orders:Array.isArray(saved.orders)?saved.orders:[],cartonStock:saved.cartonStock||Object.fromEntries(data.cartons.map(c=>[c.cartonId,c.stock]))}}catch{return {orders:[],cartonStock:Object.fromEntries(data.cartons.map(c=>[c.cartonId,c.stock]))}}}
export function writeState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));window.dispatchEvent(new CustomEvent('minitwin:updated',{detail:state}))}
export function formatMoney(amount){return new Intl.NumberFormat('vi-VN').format(Math.round(amount||0))+' ₫'}
export function formatSize(d){return `${d.L} × ${d.W} × ${d.H} cm`}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
export function productBySku(data,sku){return data.products.find(p=>p.sku===sku)}
