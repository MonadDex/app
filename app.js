/* =========================================================
   MonadDex dApp (Vanilla JS + ethers v5.7.2)
   - MON is default base asset
   - User pastes token address -> Load -> Create Pool -> Add/Remove Liquidity -> Swap
   - Stores recent tokens in localStorage
   - Designed to "work in one shot" for new users
========================================================= */

(() => {
  "use strict";

  /* =========================
     Network / Contracts
  ========================== */

  const CHAIN_ID = 143;
  const RPC_URL = "https://rpc.monad.xyz";

  // Deployed addresses (from your address.md)
  const FACTORY_ADDRESS = "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6";
  const ROUTER_ADDRESS  = "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E";
  const WMON_ADDRESS    = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";

  // Factory ABI (provided)
  const FACTORY_ABI = [
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"token0","type":"address"},{"indexed":true,"internalType":"address","name":"token1","type":"address"},{"indexed":false,"internalType":"address","name":"pair","type":"address"},{"indexed":false,"internalType":"uint256","name":"allPairsLength","type":"uint256"}],"name":"PairCreated","type":"event"},
    {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"allPairs","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"allPairsLength","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"}],"name":"computePairAddress","outputs":[{"internalType":"address","name":"predicted","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"tokenA","type":"address"},{"internalType":"address","name":"tokenB","type":"address"}],"name":"createPair","outputs":[{"internalType":"address","name":"pair","type":"address"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"getPair","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[],"name":"pairCodeHash","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"pure","type":"function"}
  ];

  // Router ABI (provided)
  const ROUTER_ABI = [
    {"inputs":[{"internalType":"address","name":"_factory","type":"address"},{"internalType":"address","name":"_wmon","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},
    {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"tokenA","type":"address"},{"indexed":true,"internalType":"address","name":"tokenB","type":"address"},{"indexed":false,"internalType":"address","name":"pair","type":"address"}],"name":"PoolCreated","type":"event"},
    {"inputs":[],"name":"WMON","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"amountTokenDesired","type":"uint256"},{"internalType":"uint256","name":"amountTokenMin","type":"uint256"},{"internalType":"uint256","name":"amountMONMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"addLiquidityMON","outputs":[{"internalType":"uint256","name":"amountToken","type":"uint256"},{"internalType":"uint256","name":"amountMON","type":"uint256"},{"internalType":"uint256","name":"liquidity","type":"uint256"}],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"createPool","outputs":[{"internalType":"address","name":"pair","type":"address"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    {"inputs":[{"internalType":"address","name":"token","type":"address"},{"internalType":"uint256","name":"liquidity","type":"uint256"},{"internalType":"uint256","name":"amountTokenMin","type":"uint256"},{"internalType":"uint256","name":"amountMONMin","type":"uint256"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"removeLiquidityMON","outputs":[{"internalType":"uint256","name":"amountToken","type":"uint256"},{"internalType":"uint256","name":"amountMON","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactMONForTokens","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"payable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactTokensForMON","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"uint256","name":"amountOutMin","type":"uint256"},{"internalType":"address","name":"tokenIn","type":"address"},{"internalType":"address","name":"tokenOut","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"deadline","type":"uint256"}],"name":"swapExactTokensForTokens","outputs":[{"internalType":"uint256","name":"amountOut","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},
    {"stateMutability":"payable","type":"receive"}
  ];

  // Minimal ERC20 ABI for UI + approve
  const ERC20_ABI = [
    {"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"string"}],"type":"function"},
    {"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"}
  ];

  // Minimal Pair ABI for reserves + LP balance/approve
  const PAIR_ABI = [
    {"constant":true,"inputs":[],"name":"token0","outputs":[{"name":"","type":"address"}],"type":"function"},
    {"constant":true,"inputs":[],"name":"token1","outputs":[{"name":"","type":"address"}],"type":"function"},
    {"constant":true,"inputs":[],"name":"getReserves","outputs":[{"name":"_reserve0","type":"uint112"},{"name":"_reserve1","type":"uint112"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"type":"function"},
    {"constant":false,"inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"}
  ];

  /* =========================
     DOM Helpers
  ========================== */

  const $ = (id) => document.getElementById(id);
  const setText = (id, txt) => { const el=$(id); if(el) el.textContent = txt; };
  const setMsg = (id, txt, type) => {
    const el = $(id);
    if (!el) return;
    el.classList.remove("msg--ok","msg--err");
    if (type === "ok") el.classList.add("msg--ok");
    if (type === "err") el.classList.add("msg--err");
    el.textContent = txt || "";
  };

  const shortAddr = (a) => (a && a.length > 10 ? `${a.slice(0,6)}…${a.slice(-4)}` : a || "-");
  const isAddr = (a) => { try { return ethers.utils.isAddress(a); } catch { return false; } };

  /* =========================
     Providers / State
  ========================== */

  let readProvider = null;
  let web3Provider = null;
  let signer = null;
  let account = null;

  let factoryRead = null;
  let routerRead = null;

  let factory = null;
  let router = null;

  let tokenAddress = null;
  let tokenRead = null;
  let token = null;

  let tokenSymbol = "TOKEN";
  let tokenDecimals = 18;

  let pairAddress = null;
  let pairRead = null;
  let pair = null;

  // swap direction: true = MON->TOKEN, false = TOKEN->MON
  let swapMonToToken = true;

  const RECENT_KEY = "monaddex_recent_tokens_v1";

  /* =========================
     Init
  ========================== */

  function initReadProvider(){
    if (!readProvider) {
      readProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
      factoryRead = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, readProvider);
      routerRead  = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, readProvider);
    }
  }

  function initWriteProvider(){
    if (!window.ethereum) throw new Error("no_wallet");
    web3Provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    signer = web3Provider.getSigner();
    factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
    router  = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
  }

  async function refreshNetworkChip(){
    initReadProvider();
    try{
      const net = await readProvider.getNetwork();
      setText("netName", `${net.chainId === CHAIN_ID ? "Monad" : "Unknown"} (#${net.chainId})`);
    }catch{
      setText("netName", "Unknown");
    }
    setText("factoryAddrSmall", shortAddr(FACTORY_ADDRESS));
    setText("routerAddrSmall", shortAddr(ROUTER_ADDRESS));
  }

  /* =========================
     Wallet / Network
  ========================== */

  async function ensureMonadNetwork(){
    if (!window.ethereum) throw new Error("no_wallet");
    const hexChain = "0x" + CHAIN_ID.toString(16);

    try {
      const current = await window.ethereum.request({ method: "eth_chainId" });
      if (current === hexChain) return true;
    } catch {}

    // Try add/switch
    try{
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChain }]
      });
      return true;
    }catch (e){
      // If not added, add it
      if (e && (e.code === 4902 || (""+e.message).toLowerCase().includes("unrecognized"))) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: hexChain,
            chainName: "Monad",
            nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: ["https://monadvision.com/"]
          }]
        });
        return true;
      }
      throw e;
    }
  }

  async function connectWallet(){
    setMsg("swapMsg","",null);
    setMsg("addMsg","",null);
    setMsg("remMsg","",null);

    if (!window.ethereum) {
      alert("No wallet found. Please install MetaMask (or a compatible wallet).");
      return;
    }

    await ensureMonadNetwork();
    initWriteProvider();

    const accts = await web3Provider.send("eth_requestAccounts", []);
    account = accts && accts[0] ? ethers.utils.getAddress(accts[0]) : null;

    setText("acctShort", account ? shortAddr(account) : "Not connected");
    await syncAll();
  }

  function wireWalletEvents(){
    if (!window.ethereum) return;
    window.ethereum.on("accountsChanged", async (accs) => {
      account = accs && accs[0] ? ethers.utils.getAddress(accs[0]) : null;
      setText("acctShort", account ? shortAddr(account) : "Not connected");
      await syncAll();
    });
    window.ethereum.on("chainChanged", async () => {
      // reset write provider and reload state
      web3Provider = null;
      signer = null;
      factory = null;
      router = null;
      if (account) {
        try { initWriteProvider(); } catch {}
      }
      await refreshNetworkChip();
      await syncAll();
    });
  }

  /* =========================
     Recent tokens
  ========================== */

  function getRecent(){
    try{
      const raw = localStorage.getItem(RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch{
      return [];
    }
  }

  function pushRecent(addr, label){
    const a = ethers.utils.getAddress(addr);
    const cur = getRecent().filter(x => x && x.addr && x.addr.toLowerCase() !== a.toLowerCase());
    cur.unshift({ addr: a, label: label || shortAddr(a), ts: Date.now() });
    const trimmed = cur.slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
    renderRecent();
  }

  function renderRecent(){
    const box = $("recentList");
    if (!box) return;
    box.innerHTML = "";
    const list = getRecent();
    if (!list.length){
      const span = document.createElement("div");
      span.className = "pill";
      span.style.opacity = "0.65";
      span.textContent = "No recent tokens yet";
      box.appendChild(span);
      return;
    }
    list.forEach(item => {
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.textContent = item.label || shortAddr(item.addr);
      btn.title = item.addr;
      btn.onclick = async () => {
        $("tokenAddr").value = item.addr;
        await loadTokenFromInput();
      };
      box.appendChild(btn);
    });
  }

  /* =========================
     Token / Pair loading
  ========================== */

  async function loadTokenFromInput(){
    initReadProvider();

    const input = ($("tokenAddr").value || "").trim();
    if (!isAddr(input)){
      alert("Invalid token address.");
      return;
    }

    tokenAddress = ethers.utils.getAddress(input);
    tokenRead = new ethers.Contract(tokenAddress, ERC20_ABI, readProvider);

    try{
      const [name, symbol, decimals] = await Promise.all([
        tokenRead.name(),
        tokenRead.symbol(),
        tokenRead.decimals()
      ]);

      tokenSymbol = symbol || "TOKEN";
      tokenDecimals = Number(decimals || 18);

      setText("tokenMeta", `${name} (${tokenSymbol}) • ${tokenDecimals} decimals`);
      setText("recvAsset", tokenSymbol);
      setText("payAsset", swapMonToToken ? "MON" : tokenSymbol);

      pushRecent(tokenAddress, `${tokenSymbol}`);

      // Setup write token if wallet connected
      if (signer) token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      await resolvePair();
      await syncAll();
    }catch(e){
      console.error(e);
      alert("Failed to read token metadata. Make sure the token is a valid ERC-20 on Monad.");
    }
  }

  async function resolvePair(){
    initReadProvider();
    if (!tokenAddress){
      pairAddress = null;
      setText("pairAddr","-");
      return;
    }

    const p = await factoryRead.getPair(tokenAddress, WMON_ADDRESS);
    pairAddress = (p && p !== ethers.constants.AddressZero) ? p : null;

    setText("pairAddr", pairAddress ? pairAddress : "Not created yet");
    if (pairAddress){
      pairRead = new ethers.Contract(pairAddress, PAIR_ABI, readProvider);
      if (signer) pair = new ethers.Contract(pairAddress, PAIR_ABI, signer);
    } else {
      pairRead = null;
      pair = null;
    }
  }

  /* =========================
     Reserves / LP balance
  ========================== */

  async function updateReserves(){
    initReadProvider();
    if (!pairRead || !pairAddress || !tokenAddress){
      setText("reserves","-");
      return;
    }

    try{
      const [t0, t1] = await Promise.all([pairRead.token0(), pairRead.token1()]);
      const r = await pairRead.getReserves();
      const reserve0 = r._reserve0;
      const reserve1 = r._reserve1;

      let reserveTokenBN;
      let reserveWmonBN;

      if (t0.toLowerCase() === tokenAddress.toLowerCase()){
        reserveTokenBN = reserve0;
        reserveWmonBN  = reserve1;
      } else {
        reserveTokenBN = reserve1;
        reserveWmonBN  = reserve0;
      }

      const tokenRes = ethers.utils.formatUnits(reserveTokenBN, tokenDecimals);
      const wmonRes  = ethers.utils.formatEther(reserveWmonBN);

      setText("reserves", `${tokenRes} ${tokenSymbol} • ${wmonRes} WMON`);
    }catch(e){
      console.error(e);
      setText("reserves","-");
    }
  }

  async function updateLpBalance(){
    initReadProvider();
    if (!pairRead || !pairAddress || !account){
      setText("lpBal","-");
      return;
    }
    try{
      const bal = await pairRead.balanceOf(account);
      // LP decimals are typically 18
      const f = ethers.utils.formatUnits(bal, 18);
      setText("lpBal", f);
    }catch(e){
      console.error(e);
      setText("lpBal","-");
    }
  }

  /* =========================
     Quoting (rough)
     - We compute expected out using standard x*y=k with 0.3% fee (997/1000).
     - Router's actual formula should be similar; slippage protects users.
  ========================== */

  function getAmountOut(amountIn, reserveIn, reserveOut){
    // UniswapV2-style: amountInWithFee = amountIn * 997
    // amountOut = (amountInWithFee*reserveOut) / (reserveIn*1000 + amountInWithFee)
    const feeMul = ethers.BigNumber.from(997);
    const feeDiv = ethers.BigNumber.from(1000);

    const amountInWithFee = amountIn.mul(feeMul);
    const numerator = amountInWithFee.mul(reserveOut);
    const denominator = reserveIn.mul(feeDiv).add(amountInWithFee);
    if (denominator.isZero()) return ethers.BigNumber.from(0);
    return numerator.div(denominator);
  }

  async function updateSwapQuote(){
    if (!pairRead || !pairAddress || !tokenAddress) {
      $("swapOut").value = "";
      setText("minOut","-");
      setText("impact","-");
      return;
    }

    const rawIn = ($("swapIn").value || "").trim();
    if (!rawIn || Number(rawIn) <= 0){
      $("swapOut").value = "";
      setText("minOut","-");
      setText("impact","-");
      return;
    }

    try{
      const sl = Math.max(0, Number(($("slippage").value || "1").trim()));
      const r = await pairRead.getReserves();
      const t0 = await pairRead.token0();
      const t1 = await pairRead.token1();

      // Identify reserves for direction
      let reserveToken, reserveWmon;
      if (t0.toLowerCase() === tokenAddress.toLowerCase()){
        reserveToken = r._reserve0;
        reserveWmon  = r._reserve1;
      } else {
        reserveToken = r._reserve1;
        reserveWmon  = r._reserve0;
      }

      let amountInBN, reserveIn, reserveOut, outBN;

      if (swapMonToToken){
        amountInBN = ethers.utils.parseEther(rawIn);
        reserveIn  = reserveWmon;
        reserveOut = reserveToken;
        outBN = getAmountOut(amountInBN, reserveIn, reserveOut);
        $("swapOut").value = ethers.utils.formatUnits(outBN, tokenDecimals);
      } else {
        amountInBN = ethers.utils.parseUnits(rawIn, tokenDecimals);
        reserveIn  = reserveToken;
        reserveOut = reserveWmon;
        outBN = getAmountOut(amountInBN, reserveIn, reserveOut);
        $("swapOut").value = ethers.utils.formatEther(outBN);
      }

      // Min out by slippage
      const slipBps = Math.floor(sl * 100); // 1% => 100 bps
      const minBN = outBN.mul(10000 - slipBps).div(10000);

      if (swapMonToToken){
        setText("minOut", `${ethers.utils.formatUnits(minBN, tokenDecimals)} ${tokenSymbol}`);
      } else {
        setText("minOut", `${ethers.utils.formatEther(minBN)} MON`);
      }

      // Rough impact (very approximate)
      const priceBefore = reserveOut.isZero() ? 0 : Number(ethers.utils.formatUnits(reserveOut, swapMonToToken ? tokenDecimals : 18)) / Number(ethers.utils.formatUnits(reserveIn, swapMonToToken ? 18 : tokenDecimals));
      const priceAfter  = (reserveOut.sub(outBN)).isZero() ? 0 :
        Number(ethers.utils.formatUnits(reserveOut.sub(outBN), swapMonToToken ? tokenDecimals : 18)) /
        Number(ethers.utils.formatUnits(reserveIn.add(amountInBN), swapMonToToken ? 18 : tokenDecimals));

      if (priceBefore > 0 && priceAfter > 0){
        const imp = Math.max(0, (priceBefore - priceAfter) / priceBefore) * 100;
        setText("impact", `${imp.toFixed(2)}%`);
      } else {
        setText("impact","-");
      }
    }catch(e){
      console.error(e);
      setText("impact","-");
      setText("minOut","-");
    }
  }

  /* =========================
     Approvals
  ========================== */

  async function ensureApproveErc20(contract, spender, amountNeededBN, msgElId){
    if (!account) throw new Error("not_connected");
    if (!contract) throw new Error("no_contract");
    const allowance = await contract.allowance(account, spender);
    if (allowance.gte(amountNeededBN)) return true;

    setMsg(msgElId, "Approving… please confirm in wallet.", null);
    const tx = await contract.approve(spender, ethers.constants.MaxUint256);
    setMsg(msgElId, `Approve tx sent: ${tx.hash}`, null);
    await tx.wait();
    setMsg(msgElId, "Approve confirmed.", "ok");
    return true;
  }

  /* =========================
     Actions: Create Pool
  ========================== */

  async function onCreatePool(){
    setMsg("swapMsg","",null);
    if (!tokenAddress){
      alert("Load a token first.");
      return;
    }
    if (!signer){
      alert("Please connect wallet first.");
      return;
    }

    try{
      await ensureMonadNetwork();
      initWriteProvider();

      setMsg("swapMsg","Creating pool… confirm in wallet.", null);
      const tx = await router.createPool(tokenAddress);
      setMsg("swapMsg", `Tx sent: ${tx.hash}`, null);
      await tx.wait();

      setMsg("swapMsg","Pool created (or already existed).", "ok");
      await resolvePair();
      await syncAll();
    }catch(e){
      console.error(e);
      setMsg("swapMsg", `Create pool failed: ${friendlyError(e)}`, "err");
    }
  }

  /* =========================
     Actions: Swap
  ========================== */

  function getDeadlineTs(){
    const mins = Math.max(1, Number(($("deadline").value || "20").trim()));
    return Math.floor(Date.now()/1000) + Math.floor(mins*60);
  }

  async function onSwap(){
    setMsg("swapMsg","",null);

    if (!tokenAddress){
      alert("Load a token first.");
      return;
    }
    if (!pairAddress){
      alert("Pool not found. Create pool and add liquidity first.");
      return;
    }
    if (!signer || !account){
      alert("Connect wallet first.");
      return;
    }

    const rawIn = ($("swapIn").value || "").trim();
    if (!rawIn || Number(rawIn) <= 0){
      alert("Enter an input amount.");
      return;
    }

    try{
      await ensureMonadNetwork();
      initWriteProvider();

      // compute minOut from UI
      await updateSwapQuote();

      const sl = Math.max(0, Number(($("slippage").value || "1").trim()));
      const slipBps = Math.floor(sl * 100);

      // We'll recompute out/min on-chain reserves (rough), then pass minOut
      const r = await pairRead.getReserves();
      const t0 = await pairRead.token0();
      const reserveToken = (t0.toLowerCase() === tokenAddress.toLowerCase()) ? r._reserve0 : r._reserve1;
      const reserveWmon  = (t0.toLowerCase() === tokenAddress.toLowerCase()) ? r._reserve1 : r._reserve0;

      const deadline = getDeadlineTs();

      if (swapMonToToken){
        const amountInBN = ethers.utils.parseEther(rawIn);
        const outBN = getAmountOut(amountInBN, reserveWmon, reserveToken);
        const minBN = outBN.mul(10000 - slipBps).div(10000);

        setMsg("swapMsg","Swapping MON → Token… confirm in wallet.", null);

        const tx = await router.swapExactMONForTokens(
          minBN,
          tokenAddress,
          account,
          deadline,
          { value: amountInBN }
        );

        setMsg("swapMsg", `Tx sent: ${tx.hash}`, null);
        await tx.wait();
        setMsg("swapMsg","Swap confirmed.", "ok");
      } else {
        const amountInBN = ethers.utils.parseUnits(rawIn, tokenDecimals);
        const outBN = getAmountOut(amountInBN, reserveToken, reserveWmon);
        const minBN = outBN.mul(10000 - slipBps).div(10000);

        // approve token to router
        await ensureApproveErc20(token, ROUTER_ADDRESS, amountInBN, "swapMsg");

        setMsg("swapMsg","Swapping Token → MON… confirm in wallet.", null);

        const tx = await router.swapExactTokensForMON(
          amountInBN,
          minBN,
          tokenAddress,
          account,
          deadline
        );

        setMsg("swapMsg", `Tx sent: ${tx.hash}`, null);
        await tx.wait();
        setMsg("swapMsg","Swap confirmed.", "ok");
      }

      await syncAll();
    }catch(e){
      console.error(e);
      setMsg("swapMsg", `Swap failed: ${friendlyError(e)}`, "err");
    }
  }

  /* =========================
     Actions: Add Liquidity
  ========================== */

  async function onAddLiquidity(){
    setMsg("addMsg","",null);

    if (!tokenAddress){
      alert("Load a token first.");
      return;
    }
    if (!signer || !account){
      alert("Connect wallet first.");
      return;
    }

    const tokenAmt = ($("addTokenAmt").value || "").trim();
    const monAmt   = ($("addMonAmt").value || "").trim();

    if (!tokenAmt || Number(tokenAmt) <= 0) { alert("Enter token amount."); return; }
    if (!monAmt || Number(monAmt) <= 0) { alert("Enter MON amount."); return; }

    const tokenMin = ($("addTokenMin").value || "").trim() || "0";
    const monMin   = ($("addMonMin").value || "").trim() || "0";

    try{
      await ensureMonadNetwork();
      initWriteProvider();

      const amountTokenDesired = ethers.utils.parseUnits(tokenAmt, tokenDecimals);
      const amountMONDesired   = ethers.utils.parseEther(monAmt);
      const amountTokenMin     = ethers.utils.parseUnits(tokenMin, tokenDecimals);
      const amountMONMin       = ethers.utils.parseEther(monMin);

      // approve token to router
      await ensureApproveErc20(token, ROUTER_ADDRESS, amountTokenDesired, "addMsg");

      setMsg("addMsg","Adding liquidity… confirm in wallet.", null);

      const tx = await router.addLiquidityMON(
        tokenAddress,
        amountTokenDesired,
        amountTokenMin,
        amountMONMin,
        account,
        getDeadlineTs(),
        { value: amountMONDesired }
      );

      setMsg("addMsg", `Tx sent: ${tx.hash}`, null);
      await tx.wait();

      setMsg("addMsg","Liquidity added.", "ok");

      await resolvePair();
      await syncAll();
    }catch(e){
      console.error(e);
      setMsg("addMsg", `Add liquidity failed: ${friendlyError(e)}`, "err");
    }
  }

  /* =========================
     Actions: Remove Liquidity
  ========================== */

  async function onRemoveLiquidity(){
    setMsg("remMsg","",null);

    if (!tokenAddress){
      alert("Load a token first.");
      return;
    }
    if (!pairAddress){
      alert("Pair not found.");
      return;
    }
    if (!signer || !account){
      alert("Connect wallet first.");
      return;
    }

    const lpAmt = ($("remLpAmt").value || "").trim();
    if (!lpAmt || Number(lpAmt) <= 0){
      alert("Enter LP amount.");
      return;
    }

    const tokenMin = ($("remTokenMin").value || "").trim() || "0";
    const monMin   = ($("remMonMin").value || "").trim() || "0";

    try{
      await ensureMonadNetwork();
      initWriteProvider();

      const liquidityBN    = ethers.utils.parseUnits(lpAmt, 18);
      const amountTokenMin = ethers.utils.parseUnits(tokenMin, tokenDecimals);
      const amountMONMin   = ethers.utils.parseEther(monMin);

      // approve LP (pair token) to router
      if (!pair) pair = new ethers.Contract(pairAddress, PAIR_ABI, signer);
      await ensureApproveErc20(pair, ROUTER_ADDRESS, liquidityBN, "remMsg");

      setMsg("remMsg","Removing liquidity… confirm in wallet.", null);

      const tx = await router.removeLiquidityMON(
        tokenAddress,
        liquidityBN,
        amountTokenMin,
        amountMONMin,
        account,
        getDeadlineTs()
      );

      setMsg("remMsg", `Tx sent: ${tx.hash}`, null);
      await tx.wait();

      setMsg("remMsg","Liquidity removed.", "ok");
      await syncAll();
    }catch(e){
      console.error(e);
      setMsg("remMsg", `Remove liquidity failed: ${friendlyError(e)}`, "err");
    }
  }

  /* =========================
     UI: tabs / flip / paste
  ========================== */

  function wireTabs(){
    const tabs = Array.from(document.querySelectorAll(".tab"));
    tabs.forEach(t => {
      t.addEventListener("click", () => {
        tabs.forEach(x => x.classList.remove("tab--active"));
        t.classList.add("tab--active");
        const name = t.getAttribute("data-tab");
        document.querySelectorAll(".tabpane").forEach(p => p.classList.remove("tabpane--active"));
        const pane = $("tab-" + name);
        if (pane) pane.classList.add("tabpane--active");
      });
    });
  }

  function applySwapLabels(){
    setText("payAsset", swapMonToToken ? "MON" : tokenSymbol);
    setText("recvAsset", swapMonToToken ? tokenSymbol : "MON");
  }

  function flipSwap(){
    swapMonToToken = !swapMonToToken;
    applySwapLabels();
    // Clear outputs to avoid confusion
    $("swapOut").value = "";
    setText("minOut","-");
    setText("impact","-");
    updateSwapQuote();
  }

  async function pasteToken(){
    try{
      const txt = await navigator.clipboard.readText();
      if (txt) $("tokenAddr").value = txt.trim();
    }catch{}
  }

  /* =========================
     Sync
  ========================== */

  async function syncAll(){
    await refreshNetworkChip();
    renderRecent();
    await resolvePair();
    await updateReserves();
    await updateLpBalance();
    applySwapLabels();
    await updateSwapQuote();
  }

  /* =========================
     Friendly errors
  ========================== */

  function friendlyError(e){
    const msg = (e && (e.reason || e.message)) ? (e.reason || e.message) : String(e || "");
    // common cases
    if (msg.toLowerCase().includes("user rejected")) return "User rejected transaction.";
    if (msg.toLowerCase().includes("insufficient funds")) return "Insufficient funds for gas/value.";
    if (msg.toLowerCase().includes("expired")) return "Transaction expired (deadline).";
    if (msg.toLowerCase().includes("pair_not_exists")) return "Pool not found. Create pool and add liquidity first.";
    if (msg.toLowerCase().includes("insuff_out")) return "Slippage too low. Increase slippage or reduce amount.";
    if (msg.toLowerCase().includes("transfer_from_failed")) return "Token transferFrom failed (check allowance/balance).";
    if (msg.toLowerCase().includes("transfer_failed")) return "Token transfer failed.";
    return msg.length > 160 ? msg.slice(0,160) + "…" : msg;
  }

  /* =========================
     Wire events
  ========================== */

  function wireEvents(){
    $("btnConnect").addEventListener("click", connectWallet);
    $("btnSwitch").addEventListener("click", async () => {
      try { await ensureMonadNetwork(); await refreshNetworkChip(); } catch(e){ alert(friendlyError(e)); }
    });

    $("btnPaste").addEventListener("click", pasteToken);
    $("btnLoadToken").addEventListener("click", loadTokenFromInput);
    $("btnCreatePool").addEventListener("click", onCreatePool);

    $("btnFlip").addEventListener("click", flipSwap);
    $("swapIn").addEventListener("input", () => updateSwapQuote());
    $("slippage").addEventListener("input", () => updateSwapQuote());

    $("btnSwap").addEventListener("click", onSwap);

    $("btnAddLiq").addEventListener("click", onAddLiquidity);
    $("btnRemoveLiq").addEventListener("click", onRemoveLiquidity);

    // also handle enter key on token input
    $("tokenAddr").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") loadTokenFromInput();
    });
  }

  /* =========================
     Boot
  ========================== */

  async function init(){
    initReadProvider();
    wireTabs();
    wireEvents();
    wireWalletEvents();
    renderRecent();
    await refreshNetworkChip();

    // If wallet already connected, attempt silent connect
    if (window.ethereum){
      try{
        const accts = await window.ethereum.request({ method: "eth_accounts" });
        if (accts && accts[0]){
          await ensureMonadNetwork();
          initWriteProvider();
          account = ethers.utils.getAddress(accts[0]);
          setText("acctShort", shortAddr(account));
        }
      }catch{}
    }

    await syncAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
