require('dotenv').config();
const { ethers } = require('ethers');
const shuffle = require('lodash/shuffle');
const chalk = require('chalk');
const figlet = require('figlet');

console.log(
  chalk.magentaBright(
    figlet.textSync('BOT AMBIENT MADE BY JAWA', {
      font: 'ANSI Shadow',
      horizontalLayout: 'default',
      verticalLayout: 'default',
    })
  )
);

// ======================= CONFIGURATION =======================
const CONFIG = {
    RPC_URL: 'https://testnet-rpc.monad.xyz/',
    CHAIN_ID: 10143,
    SWAP_CONTRACT: '0x88B96aF200c8a9c35442C8AC6cd3D22695AaE4F0',
    POOL_ID: 36000,
    MIN_MON_BALANCE: 0.01, // Minimum MON balance required to swap
    TOKENS: {
        TED: { address: '0x4C632c40C2DcD39C20ee7eCDd6F9743a3c7FFE6B', decimals: 18 },
        USDC: { address: '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea', decimals: 6 },
        USDT: { address: '0x88b8E2161DEDC77EF4ab7585569D2415a1C1055D', decimals: 6 },
        WETH: { address: '0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37', decimals: 18 },
        WBTC: { address: '0xcf5a6076cfa32686c0Df13aBaDa2b40dec133F1d', decimals: 8 },
        YAKI: { address: '0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50', decimals: 18 },
        CHOG: { address: '0xE0590015A873bF326bd645c3E1266d4db41C4E6B', decimals: 18 },
        mamaBTC: { address: '0x3B428Df09c3508D884C30266Ac1577f099313CF6', decimals: 18 },
        WSOL: { address: '0x5387C85A4965769f6B0Df430638a1388493486F1', decimals: 18 },
        NOM: { address: '0x43e52CBC0073Caa7c0cf6e64b576CE2D6FB14eB8', decimals: 18 },
        BEAN: { address: '0x268E4E24E0051EC27b3D27A95977E71cE6875a05', decimals: 18 },
        DAK: { address: '0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714', decimals: 18 }
    },
    SWAP_PAIRS: [
        ['TED', 'USDC'], ['USDC', 'TED'],
        ['USDT', 'USDC'], ['USDC', 'USDT'],
        ['WETH', 'USDC'], ['WBTC', 'USDC'],
        ['YAKI', 'USDC'], ['TED', 'USDT'],
        ['CHOG', 'USDC'], ['mamaBTC', 'USDC'],
        ['WSOL', 'USDC'], ['NOM', 'USDC'],
        ['BEAN', 'USDC'], ['DAK', 'USDC']
    ]
};

// ======================= HELPER FUNCTIONS =======================
function getRandomDelay(min = 5000, max = 10000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getProvider() {
    return new ethers.JsonRpcProvider(CONFIG.RPC_URL, CONFIG.CHAIN_ID);
}

async function getNativeBalance(wallet) {
    const balance = await wallet.provider.getBalance(wallet.address);
    return parseFloat(ethers.formatEther(balance));
}

async function getTokenBalance(wallet, tokenAddress, decimals) {
    const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        wallet
    );
    const balance = await tokenContract.balanceOf(wallet.address);
    return balance;
}

async function getGasParams(provider) {
    const feeData = await provider.getFeeData();
    return {
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 2n,
        maxFeePerGas: feeData.maxFeePerGas * 2n,
        gasLimit: 300000
    };
}

// ======================= WALLET INITIALIZATION =======================
const WALLETS = Object.entries(process.env)
    .filter(([key]) => key.startsWith('WALLET_'))
    .map(([, privateKey]) => new ethers.Wallet(privateKey, getProvider()));

// ======================= CORE FUNCTIONS =======================
async function checkAndApprove(wallet, tokenAddress, symbol, spender) {
    const tokenContract = new ethers.Contract(
        tokenAddress,
        [
            'function allowance(address, address) view returns (uint256)',
            'function approve(address, uint256) returns (bool)'
        ],
        wallet
    );

    try {
        const allowance = await tokenContract.allowance(wallet.address, spender);
        if (allowance === 0n) {
            console.log(chalk.yellow(`⚠️ Approving ${symbol} for ${wallet.address.slice(0, 6)}...`));
            const gasParams = await getGasParams(wallet.provider);
            const tx = await tokenContract.approve(spender, ethers.MaxUint256, gasParams);
            await tx.wait();
            console.log(chalk.green(`✓ ${symbol} approved`));
        }
    } catch (error) {
        console.log(chalk.red(`✗ ${symbol} approval failed: ${error.shortMessage || error.message}`));
        throw error;
    }
}

async function checkWalletBalances(wallet) {
    console.log(chalk.magenta(`\n🔹 Wallet: ${wallet.address}`));
    
    const monBalance = await getNativeBalance(wallet);
    console.log(chalk.blue(`💰 MON Balance: ${monBalance.toFixed(6)} MON`));
    
    if (monBalance < CONFIG.MIN_MON_BALANCE) {
        console.log(chalk.red(`✗ Insufficient MON balance (min ${CONFIG.MIN_MON_BALANCE} MON required)`));
        return false;
    }

    let hasTokenBalance = false;
    for (const [symbol, token] of Object.entries(CONFIG.TOKENS)) {
        try {
            const balance = await getTokenBalance(wallet, token.address, token.decimals);
            const formattedBalance = ethers.formatUnits(balance, token.decimals);
            
            if (balance > 0n) {
                console.log(chalk.green(`✓ ${symbol}: ${formattedBalance}`));
                hasTokenBalance = true;
            } else {
                console.log(chalk.gray(`- ${symbol}: 0 (skipping)`));
            }
        } catch (error) {
            console.log(chalk.red(`✗ ${symbol} balance check failed: ${error.message}`));
        }
    }
    
    return hasTokenBalance;
}

async function executeSwap(wallet, tokenInSymbol, tokenOutSymbol) {
    const tokenIn = CONFIG.TOKENS[tokenInSymbol];
    const tokenOut = CONFIG.TOKENS[tokenOutSymbol];
    
    // Get initial balances
    const initialMonBalance = await getNativeBalance(wallet);
    const tokenInBalance = await getTokenBalance(wallet, tokenIn.address, tokenIn.decimals);
    
    if (tokenInBalance <= 0n) {
        throw new Error(`Insufficient ${tokenInSymbol} balance`);
    }

    // Calculate swap amount (5-10% of balance)
    const swapPercent = 5 + Math.random() * 5;
    const swapAmount = (tokenInBalance * BigInt(Math.floor(swapPercent * 10))) / 1000n;
    
    // Format amounts for display
    const formattedAmount = ethers.formatUnits(swapAmount, tokenIn.decimals);
    const formattedBalance = ethers.formatUnits(tokenInBalance, tokenIn.decimals);
    
    console.log(chalk.magenta(`\n🔹 Wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`));
    console.log(chalk.cyan(`🔄 Swapping ${formattedAmount} ${tokenInSymbol} (of ${formattedBalance}) → ${tokenOutSymbol}`));

    // Prepare swap command
    const MAX_UINT128 = (2n ** 128n) - 1n;
    const cmd = ethers.AbiCoder.defaultAbiCoder().encode(
        [
            'address', 'address', 'uint256', 'bool', 'bool', 
            'uint128', 'uint16', 'uint128', 'uint128', 'uint8'
        ],
        [
            tokenIn.address,
            tokenOut.address,
            CONFIG.POOL_ID,
            true,
            true,
            swapAmount,
            0,
            MAX_UINT128,
            1,
            0
        ]
    );

    // Execute swap
    const swapContract = new ethers.Contract(
        CONFIG.SWAP_CONTRACT,
        ['function userCmd(uint16 callpath, bytes cmd)'],
        wallet
    );

    const gasParams = await getGasParams(wallet.provider);
    
    try {
        const tx = await swapContract.userCmd(1, cmd, gasParams);
        console.log(chalk.yellow(`⛽ Tx submitted: ${tx.hash}`));
        
        const receipt = await tx.wait();
        if (receipt.status !== 1) {
            throw new Error('Transaction reverted');
        }

        // Calculate gas used
        const remainingMonBalance = await getNativeBalance(wallet);
        const feeUsed = (initialMonBalance - remainingMonBalance).toFixed(6);

        console.log(chalk.green(`✅ Swap successful!`));
        console.log(chalk.yellow(`⛽ Gas used: ${receipt.gasUsed.toString()} | Fee: ~${feeUsed} MON`));
        console.log(chalk.blue(`💰 Remaining MON: ${remainingMonBalance.toFixed(6)}`));
        console.log(`📜 Explorer: https://testnet.monadexplorer.com/tx/${tx.hash}`);

        return {
            txHash: tx.hash,
            amountIn: formattedAmount,
            tokenIn: tokenInSymbol,
            tokenOut: tokenOutSymbol,
            gasUsed: receipt.gasUsed.toString(),
            feeUsed: feeUsed,
            remainingMonBalance: remainingMonBalance
        };
    } catch (error) {
        console.log(chalk.red(`✗ Swap failed: ${error.reason || error.message}`));
        throw error;
    }
}

async function executeSwapsForWallet(wallet) {
    console.log(chalk.magenta(`\n🔄 Starting swaps for ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`));
    
    // Check balances first
    const hasBalance = await checkWalletBalances(wallet);
    if (!hasBalance) {
        console.log(chalk.yellow(`⚠️ No token balances found for swapping`));
        return;
    }

    // Shuffle pairs for randomness
    const shuffledPairs = shuffle([...CONFIG.SWAP_PAIRS]);
    
    for (const pair of shuffledPairs) {
        try {
            const result = await executeSwap(wallet, pair[0], pair[1]);
            console.log(chalk.green(`✓ Success: ${result.amountIn} ${result.tokenIn} → ${result.tokenOut}`));
            
            // Add delay between swaps
            const swapDelay = getRandomDelay();
            console.log(chalk.cyan(`⏳ Next swap in ${swapDelay/1000} seconds...`));
            await delay(swapDelay);
            
        } catch (error) {
            console.log(chalk.red(`✗ Failed to swap ${pair[0]} → ${pair[1]}: ${error.message}`));
            
            // Check if we still have MON for gas
            const monBalance = await getNativeBalance(wallet);
            if (monBalance < CONFIG.MIN_MON_BALANCE) {
                console.log(chalk.red(`‼️ Insufficient MON for gas (${monBalance.toFixed(6)} remaining)`));
                break;
            }
        }
    }
}

// ======================= MAIN FUNCTION =======================
async function main() {
    console.log(chalk.magenta(`\n🚀 Starting Swap Bot with ${WALLETS.length} wallets`));
    
    try {
        // Initial checks
        const provider = getProvider();
        const block = await provider.getBlockNumber();
        console.log(chalk.green(`✓ Connected to Monad Testnet (Block: ${block})`));

        // Shuffle wallets for randomness
        const shuffledWallets = shuffle(WALLETS);
        
        while (true) {
            for (const wallet of shuffledWallets) {
                try {
                    await executeSwapsForWallet(wallet);
                    
                    // Add delay between wallets
                    const walletDelay = getRandomDelay(10000, 20000);
                    console.log(chalk.cyan(`\n⏳ Next wallet in ${walletDelay/1000} seconds...`));
                    await delay(walletDelay);
                    
                } catch (error) {
                    console.log(chalk.red(`‼️ Critical error for wallet ${wallet.address}: ${error.message}`));
                }
            }
            
            // Add delay between full cycles
            const cycleDelay = getRandomDelay(30000, 60000);
            console.log(chalk.magenta(`\n🔁 Completed full cycle. Restarting in ${cycleDelay/1000} seconds...`));
            await delay(cycleDelay);
        }
        
    } catch (error) {
        console.log(chalk.red(`\n‼️ Critical Error: ${error.message}`));
        process.exit(1);
    }
}

main();