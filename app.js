/* =====================================================
   MonadDex - app.js
   Correct AMM flow:
   Load Token → Check Pool → Create Pool → Add Liquidity
   ethers.js v5.7.2
===================================================== */

"use strict";

/* ================= CONFIG ================= */

const CHAIN_ID = 143;
const RPC_URL = "https://rpc.monad.xyz";

const FACTORY_ADDRESS = "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6";
const ROUTER_ADDRESS  = "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E";
const WMON_ADDRESS    = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";

/* ================= ABIs ================= */

const FACTORY_ABI = [
  "function getPair(address,address) view returns (address)",
  "function allPairsLength() view returns (uint)",
  "function allPairs(uint) view returns (address)"
];

const ROUTER_ABI = [
  "function createPool(address token) returns (address)",
  "function addLiquidityMON(address token,uint amountTokenDesired,uint amountTokenMin,uint amountMONMin,address to,uint deadline) payable",
  "function swapExactMONForTokens(uint amountOutMin,address tokenOut,address to,uint deadline) payable"
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
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112)"
];

/* ================= GLOBAL ================= */

let provider, signer, account;
let factory, router;

let tokenAddress = null;
let tokenContract = null;
let tokenInfo = null;
let pairAddress = null;

/* ================= HELPERS ================= */

const $ = id => document.getElementById(id);

const short = a => a ? a.slice(0,6) + "..." + a.slice(-4) : "-";

function setStatus(id, msg, type) {
  const el = $(id);
  if (!el) return;
  el.className = "status";
  if (type) el.classList.add(type);
  el.textContent = msg;
}

/* ================= PROVIDERS ================= */

function initReadProvider() {
  provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
}

function initWriteProvider() {
  const web3 = new ethers.providers.Web3Provider(window.ethereum);
  signer = web3.getSigner();
  router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
}

/* ================= WALLET ================= */

async function connectWallet() {
  if (!window.ethereum) return alert("Wallet not found");

  const cid = await ethereum.request({ method: "eth_chainId" });
  if (parseInt(cid,16) !== CHAIN_ID) {
    return alert("Please switch to Monad network");
  }

  initWriteProvider();
  const accs = await ethereum.request({ method: "eth_requestAccounts" });
  account = accs[0];

  $("walletChip").textContent = "Wallet: " + short(account);
}

/* ================= NAV ================= */

function initNav() {
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.onclick = () => {
      document.querySelectorAll(".nav-btn").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      b.classList.add("active");
      $(b.dataset.view).classList.add("active");
    };
  });
}

/* ================= LOAD TOKEN ================= */

async function loadToken() {
  try {
    setStatus("tokenInfo","",null);
    setStatus("poolStatus","",null);

    const addr = $("liqTokenAddress").value.trim();
    if (!ethers.utils.isAddress(addr)) throw "Invalid token address";

    tokenAddress = addr;
    tokenContract = new ethers.Contract(addr, ERC20_ABI, provider);

    const [name,symbol,decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals()
    ]);

    tokenInfo = { name, symbol, decimals };

    setStatus(
      "tokenInfo",
      `Token loaded: ${symbol} (decimals ${decimals})`,
      "success"
    );

    await checkPool();

  } catch(e) {
    setStatus("tokenInfo", e.toString(), "error");
  }
}

/* ================= CHECK / CREATE POOL ================= */

async function checkPool() {
  pairAddress = await factory.getPair(tokenAddress, WMON_ADDRESS);

  if (pairAddress === ethers.constants.AddressZero) {
    setStatus("poolStatus","Pool not created yet","error");
    $("btnCreatePool").style.display = "block";
  } else {
    setStatus("poolStatus","Pool exists: " + short(pairAddress),"success");
    $("btnCreatePool").style.display = "none";
  }
}

async function createPool() {
  try {
    initWriteProvider();
    setStatus("poolStatus","Creating pool...","");

    const tx = await router.createPool(tokenAddress);
    await tx.wait();

    await checkPool();

  } catch(e) {
    setStatus("poolStatus", e.toString(), "error");
  }
}

/* ================= ADD LIQUIDITY ================= */

async function addLiquidity() {
  try {
    if (!tokenInfo) throw "Load token first";
    if (pairAddress === ethers.constants.AddressZero) {
      throw "Create pool first";
    }

    const tokenAmt = $("liqTokenAmount").value.trim();
    const monAmt   = $("liqMonAmount").value.trim();
    if (!tokenAmt || !monAmt) throw "Missing amount";

    initWriteProvider();

    const amtToken = ethers.utils.parseUnits(tokenAmt, tokenInfo.decimals);
    const amtMON   = ethers.utils.parseEther(monAmt);

    const allowance = await tokenContract.allowance(account, ROUTER_ADDRESS);
    if (allowance.lt(amtToken)) {
      const txA = await tokenContract.connect(signer)
        .approve(ROUTER_ADDRESS, ethers.constants.MaxUint256);
      await txA.wait();
    }

    setStatus("liqStatus","Adding liquidity...","");

    const tx = await router.addLiquidityMON(
      tokenAddress,
      amtToken,
      0,
      0,
      account,
      Math.floor(Date.now()/1000)+1200,
      { value: amtMON }
    );

    setStatus("liqStatus","Tx sent: " + tx.hash,"");
    await tx.wait();
    setStatus("liqStatus","Liquidity added successfully","success");

  } catch(e) {
    setStatus("liqStatus", e.toString(), "error");
  }
}

/* ================= SWAP ================= */

async function doSwap() {
  try {
    const addr = $("swapTokenAddress").value.trim();
    const monIn = $("swapMonIn").value.trim();
    if (!addr || !monIn) throw "Missing input";

    const pair = await factory.getPair(addr, WMON_ADDRESS);
    if (pair === ethers.constants.AddressZero) {
      throw "Pool not exist";
    }

    initWriteProvider();

    const tx = await router.swapExactMONForTokens(
      0,
      addr,
      account,
      Math.floor(Date.now()/1000)+1200,
      { value: ethers.utils.parseEther(monIn) }
    );

    setStatus("swapStatus","Tx sent: "+tx.hash,"");
    await tx.wait();
    setStatus("swapStatus","Swap success","success");

  } catch(e) {
    setStatus("swapStatus", e.toString(), "error");
  }
}

/* ================= POOLS ================= */

async function loadPools() {
  const list = $("poolsList");
  list.innerHTML = "";

  const len = await factory.allPairsLength();
  for (let i=0;i<len;i++) {
    const p = await factory.allPairs(i);
    const pair = new ethers.Contract(p, PAIR_ABI, provider);
    const [r0,r1] = await pair.getReserves();

    const div = document.createElement("div");
    div.className = "pool-item";
    div.innerHTML = `
      <div class="pool-item-title">${short(p)}</div>
      <div class="pool-item-sub">Reserve0: ${ethers.utils.formatEther(r0)}</div>
      <div class="pool-item-sub">Reserve1: ${ethers.utils.formatEther(r1)}</div>
    `;
    list.appendChild(div);
  }
}

/* ================= INIT ================= */

function init() {
  initReadProvider();
  initNav();

  $("networkChip").textContent = "Network: Monad";

  $("btnConnect").onclick = connectWallet;
  $("btnLoadToken").onclick = loadToken;
  $("btnCreatePool").onclick = createPool;
  $("btnAddLiquidity").onclick = addLiquidity;
  $("btnSwap").onclick = doSwap;

  document.querySelector('[data-view="poolsView"]').onclick = loadPools;
}

document.addEventListener("DOMContentLoaded", init);
