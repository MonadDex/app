/* ======================================================
   MonadDex – SIMPLE app.js
   Chain: Monad (143)
====================================================== */

(() => {
  "use strict";

  /* ========= CONFIG ========= */

  const CHAIN_ID = 143;

  const FACTORY_ADDRESS = "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6";
  const ROUTER_ADDRESS  = "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E";
  const WMON_ADDRESS    = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";

  /* ========= ABI ========= */

  const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint)",
    "function allowance(address,address) view returns (uint)",
    "function approve(address,uint) returns (bool)"
  ];

  const FACTORY_ABI = [
    "function getPair(address,address) view returns (address)",
    "function allPairsLength() view returns (uint)",
    "function allPairs(uint) view returns (address)"
  ];

  const PAIR_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)"
  ];

  const ROUTER_ABI = [
    "function addLiquidityETH(address,uint,uint,uint,address,uint) payable",
    "function removeLiquidityETH(address,uint,uint,uint,address,uint)",
    "function swapExactETHForTokens(uint,address[],address,uint) payable",
    "function getAmountsOut(uint,address[]) view returns (uint[])"
  ];

  /* ========= GLOBAL ========= */

  let provider, signer, account;
  let factory, router;

  /* ========= HELPERS ========= */

  const $ = (id) => document.getElementById(id);
  const toWei = (v) => ethers.utils.parseEther(v || "0");
  const fromWei = (v) => ethers.utils.formatEther(v || 0);
  const short = (a) => a.slice(0, 6) + "..." + a.slice(-4);

  /* ========= CONNECT ========= */

  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask not found");
      return;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    account = await signer.getAddress();

    const net = await provider.getNetwork();
    if (net.chainId !== CHAIN_ID) {
      alert("Please switch to Monad network");
      return;
    }

    factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
    router  = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

    $("btnConnect").style.display = "none";
    $("walletPill").hidden = false;
    $("walletAddressShort").innerText = short(account);
  }

  /* ========= NAV ========= */

  function show(tab) {
    $("viewSwap").hidden = tab !== "swap";
    $("viewLiquidity").hidden = tab !== "liq";
    $("viewPools").hidden = tab !== "pools";

    $("tabSwap").classList.toggle("is-active", tab === "swap");
    $("tabLiquidity").classList.toggle("is-active", tab === "liq");
    $("tabPools").classList.toggle("is-active", tab === "pools");
  }

  /* ========= SWAP ========= */

  async function swap() {
    const tokenAddr = $("swapTokenAddress").value;
    const monAmt = $("swapMonAmount").value;
    if (!tokenAddr || !monAmt) return alert("Missing input");

    const path = [WMON_ADDRESS, tokenAddr];
    const deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.swapExactETHForTokens(
      0,
      path,
      account,
      deadline,
      { value: toWei(monAmt) }
    );

    alert("Swap submitted");
  }

  /* ========= LIQUIDITY ========= */

  async function addLiquidity() {
    const tokenAddr = $("liqTokenAddress").value;
    const tokenAmt = $("liqTokenAmount").value;
    const monAmt   = $("liqMonAmount").value;
    if (!tokenAddr || !tokenAmt || !monAmt) return alert("Missing input");

    const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
    const allowance = await token.allowance(account, ROUTER_ADDRESS);

    if (allowance.lt(toWei(tokenAmt))) {
      await token.approve(ROUTER_ADDRESS, ethers.constants.MaxUint256);
    }

    const deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      tokenAddr,
      toWei(tokenAmt),
      0,
      0,
      account,
      deadline,
      { value: toWei(monAmt) }
    );

    alert("Liquidity added");
  }

  async function removeLiquidity() {
    const tokenAddr = $("liqTokenAddress").value;
    const lpAmt = $("removeLpAmount").value;
    if (!tokenAddr || !lpAmt) return alert("Missing input");

    const pairAddr = await factory.getPair(tokenAddr, WMON_ADDRESS);
    if (pairAddr === ethers.constants.AddressZero) {
      alert("Pool not found");
      return;
    }

    const pair = new ethers.Contract(pairAddr, ERC20_ABI, signer);
    const allowance = await pair.allowance(account, ROUTER_ADDRESS);

    if (allowance.lt(toWei(lpAmt))) {
      await pair.approve(ROUTER_ADDRESS, ethers.constants.MaxUint256);
    }

    const deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.removeLiquidityETH(
      tokenAddr,
      toWei(lpAmt),
      0,
      0,
      account,
      deadline
    );

    alert("Liquidity removed");
  }

  /* ========= POOLS ========= */

  async function loadPools() {
    $("poolsList").innerHTML = "";

    const len = await factory.allPairsLength();
    for (let i = 0; i < len; i++) {
      const pairAddr = await factory.allPairs(i);
      const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
      const t0 = await pair.token0();
      const t1 = await pair.token1();

      const div = document.createElement("div");
      div.className = "pool-row";
      div.innerText = `${short(t0)} / ${short(t1)}  →  ${short(pairAddr)}`;
      $("poolsList").appendChild(div);
    }
  }

  /* ========= BIND ========= */

  function bind() {
    $("btnConnect").onclick = connectWallet;

    $("tabSwap").onclick = () => show("swap");
    $("tabLiquidity").onclick = () => show("liq");
    $("tabPools").onclick = () => show("pools");

    $("btnSwap").onclick = swap;
    $("btnAddLiquidity").onclick = addLiquidity;
    $("btnRemoveLiquidity").onclick = removeLiquidity;
    $("btnLoadPools").onclick = loadPools;
  }

  bind();

})();
