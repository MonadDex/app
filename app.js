/* =====================================================
   MonadDex - app.js
   Simple • Professional • Permissionless
   ethers.js v5.7.2
===================================================== */

"use strict";

/* =========================
   CONFIG
========================= */

const CHAIN_ID = 143;
const RPC_URL = "https://rpc.monad.xyz";

const FACTORY_ADDRESS = "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6";
const ROUTER_ADDRESS  = "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E";
const WMON_ADDRESS    = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";

/* =========================
   ABIs (minimal)
========================= */

const FACTORY_ABI = [
  "function allPairsLength() view returns (uint)",
  "function allPairs(uint) view returns (address)",
  "function getPair(address,address) view returns (address)"
];

const ROUTER_ABI = [
  "function createPool(address token) returns (address)",
  "function addLiquidityMON(address token,uint amountTokenDesired,uint amountTokenMin,uint amountMONMin,address to,uint deadline) payable returns (uint,uint,uint)",
  "function swapExactMONForTokens(uint amountOutMin,address tokenOut,address to,uint deadline) payable returns (uint)",
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint)",
  "function allowance(address,address) view returns (uint)",
  "function approve(address,uint) returns (bool)"
];

const PAIR_ABI = [
  "function getReserves() view returns (uint112,uint112)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

/* =========================
   GLOBAL STATE
========================= */

let provider, signer, account;
let factory, router;

let currentToken = null;
let currentTokenInfo = null;
let currentPair = null;

/* =========================
   DOM HELPERS
========================= */

const $ = id => document.getElementById(id);

function shortAddr(a) {
  return a ? a.slice(0,6) + "..." + a.slice(-4) : "-";
}

function setStatus(id, msg, type) {
  const el = $(id);
  if (!el) return;
  el.className = "status";
  if (type) el.classList.add(type);
  el.textContent = msg;
}

/* =========================
   INIT PROVIDER
========================= */

function initReadProvider() {
  provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  factory  = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
}

function initWriteProvider() {
  const web3 = new ethers.providers.Web3Provider(window.ethereum);
  signer = web3.getSigner();
  router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
}

/* =========================
   WALLET
========================= */

async function connectWallet() {
  if (!window.ethereum) {
    alert("Wallet not found");
    return;
  }

  const chainId = await ethereum.request({ method: "eth_chainId" });
  if (parseInt(chainId,16) !== CHAIN_ID) {
    alert("Please switch to Monad network");
    return;
  }

  initWriteProvider();
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  account = accounts[0];

  $("walletChip").textContent = "Wallet: " + shortAddr(account);
}

/* =========================
   NAVIGATION
========================= */

function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      btn.classList.add("active");
      $(btn.dataset.view).classList.add("active");
    };
  });
}

/* =========================
   TOKEN LOAD
========================= */

async function loadToken(addr) {
  if (!ethers.utils.isAddress(addr)) throw "Invalid token address";

  const token = new ethers.Contract(addr, ERC20_ABI, provider);
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals()
  ]);

  currentToken = addr;
  currentTokenInfo = { name, symbol, decimals };

  return token;
}

/* =========================
   SWAP
========================= */

async function doSwap() {
  try {
    setStatus("swapStatus","",null);

    const tokenAddr = $("swapTokenAddress").value.trim();
    const monIn = $("swapMonIn").value.trim();
    if (!tokenAddr || !monIn) throw "Missing input";

    await loadToken(tokenAddr);

    const pair = await factory.getPair(tokenAddr, WMON_ADDRESS);
    if (pair === ethers.constants.AddressZero) {
      setStatus("swapStatus","Pool not exist. Create liquidity first.","error");
      return;
    }

    const amountIn = ethers.utils.parseEther(monIn);

    setStatus("swapStatus","Swapping...","");

    const tx = await router.swapExactMONForTokens(
      0,
      tokenAddr,
      account,
      Math.floor(Date.now()/1000)+1200,
      { value: amountIn }
    );

    setStatus("swapStatus","Tx sent: "+tx.hash,"");
    await tx.wait();
    setStatus("swapStatus","Swap success","success");

  } catch(e) {
    setStatus("swapStatus", e.toString(),"error");
  }
}

/* =========================
   ADD LIQUIDITY
========================= */

async function addLiquidity() {
  try {
    setStatus("liqStatus","",null);

    const tokenAddr = $("liqTokenAddress").value.trim();
    const tokenAmt = $("liqTokenAmount").value.trim();
    const monAmt = $("liqMonAmount").value.trim();

    if (!tokenAddr || !tokenAmt || !monAmt) throw "Missing input";

    const token = await loadToken(tokenAddr);
    initWriteProvider();

    const amountToken = ethers.utils.parseUnits(tokenAmt, currentTokenInfo.decimals);
    const amountMON   = ethers.utils.parseEther(monAmt);

    const allowance = await token.allowance(account, ROUTER_ADDRESS);
    if (allowance.lt(amountToken)) {
      const txA = await token.connect(signer).approve(ROUTER_ADDRESS, ethers.constants.MaxUint256);
      await txA.wait();
    }

    setStatus("liqStatus","Adding liquidity...","");

    const tx = await router.addLiquidityMON(
      tokenAddr,
      amountToken,
      0,
      0,
      account,
      Math.floor(Date.now()/1000)+1200,
      { value: amountMON }
    );

    setStatus("liqStatus","Tx sent: "+tx.hash,"");
    await tx.wait();
    setStatus("liqStatus","Liquidity added","success");

  } catch(e) {
    setStatus("liqStatus", e.toString(),"error");
  }
}

/* =========================
   POOLS
========================= */

async function loadPools() {
  const list = $("poolsList");
  list.innerHTML = "";

  const len = await factory.allPairsLength();
  for (let i=0;i<len;i++) {
    const pairAddr = await factory.allPairs(i);
    const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);

    const [r0,r1] = await pair.getReserves();
    const t0 = await pair.token0();
    const t1 = await pair.token1();

    const div = document.createElement("div");
    div.className = "pool-item";
    div.innerHTML = `
      <div class="pool-item-title">${shortAddr(t0)} / ${shortAddr(t1)}</div>
      <div class="pool-item-sub">Reserve0: ${ethers.utils.formatEther(r0)}</div>
      <div class="pool-item-sub">Reserve1: ${ethers.utils.formatEther(r1)}</div>
      <div class="pool-item-sub">Pair: ${shortAddr(pairAddr)}</div>
    `;
    list.appendChild(div);
  }
}

/* =========================
   INIT
========================= */

async function init() {
  initReadProvider();
  initNavigation();

  $("btnConnect").onclick = connectWallet;
  $("btnSwap").onclick = doSwap;
  $("btnAddLiquidity").onclick = addLiquidity;

  document.querySelector('[data-view="poolsView"]').onclick = async () => {
    await loadPools();
  };

  $("networkChip").textContent = "Network: Monad";
}

document.addEventListener("DOMContentLoaded", init);
