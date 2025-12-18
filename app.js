// ================================
// MonadDex app.js
// ================================

let provider;
let signer;
let userAddress;

// ================================
// CONSTANTS
// ================================
const CHAIN_ID = 143;

const WMON_ADDRESS = "0x1F3B7cB59dfd7e1a077467aC8D40b47C03b78caa";
const FACTORY_ADDRESS = "0x954905B4Bd45877466832A2B8cFDED720fE630DF";
const VIN_ADDRESS = "0xfB71cbd8CB6f0fb72a9568f11e7E4454309A9cA1";

// ================================
// ABIs (MINIMAL)
// ================================
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const FACTORY_ABI = [
  "function getPool(address) view returns (address)"
];

const POOL_ABI = [
  "function WMON() view returns (address)",
  "function TOKEN() view returns (address)",
  "function reserveA() view returns (uint256)",
  "function reserveB() view returns (uint256)",
  "function addLiquidity(uint256,uint256)",
  "function removeLiquidity(uint256)",
  "function swapAForB(uint256,uint256)",
  "function swapBForA(uint256,uint256)"
];

// ================================
// CONNECT WALLET
// ================================
async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found");
    return;
  }

  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);

  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) {
    alert("Please switch to Monad Mainnet (chainId 143)");
    return;
  }

  signer = provider.getSigner();
  userAddress = await signer.getAddress();

  document.getElementById("walletAddress").innerText =
    userAddress.slice(0, 6) + "..." + userAddress.slice(-4);

  await refreshBalances();
  await loadPoolInfo();
}

// ================================
// LOAD BALANCES
// ================================
async function refreshBalances() {
  const monBalance = await provider.getBalance(userAddress);
  document.getElementById("monBalance").innerText =
    ethers.utils.formatEther(monBalance);

  const wmon = new ethers.Contract(WMON_ADDRESS, ERC20_ABI, provider);
  const vin = new ethers.Contract(VIN_ADDRESS, ERC20_ABI, provider);

  const wmonBal = await wmon.balanceOf(userAddress);
  const vinBal = await vin.balanceOf(userAddress);

  document.getElementById("wmonBalance").innerText =
    ethers.utils.formatEther(wmonBal);
  document.getElementById("vinBalance").innerText =
    ethers.utils.formatEther(vinBal);
}

// ================================
// LOAD POOL
// ================================
async function loadPoolInfo() {
  const factory = new ethers.Contract(
    FACTORY_ADDRESS,
    FACTORY_ABI,
    provider
  );

  const poolAddress = await factory.getPool(VIN_ADDRESS);
  if (poolAddress === ethers.constants.AddressZero) {
    document.getElementById("poolStatus").innerText = "Pool not created";
    return;
  }

  window.pool = new ethers.Contract(poolAddress, POOL_ABI, signer);

  const rA = await pool.reserveA();
  const rB = await pool.reserveB();

  document.getElementById("reserveA").innerText =
    ethers.utils.formatEther(rA);
  document.getElementById("reserveB").innerText =
    ethers.utils.formatEther(rB);
}

// ================================
// APPROVE TOKEN
// ================================
async function approveToken(token, spender, amount) {
  const erc20 = new ethers.Contract(token, ERC20_ABI, signer);
  const tx = await erc20.approve(spender, amount);
  await tx.wait();
}

// ================================
// ADD LIQUIDITY
// ================================
async function addLiquidity(vinAmount, wmonAmount) {
  const amountVin = ethers.utils.parseEther(vinAmount);
  const amountWmon = ethers.utils.parseEther(wmonAmount);

  await approveToken(VIN_ADDRESS, pool.address, amountVin);
  await approveToken(WMON_ADDRESS, pool.address, amountWmon);

  const tx = await pool.addLiquidity(amountWmon, amountVin);
  await tx.wait();

  await refreshBalances();
  await loadPoolInfo();
}

// ================================
// SWAP VIN -> MON
// ================================
async function swapVinToMon(amount) {
  const amt = ethers.utils.parseEther(amount);
  await approveToken(VIN_ADDRESS, pool.address, amt);

  const tx = await pool.swapBForA(amt, 0);
  await tx.wait();

  await refreshBalances();
  await loadPoolInfo();
}

// ================================
// SWAP MON -> VIN
// ================================
async function swapMonToVin(amount) {
  const amt = ethers.utils.parseEther(amount);
  await approveToken(WMON_ADDRESS, pool.address, amt);

  const tx = await pool.swapAForB(amt, 0);
  await tx.wait();

  await refreshBalances();
  await loadPoolInfo();
}
