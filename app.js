/* =====================================================
   MonadDex — Minimal & Immutable DEX UI
   -----------------------------------------------------
   - Network: Monad
   - WMON:      0x1F3B7cB59dfd7e1a077467aC8D40b47C03b78caa
   - MonadDex:  0x484A263656eFbB60261bB248e354Ac0473039cDf
   -----------------------------------------------------
   No owners · No admin · No upgrades
   Do not trust — Verify.
   ===================================================== */

const WMON_ADDRESS = "0x1F3B7cB59dfd7e1a077467aC8D40b47C03b78caa";
const DEX_ADDRESS  = "0x484A263656eFbB60261bB248e354Ac0473039cDf";

/* ========= ABI (rút gọn, chỉ phần cần dùng) ========= */

const WMON_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address user) view returns (uint256)"
];

const DEX_ABI = [
  "function tokenA() view returns (address)",
  "function tokenB() view returns (address)",
  "function reserveA() view returns (uint256)",
  "function reserveB() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function shares(address user) view returns (uint256)",
  "function addLiquidity(uint256 amountA, uint256 amountB)",
  "function removeLiquidity(uint256 shareAmount)",
  "function swapAforB(uint256 amountAIn)",
  "function swapBforA(uint256 amountBIn)"
];

/* ========= GLOBAL ========= */

let provider, signer, user;
let wmon, dex;
let tokenA, tokenB;

/* ========= DOM ========= */

const connectBtn = document.getElementById("connectWalletBtn");

const reserveAEl = document.getElementById("reserveA");
const reserveBEl = document.getElementById("reserveB");
const totalSharesEl = document.getElementById("totalShares");
const userSharesEl = document.getElementById("userShares");

const swapAmountIn = document.getElementById("swapAmountIn");
const swapAmountOut = document.getElementById("swapAmountOut");
const swapFromToken = document.getElementById("swapFromToken");
const swapBtn = document.getElementById("swapBtn");

const liqA = document.getElementById("liqAmountA");
const liqB = document.getElementById("liqAmountB");
const addLiqBtn = document.getElementById("addLiquidityBtn");
const removeLiqBtn = document.getElementById("removeLiquidityBtn");

/* ========= CONNECT WALLET ========= */

connectBtn.onclick = async () => {
  if (!window.ethereum) {
    alert("No wallet detected");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  user = await signer.getAddress();

  wmon = new ethers.Contract(WMON_ADDRESS, WMON_ABI, signer);
  dex  = new ethers.Contract(DEX_ADDRESS,  DEX_ABI,  signer);

  tokenA = await dex.tokenA();
  tokenB = await dex.tokenB();

  connectBtn.innerText = user.slice(0,6) + "..." + user.slice(-4);

  await refreshPool();
};

/* ========= READ POOL ========= */

async function refreshPool() {
  if (!dex) return;

  const rA = await dex.reserveA();
  const rB = await dex.reserveB();
  const ts = await dex.totalShares();

  reserveAEl.innerText = ethers.utils.formatEther(rA);
  reserveBEl.innerText = ethers.utils.formatEther(rB);
  totalSharesEl.innerText = ethers.utils.formatEther(ts);

  if (user) {
    const us = await dex.shares(user);
    userSharesEl.innerText = ethers.utils.formatEther(us);
  }
}

/* ========= HELPERS ========= */

async function ensureApproval(tokenAddress, spender, amount) {
  const token = new ethers.Contract(
    tokenAddress,
    ["function allowance(address,address) view returns(uint256)",
     "function approve(address,uint256) returns(bool)"],
    signer
  );

  const allowance = await token.allowance(user, spender);
  if (allowance.lt(amount)) {
    const tx = await token.approve(spender, ethers.constants.MaxUint256);
    await tx.wait();
  }
}

/* ========= SWAP ========= */

swapBtn.onclick = async () => {
  if (!dex) return;

  const amount = ethers.utils.parseEther(swapAmountIn.value || "0");
  if (amount.isZero()) return;

  if (swapFromToken.value === "A") {
    await ensureApproval(tokenA, DEX_ADDRESS, amount);
    const tx = await dex.swapAforB(amount);
    await tx.wait();
  } else {
    await ensureApproval(tokenB, DEX_ADDRESS, amount);
    const tx = await dex.swapBforA(amount);
    await tx.wait();
  }

  swapAmountIn.value = "";
  await refreshPool();
};

/* ========= ADD LIQUIDITY ========= */

addLiqBtn.onclick = async () => {
  if (!dex) return;

  const amountA = ethers.utils.parseEther(liqA.value || "0");
  const amountB = ethers.utils.parseEther(liqB.value || "0");

  if (amountA.isZero() || amountB.isZero()) return;

  await ensureApproval(tokenA, DEX_ADDRESS, amountA);
  await ensureApproval(tokenB, DEX_ADDRESS, amountB);

  const tx = await dex.addLiquidity(amountA, amountB);
  await tx.wait();

  liqA.value = "";
  liqB.value = "";

  await refreshPool();
};

/* ========= REMOVE LIQUIDITY ========= */

removeLiqBtn.onclick = async () => {
  if (!dex) return;

  const userShares = await dex.shares(user);
  if (userShares.isZero()) {
    alert("No liquidity");
    return;
  }

  const tx = await dex.removeLiquidity(userShares);
  await tx.wait();

  await refreshPool();
};
