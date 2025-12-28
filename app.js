/* ======================================================
   MonadDex Frontend – app.js
   ABI EMBEDDED VERSION (NO IMPORTS)
   Network: Monad (ChainId 143)
====================================================== */

/* ================= CONFIG ================= */
const CONFIG = {
  chainId: 143,
  chainHex: "0x8f",
  rpc: "https://rpc.monad.xyz",
  factory: "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6",
  router:  "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E",
  wmon:    "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A"
};

/* ================= ABI ================= */

// ---------- Factory ----------
const FACTORY_ABI = [
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
  "function getPair(address,address) view returns (address)",
  "function createPair(address,address) returns (address)"
];

// ---------- Router ----------
const ROUTER_ABI = [
  "function addLiquidityMON(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)",
  "function removeLiquidityMON(address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
  "function swapExactMONForTokens(uint256,address,address,uint256) payable returns (uint256)",
  "function swapExactTokensForMON(uint256,uint256,address,address,uint256) returns (uint256)"
];

// ---------- ERC20 ----------
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)"
];

/* ================= GLOBALS ================= */
let provider, signer, account;
let router, factory;

let swapFrom = "MON";
let swapTo   = null;
let liqToken = null;

/* ================= HELPERS ================= */
const $ = id => document.getElementById(id);

function toast(msg, ok = true) {
  const t = $("toast");
  t.textContent = msg;
  t.style.background = ok ? "#22c55e" : "#ef4444";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

function deadline() {
  return Math.floor(Date.now() / 1000) + 1200;
}

function isAddress(v) {
  try { return ethers.getAddress(v); }
  catch { return null; }
}

/* ================= WALLET ================= */
async function connectWallet() {
  if (!window.ethereum) return alert("MetaMask not found");

  await ethereum.request({ method: "eth_requestAccounts" });
  provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  account = await signer.getAddress();

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

  router  = new ethers.Contract(CONFIG.router,  ROUTER_ABI,  signer);
  factory = new ethers.Contract(CONFIG.factory, FACTORY_ABI, signer);

  $("connectBtn").textContent =
    account.slice(0, 6) + "..." + account.slice(-4);

  toast("Wallet connected");
  loadPools();
}

/* ================= TOKEN RESOLVE ================= */
async function resolveToken(input) {
  if (input === "MON") {
    return { address: CONFIG.wmon, symbol: "MON", isNative: true };
  }

  const addr = isAddress(input);
  if (!addr) throw "Invalid token";

  const erc20 = new ethers.Contract(addr, ERC20_ABI, signer);
  return {
    address: addr,
    symbol: await erc20.symbol(),
    erc20,
    isNative: false
  };
}

/* ================= SWAP ================= */
async function swap() {
  try {
    const amount = $("swap_from_amount").value;
    if (!amount) return;

    const from = await resolveToken(swapFrom);
    const to   = await resolveToken(swapTo);

    if (from.isNative) {
      await router.swapExactMONForTokens(
        0,
        to.address,
        account,
        deadline(),
        { value: ethers.parseEther(amount) }
      );
    } else {
      const value = ethers.parseEther(amount);
      const allowance = await from.erc20.allowance(account, CONFIG.router);
      if (allowance < value) {
        await from.erc20.approve(CONFIG.router, ethers.MaxUint256);
      }

      await router.swapExactTokensForMON(
        value,
        0,
        from.address,
        account,
        deadline()
      );
    }

    toast("Swap successful");
  } catch (e) {
    toast(e.message || e, false);
  }
}

/* ================= LIQUIDITY ================= */
async function supplyLiquidity() {
  try {
    const token = await resolveToken(liqToken);
    const monAmt = $("liq_mon_amount").value;
    const tokAmt = $("liq_token_amount").value;

    const tokenValue = ethers.parseEther(tokAmt);
    const monValue   = ethers.parseEther(monAmt);

    const allowance = await token.erc20.allowance(account, CONFIG.router);
    if (allowance < tokenValue) {
      await token.erc20.approve(CONFIG.router, ethers.MaxUint256);
    }

    await router.addLiquidityMON(
      token.address,
      tokenValue,
      0,
      0,
      account,
      deadline(),
      { value: monValue }
    );

    toast("Liquidity added");
  } catch (e) {
    toast(e.message || e, false);
  }
}

/* ================= POOLS ================= */
async function loadPools() {
  const box = $("pools_list");
  box.innerHTML = "";

  const len = await factory.allPairsLength();
  if (len === 0n) {
    box.innerHTML = "<div class='muted'>No pools found</div>";
    return;
  }

  for (let i = 0; i < len; i++) {
    const pair = await factory.allPairs(i);
    const div = document.createElement("div");
    div.className = "subcard";
    div.innerHTML = `<div class="muted">${pair}</div>`;
    box.appendChild(div);
  }
}

/* ================= PICKERS ================= */
async function pickToken(value, type) {
  try {
    const t = await resolveToken(value);
    if (type === "from") {
      swapFrom = value;
      $("swap_from_symbol").textContent = t.symbol;
    }
    if (type === "to") {
      swapTo = value;
      $("swap_to_symbol").textContent = t.symbol;
    }
    if (type === "liq") {
      liqToken = value;
      $("liq_token_symbol").textContent = t.symbol;
    }
  } catch {
    toast("Invalid token", false);
  }
}

/* ================= EVENTS ================= */
$("connectBtn").onclick = connectWallet;
$("swap_execute_btn").onclick = swap;
$("liq_supply_btn").onclick = supplyLiquidity;

$("picker_from_search").onchange = e => pickToken(e.target.value, "from");
$("picker_to_search").onchange   = e => pickToken(e.target.value, "to");
$("picker_liq_search").onchange  = e => pickToken(e.target.value, "liq");

document.querySelectorAll(".picker-close").forEach(b => {
  b.onclick = () => document.querySelector(b.dataset.close).classList.add("hide");
});

$("swap_from_token_btn").onclick = () => $("picker_from").classList.remove("hide");
$("swap_to_token_btn").onclick   = () => $("picker_to").classList.remove("hide");
$("liq_token_btn").onclick       = () => $("picker_liq").classList.remove("hide");

/* ================= INIT ================= */
$("year").textContent = new Date().getFullYear();
