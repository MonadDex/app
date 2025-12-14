/* =====================================================
   MonadDex — app.js (FULL VERSION)
   Immutable DEX on Monad (ChainId 143)

   Design principles:
   - Users only need MON
   - WMON is handled internally
   - Pools are discovered via Factory (no hardcode)
   - VIN is default demo token, but logic is generic ERC20
   - No owner, no admin, no upgrade
   Do not trust — Verify.
   ===================================================== */

'use strict';

/********************
 * READ CONFIG
 ********************/
const CFG = {
  chainId: Number(document.querySelector('meta[name="monaddex-chain-id"]').content),
  chainName: document.querySelector('meta[name="monaddex-chain-name"]').content,
  nativeSymbol: document.querySelector('meta[name="monaddex-native-symbol"]').content,
  wmon: document.querySelector('meta[name="monaddex-wmon-address"]').content,
  factory: document.querySelector('meta[name="monaddex-factory-address"]').content,
  defaultToken: document.querySelector('meta[name="monaddex-demo-token"]').content
};

/********************
 * GLOBAL STATE
 ********************/
let provider, signer, user;
let factory, wmon;
let token;      // ERC20 current token
let pool;       // MonadDexPool
let tokenAddress = CFG.defaultToken;

/********************
 * MINIMAL ABIs
 ********************/
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)'
];

const WMON_ABI = [
  'function deposit() payable',
  'function withdraw(uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)'
];

const FACTORY_ABI = [
  'function getPool(address) view returns (address)',
  'function createPool(address) returns (address)',
  'function allPoolsLength() view returns (uint256)',
  'function allPools(uint256) view returns (address)',
  'function WMON() view returns (address)'
];

const POOL_ABI = [
  'function reserveA() view returns (uint256)',
  'function reserveB() view returns (uint256)',
  'function addLiquidity(uint256,uint256)',
  'function removeLiquidity(uint256)',
  'function swapAforB(uint256)',
  'function swapBforA(uint256)',
  'function shares(address) view returns (uint256)',
  'function totalShares() view returns (uint256)',
  'function TOKEN() view returns (address)',
  'function WMON() view returns (address)'
];

/********************
 * UI HELPERS
 ********************/
const $ = id => document.getElementById(id);
const fmt = (v, d=18) => Number(ethers.formatUnits(v, d)).toLocaleString();
function setStatus(el, msg){ el.textContent = msg; }

/********************
 * TAB NAVIGATION
 ********************/
function showSection(id){
  document.querySelectorAll('.view-section').forEach(sec=>{
    sec.style.display = 'none';
  });
  const el = document.getElementById(id);
  if(el) el.style.display = 'block';
}

/********************
 * CONNECT WALLET
 ********************/
async function connectWallet(){
  if(!window.ethereum) return alert('No wallet found');

  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);

  const net = await provider.getNetwork();
  if(Number(net.chainId) !== CFG.chainId){
    alert('Please switch to Monad Mainnet');
    return;
  }

  signer = await provider.getSigner();
  user = await signer.getAddress();

  $('connectBtn').textContent = user.slice(0,6)+'…'+user.slice(-4);

  factory = new ethers.Contract(CFG.factory, FACTORY_ABI, signer);
  wmon = new ethers.Contract(CFG.wmon, WMON_ABI, signer);

  await loadToken(tokenAddress);
}

/********************
 * LOAD TOKEN & POOL
 ********************/
async function loadToken(addr){
  tokenAddress = addr;
  token = new ethers.Contract(addr, ERC20_ABI, signer);

  const poolAddr = await factory.getPool(addr);
  if(poolAddr === ethers.ZeroAddress){
    pool = null;
    $('poolList').innerHTML = '<div class="muted">No pool yet for this token</div>';
    return;
  }

  pool = new ethers.Contract(poolAddr, POOL_ABI, signer);
  await refreshPoolInfo();
}

/********************
 * POOL INFO
 ********************/
async function refreshPoolInfo(){
  if(!pool) return;

  const [rA, rB, ts, us] = await Promise.all([
    pool.reserveA(),
    pool.reserveB(),
    pool.totalShares(),
    pool.shares(user)
  ]);

  $('poolList').innerHTML = `
    <div class="card">
      <div>WMON reserve: <b>${fmt(rA)}</b></div>
      <div>Token reserve: <b>${fmt(rB)}</b></div>
      <div>Total shares: <b>${fmt(ts)}</b></div>
      <div>Your shares: <b>${fmt(us)}</b></div>
    </div>
  `;
}

/********************
 * WMON HELPER
 ********************/
async function ensureWMON(amount){
  const bal = await wmon.balanceOf(user);
  if(bal >= amount) return;
  const need = amount - bal;
  await (await wmon.deposit({ value: need })).wait();
}

/********************
 * SWAP LOGIC
 ********************/
async function swapMONtoToken(){
  if(!pool) return alert('Pool not found');

  const amt = ethers.parseUnits($('swapFrom').value || '0');
  if(amt <= 0n) return;

  await ensureWMON(amt);
  await wmon.approve(pool.target, amt);

  setStatus($('swapStatus'), 'Swapping…');
  await (await pool.swapAforB(amt)).wait();
  setStatus($('swapStatus'), 'Swap complete');
  await refreshPoolInfo();
}

async function swapTokentoMON(){
  if(!pool) return alert('Pool not found');

  const amt = ethers.parseUnits($('swapFrom').value || '0');
  if(amt <= 0n) return;

  await token.approve(pool.target, amt);
  setStatus($('swapStatus'), 'Swapping…');
  await (await pool.swapBforA(amt)).wait();

  const wBal = await wmon.balanceOf(user);
  if(wBal > 0n) await (await wmon.withdraw(wBal)).wait();

  setStatus($('swapStatus'), 'Swap complete');
  await refreshPoolInfo();
}

/********************
 * LIQUIDITY
 ********************/
async function addLiquidity(){
  if(!pool) return alert('Pool not found');

  const mon = ethers.parseUnits($('liqMON').value || '0');
  const tok = ethers.parseUnits($('liqVIN').value || '0');
  if(mon<=0n || tok<=0n) return;

  await ensureWMON(mon);
  await wmon.approve(pool.target, mon);
  await token.approve(pool.target, tok);

  setStatus($('liqStatus'), 'Supplying liquidity…');
  await (await pool.addLiquidity(mon, tok)).wait();
  setStatus($('liqStatus'), 'Liquidity added');
  await refreshPoolInfo();
}

async function removeLiquidity(){
  if(!pool) return alert('Pool not found');

  const shares = await pool.shares(user);
  if(shares <= 0n) return;

  setStatus($('liqStatus'), 'Removing liquidity…');
  await (await pool.removeLiquidity(shares)).wait();

  const wBal = await wmon.balanceOf(user);
  if(wBal > 0n) await (await wmon.withdraw(wBal)).wait();

  setStatus($('liqStatus'), 'Liquidity removed');
  await refreshPoolInfo();
}

/********************
 * EVENTS
 ********************/
window.addEventListener('load', ()=>{
  // tabs
  document.querySelectorAll('.top-nav a').forEach(link=>{
    link.addEventListener('click', e=>{
      e.preventDefault();
      showSection(link.getAttribute('href').replace('#',''));
    });
  });

  showSection('swap');

  // buttons
  $('connectBtn').onclick = connectWallet;
  $('swapExecute').onclick = swapMONtoToken;
  $('swapFlip').onclick = ()=>{ $('swapExecute').onclick = swapTokentoMON; };
  $('addLiquidity').onclick = addLiquidity;
  $('removeLiquidity').onclick = removeLiquidity;
});
