/* ==========================================================
   MonadDex — app.js
   Style: VicDex
   Pair:  MON ↔ VIN
   ----------------------------------------------------------
   - Native: MON
   - VIN:    0xfB71cbd8CB6f0fb72a9568f11e7E4454309A9cA1
   - WMON:   0x1F3B7cB59dfd7e1a077467aC8D40b47C03b78caa
   - Dex:    0x484A263656eFbB60261bB248e354Ac0473039cDf
   ----------------------------------------------------------
   Immutable · No owners · No admin keys
   Do not trust — Verify.
   ========================================================== */

(() => {
  'use strict';
  const { ethers } = window;

  /* ========== CONFIG ========== */
  const DEX_ADDR  = document.querySelector('meta[name="monaddex-dex-address"]').content;
  const VIN_ADDR  = document.querySelector('meta[name="monaddex-vin-address"]').content;
  const WMON_ADDR = document.querySelector('meta[name="monaddex-wmon-address"]').content;

  /* ========== ABIs (minimal) ========== */
  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function decimals() view returns (uint8)"
  ];

  const WMON_ABI = [
    "function deposit() payable",
    "function withdraw(uint256)",
    "function balanceOf(address) view returns (uint256)"
  ];

  const DEX_ABI = [
    "function reserveA() view returns (uint256)",
    "function reserveB() view returns (uint256)",
    "function shares(address) view returns (uint256)",
    "function totalShares() view returns (uint256)",
    "function addLiquidity(uint256,uint256)",
    "function removeLiquidity(uint256)",
    "function swapAforB(uint256)",
    "function swapBforA(uint256)"
  ];

  /* ========== STATE ========== */
  let provider, signer, user;
  let dex, vin, wmon;
  let vinDecimals = 18;

  /* ========== DOM ========== */
  const $ = id => document.getElementById(id);

  const connectBtn = $('connectBtn');
  const badge      = $('networkBadge');

  const swapFrom   = $('swap_from_amount');
  const swapTo     = $('swap_to_amount');
  const swapQuote  = $('swap_quote_btn');
  const swapExec   = $('swap_execute_btn');
  const swapStat   = $('swap_status');

  const liqMon     = $('liq_mon_amount');
  const liqVin     = $('liq_vin_amount');
  const liqSupply  = $('liq_supply_btn');
  const liqRemove  = $('liq_remove_btn');
  const liqStat    = $('liq_status');

  const poolInfo   = $('pool_info');

  /* ========== HELPERS ========== */
  const fmt = (n, d = 6) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d });
  const toWei = v => ethers.parseEther(String(v || "0"));
  const fromWei = b => Number(ethers.formatEther(b || 0n));

  async function ensureApprove(token, owner, spender, amount) {
    const cur = await token.allowance(owner, spender);
    if (cur < amount) {
      const tx = await token.approve(spender, amount);
      await tx.wait();
    }
  }

  /* ========== CONNECT ========== */
  connectBtn.onclick = async () => {
    if (!window.ethereum) return alert("Wallet not found");

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    user = await signer.getAddress();

    dex  = new ethers.Contract(DEX_ADDR, DEX_ABI, signer);
    vin  = new ethers.Contract(VIN_ADDR, ERC20_ABI, signer);
    wmon = new ethers.Contract(WMON_ADDR, WMON_ABI, signer);

    vinDecimals = await vin.decimals();

    connectBtn.textContent = user.slice(0,6) + "…" + user.slice(-4);
    badge.textContent = "Monad";

    await refreshPool();
  };

  /* ========== POOL INFO ========== */
  async function refreshPool() {
    if (!dex) return;

    const rA = await dex.reserveA(); // WMON
    const rB = await dex.reserveB(); // VIN
    const ts = await dex.totalShares();
    const us = user ? await dex.shares(user) : 0n;

    poolInfo.innerHTML = `
      <div class="pool-row">
        <div><strong>Reserves</strong></div>
        <div class="muted">${fmt(fromWei(rA))} MON / ${fmt(Number(ethers.formatUnits(rB, vinDecimals)))} VIN</div>
        <div class="muted">LP: ${fmt(fromWei(us))} / ${fmt(fromWei(ts))}</div>
      </div>
    `;
  }

  /* ========== QUOTE (simple AMM) ========== */
  swapQuote.onclick = async () => {
    if (!dex) return;

    const amountIn = Number(swapFrom.value || 0);
    if (amountIn <= 0) return;

    const rA = await dex.reserveA();
    const rB = await dex.reserveB();

    const inWithFee = amountIn * 0.997;
    const out = (inWithFee * Number(ethers.formatEther(rB))) /
                (Number(ethers.formatEther(rA)) + inWithFee);

    swapTo.value = fmt(out);
  };

  /* ========== SWAP ========== */
  swapExec.onclick = async () => {
    if (!dex) return;

    const amount = toWei(swapFrom.value);
    if (amount <= 0n) return;

    // wrap MON → WMON
    await (await wmon.deposit({ value: amount })).wait();

    await ensureApprove(wmon, user, DEX_ADDR, amount);
    await (await dex.swapAforB(amount)).wait();

    swapFrom.value = "";
    swapTo.value = "";
    await refreshPool();
  };

  /* ========== ADD LIQUIDITY ========== */
  liqSupply.onclick = async () => {
    if (!dex) return;

    const monAmt = toWei(liqMon.value);
    const vinAmt = ethers.parseUnits(liqVin.value || "0", vinDecimals);
    if (monAmt <= 0n || vinAmt <= 0n) return;

    await (await wmon.deposit({ value: monAmt })).wait();
    await ensureApprove(wmon, user, DEX_ADDR, monAmt);
    await ensureApprove(vin, user, DEX_ADDR, vinAmt);

    await (await dex.addLiquidity(monAmt, vinAmt)).wait();

    liqMon.value = "";
    liqVin.value = "";
    await refreshPool();
  };

  /* ========== REMOVE LIQUIDITY ========== */
  liqRemove.onclick = async () => {
    if (!dex) return;

    const shares = await dex.shares(user);
    if (shares <= 0n) return;

    await (await dex.removeLiquidity(shares)).wait();
    await refreshPool();
  };

})();
