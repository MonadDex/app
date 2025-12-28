const CONFIG = {
  chainId: 143,
  chainHex: "0x8f",
  rpc: "https://rpc.monad.xyz",
  factory: "0xd0b770b70bd984B16eDC81537b74a7C11E25d3B6",
  router: "0x974a22EECcbb3965368b8Ecad7C3a1e89ae0bf6E",
  wmon: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A"
};

/* ===== ABI ===== */
const FACTORY_ABI = [
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
  "function getPair(address,address) view returns (address)",
  "function createPair(address,address) returns (address)"
];

const ROUTER_ABI = [
  "function addLiquidityMON(address,uint256,uint256,uint256,address,uint256) payable",
  "function swapExactMONForTokens(uint256,address,address,uint256) payable",
  "function swapExactTokensForMON(uint256,uint256,address,address,uint256)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function approve(address,uint256)",
  "function allowance(address,address) view returns (uint256)"
];

let provider, signer, account, router, factory;
let swapFrom = "MON", swapTo = null, liqToken = null;

const $ = id => document.getElementById(id);

function toast(msg, ok=true){
  const t=$("toast"); t.innerText=msg;
  t.style.background=ok?"#22c55e":"#ef4444";
  t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),3000);
}

async function connectWallet(){
  if(!window.ethereum) return alert("MetaMask required");
  await ethereum.request({method:"eth_requestAccounts"});
  provider=new ethers.BrowserProvider(ethereum);
  signer=await provider.getSigner();
  account=await signer.getAddress();

  const net=await provider.getNetwork();
  if(Number(net.chainId)!==CONFIG.chainId){
    await ethereum.request({
      method:"wallet_addEthereumChain",
      params:[{
        chainId:CONFIG.chainHex,
        chainName:"Monad",
        rpcUrls:[CONFIG.rpc],
        nativeCurrency:{name:"MON",symbol:"MON",decimals:18}
      }]
    });
  }

  router=new ethers.Contract(CONFIG.router,ROUTER_ABI,signer);
  factory=new ethers.Contract(CONFIG.factory,FACTORY_ABI,signer);
  $("connectBtn").innerText=account.slice(0,6)+"..."+account.slice(-4);
  loadPools();
}

function deadline(){
  return Math.floor(Date.now()/1000)+1200;
}

async function resolveToken(v){
  if(v==="MON") return {isNative:true,address:CONFIG.wmon,symbol:"MON"};
  const a=ethers.getAddress(v);
  const c=new ethers.Contract(a,ERC20_ABI,signer);
  return {isNative:false,address:a,symbol:await c.symbol(),erc20:c};
}

async function swap(){
  if(!swapTo) return toast("Select token",false);
  const amt=$("swap_from_amount").value;
  if(!amt) return;

  const from=await resolveToken(swapFrom);
  const to=await resolveToken(swapTo);

  if(from.isNative){
    await router.swapExactMONForTokens(
      0,to.address,account,deadline(),
      {value:ethers.parseEther(amt)}
    );
  }else{
    const v=ethers.parseEther(amt);
    const al=await from.erc20.allowance(account,CONFIG.router);
    if(al<v) await from.erc20.approve(CONFIG.router,ethers.MaxUint256);
    await router.swapExactTokensForMON(
      v,0,from.address,account,deadline()
    );
  }
  toast("Swap success");
}

async function supply(){
  const t=await resolveToken(liqToken);
  const ta=ethers.parseEther($("liq_token_amount").value);
  const ma=ethers.parseEther($("liq_mon_amount").value);
  const al=await t.erc20.allowance(account,CONFIG.router);
  if(al<ta) await t.erc20.approve(CONFIG.router,ethers.MaxUint256);
  await router.addLiquidityMON(
    t.address,ta,0,0,account,deadline(),{value:ma}
  );
  toast("Liquidity added");
}

async function loadPools(){
  const n=await factory.allPairsLength();
  const box=$("pools_list"); box.innerHTML="";
  if(n===0n) return box.innerText="No pools";
  for(let i=0;i<n;i++){
    const p=await factory.allPairs(i);
    const d=document.createElement("div");
    d.innerText=p; box.appendChild(d);
  }
}

/* ===== EVENTS ===== */
$("connectBtn").onclick=connectWallet;
$("switchNetworkBtn").onclick=connectWallet;
$("swap_execute_btn").onclick=swap;
$("liq_supply_btn").onclick=supply;

$("swap_flip_btn").onclick=()=>{
  if(!swapTo) return;
  [swapFrom,swapTo]=[swapTo,swapFrom];
  [$("swap_from_symbol").innerText,$("swap_to_symbol").innerText]=
  [$("swap_to_symbol").innerText,$("swap_from_symbol").innerText];
};

$("picker_from_search").onchange=e=>{
  swapFrom=e.target.value; $("swap_from_symbol").innerText=e.target.value;
};
$("picker_to_search").onchange=e=>{
  swapTo=e.target.value; $("swap_to_symbol").innerText=e.target.value;
};
$("picker_liq_search").onchange=e=>{
  liqToken=e.target.value; $("liq_token_symbol").innerText=e.target.value;
};

$("year").innerText=new Date().getFullYear();
