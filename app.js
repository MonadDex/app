/* ======================================================
   MonadDex DApp
   Permissionless DEX on Monad
   Based on VicDex architecture
====================================================== */

(() => {
  /* ===================== CONFIG ===================== */

  const RPC_URL = "https://rpc.monad.xyz";
  const CHAIN_ID = 143;

  const FACTORY_ADDRESS = "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6";
  const ROUTER_ADDRESS  = "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E";
  const WMON_ADDRESS    = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";

  /* ===================== ABI ===================== */

  const FACTORY_ABI = [
    "function getPair(address tokenA, address tokenB) view returns (address)",
    "function allPairsLength() view returns (uint)",
    "function allPairs(uint) view returns (address)"
  ];

  const ROUTER_ABI = [
    "function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) returns (uint amountA,uint amountB,uint liquidity)",
    "function removeLiquidity(address tokenA,address tokenB,uint liquidity,uint amountAMin,uint amountBMin,address to,uint deadline) returns (uint amountA,uint amountB)",
    "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) returns (uint[] memory amounts)",
    "function swapExactETHForTokens(uint amountOutMin,address[] calldata path,address to,uint deadline) payable returns (uint[] memory amounts)",
    "function swapExactTokensForETH(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) returns (uint[] memory amounts)"
  ];

  const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint)",
    "function approve(address spender,uint value) returns (bool)",
    "function allowance(address owner,address spender) view returns (uint)"
  ];

  const PAIR_ABI = [
    "function getReserves() view returns (uint112,uint112)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function balanceOf(address) view returns (uint)"
  ];

  /* ===================== STATE ===================== */

  let provider;
  let signer;
  let user;
  let factory;
  let router;

  /* ===================== HELPERS ===================== */

  const $ = (id) => document.getElementById(id);

  function nowDeadline() {
    return Math.floor(Date.now() / 1000) + 60 * 20;
  }

  function toWei(amount, decimals) {
    return ethers.utils.parseUnits(amount || "0", decimals);
  }

  function fromWei(amount, decimals) {
    return ethers.utils.formatUnits(amount || "0", decimals);
  }

  function sortTokens(a, b) {
    return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  }

  /* ===================== INIT ===================== */

  async function init() {
    provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

    initNav();
    initWallet();
  }

  /* ===================== NAV ===================== */

  function initNav() {
    document.querySelectorAll(".nav-btn").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));

        btn.classList.add("active");
        $("tab-" + btn.dataset.tab).classList.add("active");
      };
    });
  }

  /* ===================== WALLET ===================== */

  async function initWallet() {
    $("connectWalletBtn").onclick = async () => {
      if (!window.ethereum) {
        alert("MetaMask not found");
        return;
      }

      await window.ethereum.request({ method: "eth_requestAccounts" });
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer = provider.getSigner();
      user = await signer.getAddress();

      const network = await provider.getNetwork();
      if (network.chainId !== CHAIN_ID) {
        alert("Please switch to Monad network");
        return;
      }

      factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
      router  = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

      $("connectWalletBtn").innerText =
        user.slice(0, 6) + "..." + user.slice(-4);
    };
  }

  /* ===================== SWAP ===================== */

  $("swapBtn").onclick = async () => {
    alert("Swap logic will be executed based on selected tokens.\n(Implementation ready – token selector next step)");
  };

  /* ===================== LIQUIDITY ===================== */

  $("addLiquidityBtn").onclick = async () => {
    alert("Add liquidity logic will be executed based on selected tokens.\n(Implementation ready – token selector next step)");
  };

  /* ===================== POOLS ===================== */

  async function loadPools() {
    const total = await factory.allPairsLength();
    const list = $("allPoolsList");
    list.innerHTML = "";

    if (total.eq(0)) {
      list.innerHTML = "No pools created yet";
      return;
    }

    for (let i = 0; i < total; i++) {
      const pair = await factory.allPairs(i);
      const div = document.createElement("div");
      div.innerText = pair;
      list.appendChild(div);
    }
  }

  /* ===================== START ===================== */

  document.addEventListener("DOMContentLoaded", init);
})();
