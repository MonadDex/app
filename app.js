/* =====================================================
   MonadDex app.js
   - Single page (no URL change)
   - Swap / Liquidity / Pools
   - MON ↔ Token (like VicDex)
===================================================== */

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
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)"
  ];

  const FACTORY_ABI = [
    "function getPair(address,address) view returns (address)",
    "function allPairsLength() view returns (uint256)",
    "function allPairs(uint256) view returns (address)"
  ];

  const PAIR_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112,uint112,uint32)"
  ];

  const ROUTER_ABI = [
    "function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable",
    "function removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
    "function swapExactETHForTokens(uint256,address[],address,uint256) payable",
    "function swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
    "function getAmountsOut(uint256,address[]) view returns (uint256[])"
  ];

  /* ========= GLOBAL ========= */

  let provider, signer, account;
  let factory, router;

  let checkedToken = null; // { address, symbol, decimals }
  let poolTokens = [];    // tokens that HAVE pool

  /* ========= HELPERS ========= */

  const $ = (id) => document.getElementById(id);
  const toWei = (v) => ethers.utils.parseEther(v || "0");
  const fromWei = (v) => ethers.utils.formatEther(v || 0);
  const short = (a) => a.slice(0, 6) + "..." + a.slice(-4);

  function showView(name) {
    $("viewSwap").hidden = name !== "swap";
    $("viewLiquidity").hidden = name !== "liq";
    $("viewPools").hidden = name !== "pools";

    $("tabSwap").classList.toggle("is-active", name === "swap");
    $("tabLiquidity").classList.toggle("is-active", name === "liq");
    $("tabPools").classList.toggle("is-active", name === "pools");
  }

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

    await loadPools(); // preload pools for Swap
  }

  /* ========= LIQUIDITY ========= */

  async function checkToken() {
    const addr = $("liqTokenAddress").value.trim();
    if (!ethers.utils.isAddress(addr)) {
      $("liqTokenInfo").innerText = "Invalid address";
      checkedToken = null;
      return;
    }

    try {
      const token = new ethers.Contract(addr, ERC20_ABI, provider);
      const symbol = await token.symbol();
      const decimals = await token.decimals();

      checkedToken = { address: addr, symbol, decimals };
      $("liqTokenInfo").innerText = `Token: ${symbol} (decimals ${decimals})`;
    } catch (e) {
      $("liqTokenInfo").innerText = "Not a valid ERC20 token";
      checkedToken = null;
    }
  }

  async function addLiquidity() {
    if (!checkedToken) {
      alert("Check token first");
      return;
    }

    const tokenAmt = $("liqTokenAmount").value;
    const monAmt   = $("liqMonAmount").value;
    if (!tokenAmt || !monAmt) {
      alert("Missing amount");
      return;
    }

    const token = new ethers.Contract(
      checkedToken.address,
      ERC20_ABI,
      signer
    );

    const allowance = await token.allowance(account, ROUTER_ADDRESS);
    if (allowance.lt(toWei(tokenAmt))) {
      await token.approve(ROUTER_ADDRESS, ethers.constants.MaxUint256);
    }

    const deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.addLiquidityETH(
      checkedToken.address,
      toWei(tokenAmt),
      0,
      0,
      account,
      deadline,
      { value: toWei(monAmt) }
    );

    $("liqStatus").innerText = "Liquidity added";
    await loadPools();
  }

  async function removeLiquidity() {
    if (!checkedToken) {
      alert("Check token first");
      return;
    }

    const lpAmt = $("liqLpAmount").value;
    if (!lpAmt) {
      alert("Missing LP amount");
      return;
    }

    const pairAddr = await factory.getPair(
      checkedToken.address,
      WMON_ADDRESS
    );

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
      checkedToken.address,
      toWei(lpAmt),
      0,
      0,
      account,
      deadline
    );

    $("liqStatus").innerText = "Liquidity removed";
    await loadPools();
  }

  /* ========= POOLS ========= */

  async function loadPools() {
    poolTokens = [];
    $("swapTokenSelect").innerHTML =
      `<option value="">Select token</option>`;
    $("poolsList").innerHTML = "";

    const len = await factory.allPairsLength();
    for (let i = 0; i < len; i++) {
      const pairAddr = await factory.allPairs(i);
      const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);

      const [t0, t1] = await Promise.all([
        pair.token0(),
        pair.token1()
      ]);

      let tokenAddr =
        t0.toLowerCase() === WMON_ADDRESS.toLowerCase() ? t1 :
        t1.toLowerCase() === WMON_ADDRESS.toLowerCase() ? t0 :
        null;

      if (!tokenAddr) continue;

      const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
      const symbol = await token.symbol();

      poolTokens.push({ address: tokenAddr, symbol });

      // Swap dropdown
      const opt = document.createElement("option");
      opt.value = tokenAddr;
      opt.textContent = symbol;
      $("swapTokenSelect").appendChild(opt);

      // Pools view
      const div = document.createElement("div");
      div.className = "pool-row";
      div.innerText = `${symbol} / MON  →  ${short(pairAddr)}`;
      $("poolsList").appendChild(div);
    }
  }

  /* ========= SWAP ========= */

  async function swap() {
    const tokenAddr = $("swapTokenSelect").value;
    const monAmt = $("swapFromAmount").value;
    if (!tokenAddr || !monAmt) {
      alert("Missing input");
      return;
    }

    const path = [WMON_ADDRESS, tokenAddr];
    const deadline = Math.floor(Date.now() / 1000) + 1200;

    await router.swapExactETHForTokens(
      0,
      path,
      account,
      deadline,
      { value: toWei(monAmt) }
    );

    $("swapStatus").innerText = "Swap submitted";
  }

  /* ========= BIND ========= */

  function bind() {
    $("btnConnect").onclick = connectWallet;

    $("tabSwap").onclick = () => showView("swap");
    $("tabLiquidity").onclick = () => showView("liq");
    $("tabPools").onclick = () => showView("pools");

    $("btnCheckToken").onclick = checkToken;
    $("btnAddLiquidity").onclick = addLiquidity;
    $("btnRemoveLiquidity").onclick = removeLiquidity;

    $("btnLoadPools").onclick = loadPools;
    $("btnSwap").onclick = swap;
  }

  bind();
})();
