/* =====================================================
   MonadDex dApp – Screen Based App.js
   Network: Monad (ChainId 143)
   ===================================================== */

/* ========== CONFIG ========== */
const CONFIG = {
  chainId: 143,
  chainHex: "0x8f",
  rpc: "https://rpc.monad.xyz",
  factory: "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6",
  router:  "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E",
  wmon:    "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A"
};

/* ========== ABI (EMBEDDED) ========== */
const FACTORY_ABI = [
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
  "function getPair(address,address) view returns (address)",
  "function createPair(address,address) returns (address)"
];

const ROUTER_ABI = [
  "function addLiquidityMON(address,uint256,uint256,uint256,address,uint256) payable",
  "function removeLiquidityMON(address,uint256,uint256,uint256,address,uint256)",
  "function swapExactMONForTokens(uint256,address,address,uint256) payable",
  "function swapExactTokensForMON(uint256,uint256,address,address,uint256)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function approve(address,uint256)",
  "function allowance(address,address) view returns (uint256)"
];

/* ========== GLOBALS ========== */
let provider, signer, account;
let router, factory;

let swapFrom = "MON";
let swapTo   = null;
let liqToken = null;

/* ========== HELPERS ========== */
const $ = id => document.getElementById(id);

function toast(msg, ok = true) {
  const t = $("toast");
  t.innerText = msg;
  t.style.background = ok ? "#22c55e" : "#ef4444";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

function deadline() {
  return Math.floor(Date.now() / 1000) + 1200;
}

/* ========== SCREEN CONTROL (CORE) ========== */
function showScreen(name) {
  ["swap", "liquidity", "pools"].forEach(s => {
    $("screen-" + s).classList.toggle("active", s === name);
    $("menu" + s.charAt(0).toUpperCase() + s.slice(1))
      .classList.toggle("active", s === name);
  });
}

/* ========== MENU EVENTS ========== */
$("menuSwap").onclick      = () => showScreen("swap");
$("menuLiquidity").onclick = () => showScreen("liquidity");
$("menuPools").onclick     = () => {
  showScreen("pools");
  loadPools();
};

/* ========== WALLET ========== */
async function connectWallet() {
  if (!window.ethereum) return alert("MetaMask required");

  await ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer   = await provider.getSigner();
  account  = await signer.getAddress();

  const net = await provider.getNetwork();
  if (Number(net.chainId) !== CONFIG.chainId) {
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CONFIG.chainHex,
        chainName: "Monad",
        rpcUrls: [CONFIG.rpc],
        nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }
      }]
    });
  }

  router  = new ethers.Contract(CONFIG.router, ROUTER_ABI, signer);
  factory = new ethers.Contract(CONFIG.factory, FACTORY_ABI, signer);

  $("connectBtn").innerText =
    account.slice(0, 6) + "..." + account.slice(-4);

  toast("Wallet connected");
}

/* ========== TOKEN RESOLVE ========== */
async function resolveToken(input) {
  if (input === "MON") {
    return { isNative: true, address: CONFIG.wmon, symbol: "MON" };
  }

  const addr = ethers.getAddress(input);
  const erc20 = new ethers.Contract(addr, ERC20_ABI, signer);
  return {
    isNative: false,
    address: addr,
    symbol: await erc20.symbol(),
    erc20
  };
}

/* ========== SWAP ========== */
async function swap() {
  if (!swapTo) return toast("Select token", false);
  const amt = $("swap_from_amount").value;
  if (!amt) return;

  const from = await resolveToken(swapFrom);
  const to   = await resolveToken(swapTo);

  if (from.isNative) {
    await router.swapExactMONForTokens(
      0,
      to.address,
      account,
      deadline(),
      { value: ethers.parseEther(amt) }
    );
  } else {
    const v = ethers.parseEther(amt);
    const al = await from.erc20.allowance(account, CONFIG.router);
    if (al < v) await from.erc20.approve(CONFIG.router, ethers.MaxUint256);

    await router.swapExactTokensForMON(
      v,
      0,
      from.address,
      account,
      deadline()
    );
  }

  toast("Swap successful");
}

/* ========== LIQUIDITY ========== */
async function supplyLiquidity() {
  if (!liqToken) return toast("Select token", false);

  const token = await resolveToken(liqToken);
  const tokenAmt = ethers.parseEther($("liq_token_amount").value);
  const monAmt   = ethers.parseEther($("liq_mon_amount").value);

  const al = await token.erc20.allowance(account, CONFIG.router);
  if (al < tokenAmt) {
    await token.erc20.approve(CONFIG.router, ethers.MaxUint256);
  }

  await router.addLiquidityMON(
    token.address,
    tokenAmt,
    0,
    0,
    account,
    deadline(),
    { value: monAmt }
  );

  toast("Liquidity added");
}

/* ========== POOLS ========== */
async function loadPools() {
  const box = $("pools_list");
  box.innerHTML = "";

  const len = await factory.allPairsLength();
  if (len === 0n) {
    box.innerText = "No pools";
    return;
  }

  for (let i = 0; i < len; i++) {
    const pair = await factory.allPairs(i);
    const div = document.createElement("div");
    div.innerText = pair;
    box.appendChild(div);
  }
}

/* ========== PICKERS ========== */
$("swap_from_token_btn").onclick = () =>
  $("picker_from").classList.remove("hidden");
$("swap_to_token_btn").onclick = () =>
  $("picker_to").classList.remove("hidden");
$("liq_token_btn").onclick = () =>
  $("picker_liq").classList.remove("hidden");

$("picker_from_search").onchange = e => {
  swapFrom = e.target.value || "MON";
  $("swap_from_symbol").innerText = swapFrom;
  $("picker_from").classList.add("hidden");
};

$("picker_to_search").onchange = e => {
  swapTo = e.target.value;
  $("swap_to_symbol").innerText = swapTo;
  $("picker_to").classList.add("hidden");
};

$("picker_liq_search").onchange = e => {
  liqToken = e.target.value;
  $("liq_token_symbol").innerText = liqToken;
  $("picker_liq").classList.add("hidden");
};

/* ========== BUTTON EVENTS ========== */
$("connectBtn").onclick = connectWallet;
$("switchNetworkBtn").onclick = connectWallet;
$("swap_execute_btn").onclick = swap;
$("liq_supply_btn").onclick = supplyLiquidity;

$("swap_flip_btn").onclick = () => {
  if (!swapTo) return;
  [swapFrom, swapTo] = [swapTo, swapFrom];
  [$("swap_from_symbol").innerText,
   $("swap_to_symbol").innerText] =
  [$("swap_to_symbol").innerText,
   $("swap_from_symbol").innerText];
};

/* ========== INIT ========== */
$("year").innerText = new Date().getFullYear();
showScreen("swap");
