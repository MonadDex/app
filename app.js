/* =========================================================
   MonadDex – app.js
   Chain: Monad (chainId 143)
   ========================================================= */

(() => {
  "use strict";

  /* =========================
     Network & Contracts
  ========================== */

  const CHAIN_ID = 143;
  const CHAIN_NAME = "Monad";
  const RPC_URL = "https://rpc.monad.xyz";

  // === IMPORTANT: replace by YOUR deployed addresses ===
  const FACTORY_ADDRESS = "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6";
  const ROUTER_ADDRESS = "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E";
  const WMON_ADDRESS = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";

  /* =========================
     ABIs (embedded)
  ========================== */

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
    "function getReserves() view returns (uint112,uint112,uint32)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)"
  ];

  const ROUTER_ABI = [
    "function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)",
    "function removeLiquidityETH(address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
    "function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])",
    "function swapExactTokensForETH(uint256,uint256,address[],address,uint256) returns (uint256[])",
    "function getAmountsOut(uint256,address[]) view returns (uint256[])"
  ];

  /* =========================
     Globals
  ========================== */

  let provider, signer, account;
  let factory, router;

  let currentToken = null; // {address,name,symbol,decimals}
  let swapDirection = "MON_TO_TOKEN"; // or TOKEN_TO_MON
  let slippage = 1; // %

  /* =========================
     Helpers
  ========================== */

  const $ = (id) => document.getElementById(id);

  function shortAddr(addr) {
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  function toWei(v) {
    return ethers.utils.parseEther(v || "0");
  }

  function fromWei(v) {
    return ethers.utils.formatEther(v || 0);
  }

  function setStatus(msg, ok = true) {
    $("statusBox").hidden = false;
    $("statusTitle").textContent = ok ? "OK" : "Error";
    $("statusMsg").textContent = msg;
  }

  function clearStatus() {
    $("statusBox").hidden = true;
  }

  /* =========================
     Init
  ========================== */

  async function init() {
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
    router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

    $("walletPill").hidden = false;
    $("btnConnect").hidden = true;
    $("walletAddressShort").textContent = shortAddr(account);

    loadSavedTokens();
    bindUI();
    refreshBalances();
  }

  /* =========================
     Tokens (localStorage)
  ========================== */

  function getSavedTokens() {
    return JSON.parse(localStorage.getItem("monaddex_tokens") || "[]");
  }

  function saveTokens(tokens) {
    localStorage.setItem("monaddex_tokens", JSON.stringify(tokens));
  }

  function loadSavedTokens() {
    const tokens = getSavedTokens();
    const selects = [$("swapTokenSelect"), $("liqTokenSelect")];
    selects.forEach((sel) => {
      sel.innerHTML = "";
      tokens.forEach((t) => {
        const o = document.createElement("option");
        o.value = t.address;
        o.textContent = `${t.symbol} (${shortAddr(t.address)})`;
        sel.appendChild(o);
      });
    });
    if (tokens.length > 0) {
      currentToken = tokens[0];
      $("swapOutChip").textContent = currentToken.symbol;
    }
  }

  /* =========================
     Add Token Modal
  ========================== */

  async function loadTokenPreview() {
    const addr = $("tokenAddressInput").value;
    const c = new ethers.Contract(addr, ERC20_ABI, provider);
    const [name, symbol, decimals] = await Promise.all([
      c.name(),
      c.symbol(),
      c.decimals()
    ]);

    $("prevName").textContent = name;
    $("prevSymbol").textContent = symbol;
    $("prevDecimals").textContent = decimals;
    $("tokenPreview").hidden = false;
    $("btnSaveToken").disabled = false;

    currentToken = { address: addr, name, symbol, decimals };
  }

  function saveToken() {
    const tokens = getSavedTokens();
    if (!tokens.find((t) => t.address === currentToken.address)) {
      tokens.push(currentToken);
      saveTokens(tokens);
    }
    loadSavedTokens();
    $("tokenModal").hidden = true;
  }

  /* =========================
     Swap
  ========================== */

  async function quoteSwap() {
    if (!currentToken) return;
    const amtIn = $("swapAmountIn").value;
    if (!amtIn || Number(amtIn) <= 0) return;

    const path =
      swapDirection === "MON_TO_TOKEN"
        ? [WMON_ADDRESS, currentToken.address]
        : [currentToken.address, WMON_ADDRESS];

    const amounts = await router.getAmountsOut(
      toWei(amtIn),
      path
    );

    const out = fromWei(amounts[1]);
    $("swapAmountOut").value = out;
  }

  async function executeSwap() {
    const amtIn = $("swapAmountIn").value;
    if (!amtIn || Number(amtIn) <= 0) return;

    const deadline =
      Math.floor(Date.now() / 1000) +
      Number($("swapDeadlineMins").value || 20) * 60;

    if (swapDirection === "MON_TO_TOKEN") {
      const path = [WMON_ADDRESS, currentToken.address];
      await router.swapExactETHForTokens(
        0,
        path,
        account,
        deadline,
        { value: toWei(amtIn) }
      );
    } else {
      const token = new ethers.Contract(
        currentToken.address,
        ERC20_ABI,
        signer
      );
      const allowance = await token.allowance(account, ROUTER_ADDRESS);
      if (allowance.lt(toWei(amtIn))) {
        await token.approve(
          ROUTER_ADDRESS,
          ethers.constants.MaxUint256
        );
      }
      const path = [currentToken.address, WMON_ADDRESS];
      await router.swapExactTokensForETH(
        toWei(amtIn),
        0,
        path,
        account,
        deadline
      );
    }
    setStatus("Swap submitted");
  }

  /* =========================
     Liquidity
  ========================== */

  async function addLiquidity() {
    const tokenAmt = $("liqTokenAmount").value;
    const monAmt = $("liqMonAmount").value;
    if (!tokenAmt || !monAmt) return;

    const token = new ethers.Contract(
      currentToken.address,
      ERC20_ABI,
      signer
    );

    const allowance = await token.allowance(account, ROUTER_ADDRESS);
    if (allowance.lt(toWei(tokenAmt))) {
      await token.approve(
        ROUTER_ADDRESS,
        ethers.constants.MaxUint256
      );
    }

    const deadline =
      Math.floor(Date.now() / 1000) +
      Number($("liqDeadlineMins").value || 20) * 60;

    await router.addLiquidityETH(
      currentToken.address,
      toWei(tokenAmt),
      0,
      0,
      account,
      deadline,
      { value: toWei(monAmt) }
    );

    setStatus("Liquidity added");
  }

  async function removeLiquidity() {
    const lpAmt = $("removeLpAmount").value;
    if (!lpAmt) return;

    const pairAddr = await factory.getPair(
      currentToken.address,
      WMON_ADDRESS
    );
    const pair = new ethers.Contract(pairAddr, PAIR_ABI, signer);

    const allowance = await pair.allowance(account, ROUTER_ADDRESS);
    if (allowance.lt(toWei(lpAmt))) {
      await pair.approve(
        ROUTER_ADDRESS,
        ethers.constants.MaxUint256
      );
    }

    const deadline =
      Math.floor(Date.now() / 1000) +
      Number($("liqDeadlineMins").value || 20) * 60;

    await router.removeLiquidityETH(
      currentToken.address,
      toWei(lpAmt),
      0,
      0,
      account,
      deadline
    );

    setStatus("Liquidity removed");
  }

  /* =========================
     Pools
  ========================== */

  async function loadPools() {
    const len = await factory.allPairsLength();
    $("poolsList").innerHTML = "";
    for (let i = 0; i < len; i++) {
      const pairAddr = await factory.allPairs(i);
      const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);
      const [t0, t1] = await Promise.all([
        pair.token0(),
        pair.token1()
      ]);
      const row = document.createElement("div");
      row.className = "table__row";
      row.innerHTML = `
        <div>${shortAddr(t0)} / ${shortAddr(t1)}</div>
        <div class="mono">${shortAddr(pairAddr)}</div>
        <div>—</div>
        <div>
          <button class="btn btn--sm">Use</button>
        </div>
      `;
      $("poolsList").appendChild(row);
    }
  }

  /* =========================
     Balances
  ========================== */

  async function refreshBalances() {
    const bal = await provider.getBalance(account);
    $("balMon").textContent = fromWei(bal);
  }

  /* =========================
     UI Bindings
  ========================== */

  function bindUI() {
    $("btnConnect").onclick = init;

    $("btnAddTokenModal").onclick = () =>
      ($("tokenModal").hidden = false);
    $("btnCloseTokenModal").onclick = () =>
      ($("tokenModal").hidden = true);

    $("btnLoadToken").onclick = loadTokenPreview;
    $("btnSaveToken").onclick = saveToken;

    $("btnSwapQuote").onclick = quoteSwap;
    $("btnSwap").onclick = executeSwap;

    $("btnAddLiquidity").onclick = addLiquidity;
    $("btnRemoveLiquidity").onclick = removeLiquidity;

    $("btnPoolsRefresh").onclick = loadPools;

    $("btnSwapFlip").onclick = () => {
      swapDirection =
        swapDirection === "MON_TO_TOKEN"
          ? "TOKEN_TO_MON"
          : "MON_TO_TOKEN";
      $("swapDirectionHint").textContent =
        swapDirection === "MON_TO_TOKEN"
          ? "MON → TOKEN"
          : "TOKEN → MON";
    };

    $("swapTokenSelect").onchange = (e) => {
      const addr = e.target.value;
      const tokens = getSavedTokens();
      currentToken = tokens.find((t) => t.address === addr);
      $("swapOutChip").textContent = currentToken.symbol;
    };

    $("liqTokenSelect").onchange = (e) => {
      const addr = e.target.value;
      const tokens = getSavedTokens();
      currentToken = tokens.find((t) => t.address === addr);
    };
  }

})();
