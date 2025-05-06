require('dotenv').config();
const { ethers } = require('ethers');

// Konfigurasi jaringan dan token
const config = {
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  chainId: 10143,
  contracts: {
    router: '0xb6091233aAcACbA45225a2B2121BBaC807aF4255',
    tokens: {
      MIST: '0xb38bb873cca844b20A9eE448a87Af3626a6e1EF5',
      YAKI: '0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50',
      CHOG: '0xE0590015A873bF326bd645c3E1266d4db41C4E6B',
      USDC: '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea',
      DAK: '0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714',
      aprMON: '0xb2f82D0f38dc453D596Ad40A37799446Cc89274A',
      WMON: '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701',
      gMON: '0xaEef2f6B429Cb59C9B2D7bB2141ADa993E8571c3',
      shMON: '0x3a98250F98Dd388C211206983453837C8365BDc1',
      WBTC: '0xcf5a6076cfa32686c0Df13aBaDa2b40dec133F1d',
      OCTO: '0xCa9A4F46Faf5628466583486FD5ACE8AC33ce126',
      sMON: '0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5',
      USDT: '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D'
    }
  },
  gasLimit: 300000,
  swapPercentage: { min: 5, max: 10 }, // 5-10% dari balance
  delayBetweenSwaps: { min: 5000, max: 10000 } // 5-10 detik
};

// ABI yang diperlukan
const erc20Abi = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

const routerAbi = [
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

// Fungsi utilitas
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomPair(tokens) {
  const keys = Object.keys(tokens);
  let from, to;
  
  do {
    from = keys[Math.floor(Math.random() * keys.length)];
    to = keys[Math.floor(Math.random() * keys.length)];
  } while (from === to);
  
  return { from, to };
}

async function getCurrentGasPrice(provider) {
  const feeData = await provider.getFeeData();
  return {
    maxFeePerGas: feeData.maxFeePerGas * 150n / 100n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 150n / 100n
  };
}

async function swapTokens(wallet, routerContract, fromToken, toToken, amountIn) {
  const { maxFeePerGas, maxPriorityFeePerGas } = await getCurrentGasPrice(wallet.provider);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  
  // Buat path swap (kadang perlu melalui WMON sebagai intermediate)
  let path = [fromToken, toToken];
  if (Math.random() > 0.5) { // 50% kemungkinan menggunakan WMON sebagai perantara
    path = [fromToken, config.contracts.tokens.WMON, toToken];
  }

  console.log(`Swap path: ${path.map(addr => Object.keys(config.contracts.tokens).find(key => config.contracts.tokens[key] === addr) || addr)}`);

  const tx = await routerContract.swapExactTokensForTokens(
    amountIn,
    0, // amountOutMin - bisa disesuaikan
    path,
    wallet.address,
    deadline,
    {
      gasLimit: config.gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas
    }
  );

  return tx;
}

async function main() {
  // Setup provider dan wallet
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log(`Bot berjalan dengan alamat: ${wallet.address}`);
  console.log(`Mode: Unlimited looping dengan random pairs`);
  console.log(`Swap percentage: ${config.swapPercentage.min}-${config.swapPercentage.max}% dari balance`);
  console.log(`Delay antara swap: ${config.delayBetweenSwaps.min/1000}-${config.delayBetweenSwaps.max/1000} detik\n`);

  // Inisialisasi kontrak
  const routerContract = new ethers.Contract(config.contracts.router, routerAbi, wallet);
  const tokenContracts = {};
  
  for (const [symbol, address] of Object.entries(config.contracts.tokens)) {
    tokenContracts[symbol] = new ethers.Contract(address, erc20Abi, wallet);
  }

  // Approve semua token ke router
  console.log('Mengapprove semua token ke router...');
  for (const [symbol, contract] of Object.entries(tokenContracts)) {
    try {
      const maxAmount = ethers.MaxUint256;
      const approveTx = await contract.approve(config.contracts.router, maxAmount);
      await approveTx.wait();
      console.log(`Approved ${symbol}`);
    } catch (err) {
      console.error(`Gagal approve ${symbol}:`, err.message);
    }
  }
  console.log('Semua token telah diapprove\n');

  // Mulai infinite loop
  let swapCount = 0;
  while (true) {
    try {
      swapCount++;
      console.log(`\n=== Swap ke-${swapCount} ===`);
      
      // Pilih pair secara random
      const { from, to } = getRandomPair(config.contracts.tokens);
      console.log(`Memilih pair: ${from} -> ${to}`);
      
      // Dapatkan balance token
      const fromContract = tokenContracts[from];
      const decimals = await fromContract.decimals();
      const balance = await fromContract.balanceOf(wallet.address);
      
      // Hitung amount untuk swap (5-10% dari balance)
      const percentage = getRandomInt(config.swapPercentage.min, config.swapPercentage.max);
      const amountIn = balance * BigInt(percentage) / 100n;
      
      console.log(`Balance ${from}: ${ethers.formatUnits(balance, decimals)}`);
      console.log(`Akan swap ${percentage}% = ${ethers.formatUnits(amountIn, decimals)} ${from}`);
      
      if (amountIn <= 0) {
        console.log(`Balance ${from} terlalu kecil, mencari pair lain...`);
        continue;
      }
      
      // Lakukan swap
      const swapTx = await swapTokens(
        wallet,
        routerContract,
        config.contracts.tokens[from],
        config.contracts.tokens[to],
        amountIn
      );
      
      const receipt = await swapTx.wait();
      console.log(`Swap berhasil! Tx hash: ${receipt.hash}`);
      console.log(`Lihat di explorer: https://testnet.monadexplorer.com/tx/${receipt.hash}`);
      
    } catch (error) {
      console.error('Error dalam proses swap:', error.message);
    }
    
    // Delay random sebelum swap berikutnya
    const delay = getRandomInt(config.delayBetweenSwaps.min, config.delayBetweenSwaps.max);
    console.log(`Menunggu ${delay/1000} detik sebelum swap berikutnya...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

main().catch(console.error);